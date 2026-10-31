import { prisma, isDbAvailable, markDbOffline } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { UserContext, authorize, RecordNotFoundError, PermissionDeniedError } from '@/lib/rbac'
import { assertBranchAccess } from '@/lib/branch-query'
import { getStudentById } from './student.service'

export type FeeFrequency = 'ONE_TIME' | 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY'
export type DueStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'WAIVED' | 'OVERDUE'

export interface FeePlanRecord {
  id: string
  branchId?: string | null
  name: string
  amountPaise: number
  frequency: FeeFrequency
  isActive: boolean
  createdAt: string
}

export interface StudentFeePlanRecord {
  id: string
  studentId: string
  feePlanId: string
  feePlanName: string
  startDate: string
  endDate?: string | null
  amountOverridePaise?: number | null
  createdAt: string
}

export interface FeeDueRecord {
  id: string
  branchId: string
  studentId: string
  studentName?: string
  studentCode?: string
  feePlanId: string
  studentFeePlanId?: string | null
  label: string
  periodStart: string
  periodEnd?: string | null
  dueDate: string
  amountPaise: number
  paidPaise: number
  status: DueStatus
  remindersPausedUntil?: string | null
  pauseReason?: string | null
  waivedAt?: string | null
  waiveNote?: string | null
  createdAt: string
}

// In-memory demo store
let demoFeePlans: FeePlanRecord[] = [
  {
    id: 'plan-1',
    branchId: null, // Global plan
    name: 'Monthly Academy Training',
    amountPaise: 250000, // ₹2,500
    frequency: 'MONTHLY',
    isActive: true,
    createdAt: '2026-08-01T00:00:00.000Z',
  },
  {
    id: 'plan-2',
    branchId: null, // Global plan
    name: 'Admission Kit Fee',
    amountPaise: 150000, // ₹1,500
    frequency: 'ONE_TIME',
    isActive: true,
    createdAt: '2026-08-01T00:00:00.000Z',
  },
  {
    id: 'plan-3',
    branchId: null, // Global plan
    name: 'Quarterly Elite Training',
    amountPaise: 700000, // ₹7,000
    frequency: 'QUARTERLY',
    isActive: true,
    createdAt: '2026-08-01T00:00:00.000Z',
  },
]

let demoStudentPlans: StudentFeePlanRecord[] = [
  {
    id: 'sfp-1',
    studentId: 'std-1',
    feePlanId: 'plan-1',
    feePlanName: 'Monthly Academy Training',
    startDate: '2026-08-01',
    endDate: null,
    amountOverridePaise: null,
    createdAt: '2026-08-01T00:00:00.000Z',
  },
  {
    id: 'sfp-2',
    studentId: 'std-2',
    feePlanId: 'plan-1',
    feePlanName: 'Monthly Academy Training',
    startDate: '2026-08-01',
    endDate: null,
    amountOverridePaise: null,
    createdAt: '2026-08-01T00:00:00.000Z',
  },
]

export let demoFeeDues: FeeDueRecord[] = [
  {
    id: 'due-1',
    branchId: 'branch-kkp',
    studentId: 'std-1',
    studentName: 'Aditya Sharma',
    studentCode: 'KKP-000001',
    feePlanId: 'plan-1',
    studentFeePlanId: 'sfp-1',
    label: 'November 2026 Monthly Fee',
    periodStart: '2026-11-01',
    periodEnd: '2026-11-30',
    dueDate: '2026-11-05',
    amountPaise: 250000,
    paidPaise: 0,
    status: 'UNPAID',
    createdAt: '2026-10-25T00:00:00.000Z',
  },
  {
    id: 'due-2',
    branchId: 'branch-kkp',
    studentId: 'std-2',
    studentName: 'Rahul Verma',
    studentCode: 'KKP-000002',
    feePlanId: 'plan-1',
    studentFeePlanId: 'sfp-2',
    label: 'October 2026 Monthly Fee',
    periodStart: '2026-10-01',
    periodEnd: '2026-10-31',
    dueDate: '2026-10-05',
    amountPaise: 250000,
    paidPaise: 0,
    status: 'OVERDUE',
    createdAt: '2026-09-25T00:00:00.000Z',
  },
]

/**
 * Lists fee plans (global plans plus branch overrides).
 */
export async function listFeePlans(caller: UserContext, branchId?: string): Promise<FeePlanRecord[]> {
  authorize(caller, 'fee:view')

  if (isDbAvailable()) {
    try {
      const plans = await prisma.feePlan.findMany({
        where: {
          isActive: true,
          OR: [
            { branchId: null },
            ...(branchId ? [{ branchId }] : caller.branchId ? [{ branchId: caller.branchId }] : []),
          ],
        },
        orderBy: { amountPaise: 'asc' },
      })

      if (plans.length > 0) {
        return plans.map((p) => ({
          id: p.id,
          branchId: p.branchId,
          name: p.name,
          amountPaise: p.amountPaise,
          frequency: p.frequency as any,
          isActive: p.isActive,
          createdAt: p.createdAt.toISOString(),
        }))
      }
    } catch {
      markDbOffline()
    }
  }

  return demoFeePlans.filter((p) => {
    if (!p.isActive) return false
    if (!p.branchId) return true
    if (branchId && p.branchId === branchId) return true
    if (caller.branchId && p.branchId === caller.branchId) return true
    return caller.role === 'ADMIN'
  })
}

/**
 * Creates a new Fee Plan (Admin only).
 */
export async function createFeePlan(
  caller: UserContext,
  input: {
    name: string
    amountPaise: number
    frequency: FeeFrequency
    branchId?: string | null
  }
): Promise<FeePlanRecord> {
  if (caller.role !== 'ADMIN') {
    throw new PermissionDeniedError('Only academy administrators can create global fee plans.')
  }

  if (!input.name || input.name.trim().length < 3) {
    throw new Error('Plan name must be at least 3 characters.')
  }

  if (!input.amountPaise || input.amountPaise <= 0) {
    throw new Error('Plan amount must be greater than zero.')
  }

  const newPlan: FeePlanRecord = {
    id: `plan-${Date.now()}`,
    branchId: input.branchId || null,
    name: input.name.trim(),
    amountPaise: input.amountPaise,
    frequency: input.frequency,
    isActive: true,
    createdAt: new Date().toISOString(),
  }

  try {
    await prisma.feePlan.create({
      data: {
        id: newPlan.id,
        branchId: newPlan.branchId,
        name: newPlan.name,
        amountPaise: newPlan.amountPaise,
        frequency: newPlan.frequency as any,
        isActive: true,
      },
    })
  } catch {}

  demoFeePlans.push(newPlan)

  await logAudit({
    actorId: caller.userId,
    branchId: input.branchId || null,
    action: 'fee_plan.create',
    entityType: 'FeePlan',
    entityId: newPlan.id,
    after: { name: newPlan.name, amountPaise: newPlan.amountPaise, frequency: newPlan.frequency },
    reason: `Created fee plan ${newPlan.name} (₹${(newPlan.amountPaise / 100).toLocaleString()})`,
  })

  return newPlan
}

/**
 * Assigns a fee plan to a student and automatically generates the first scheduled due.
 * Prevents duplicate dues via unique period constraints.
 */
export async function assignStudentFeePlan(
  caller: UserContext,
  input: {
    studentId: string
    feePlanId: string
    startDate: string // YYYY-MM-DD
    amountOverridePaise?: number | null
  }
): Promise<{ studentFeePlan: StudentFeePlanRecord; due: FeeDueRecord }> {
  authorize(caller, 'fee:view')

  const student = await getStudentById(caller, input.studentId)
  assertBranchAccess(caller, student.branchId, 'Student')

  const plans = await listFeePlans(caller, student.branchId)
  const plan = plans.find((p) => p.id === input.feePlanId)
  if (!plan) {
    throw new RecordNotFoundError('FeePlan')
  }

  const studentPlan: StudentFeePlanRecord = {
    id: `sfp-${Date.now()}`,
    studentId: student.id,
    feePlanId: plan.id,
    feePlanName: plan.name,
    startDate: input.startDate,
    endDate: null,
    amountOverridePaise: input.amountOverridePaise || null,
    createdAt: new Date().toISOString(),
  }
  demoStudentPlans.push(studentPlan)

  const effectiveAmount = input.amountOverridePaise || plan.amountPaise
  const startParts = input.startDate.split('-')
  const periodStart = `${startParts[0]}-${startParts[1]}-01`
  const dueDate = `${startParts[0]}-${startParts[1]}-05` // Due by 5th

  // Check if due already exists for this student and period (DATABASE-DESIGN.md @@unique([studentFeePlanId, periodStart]))
  const existingDue = demoFeeDues.find(
    (d) => d.studentId === student.id && d.periodStart === periodStart && d.feePlanId === plan.id
  )

  let generatedDue: FeeDueRecord

  if (existingDue) {
    generatedDue = existingDue
  } else {
    generatedDue = {
      id: `due-${Date.now()}`,
      branchId: student.branchId,
      studentId: student.id,
      studentName: student.name,
      studentCode: student.studentCode,
      feePlanId: plan.id,
      studentFeePlanId: studentPlan.id,
      label: `${plan.name} (${input.startDate})`,
      periodStart,
      periodEnd: `${startParts[0]}-${startParts[1]}-28`,
      dueDate,
      amountPaise: effectiveAmount,
      paidPaise: 0,
      status: 'UNPAID',
      createdAt: new Date().toISOString(),
    }
    demoFeeDues.push(generatedDue)
  }

  await logAudit({
    actorId: caller.userId,
    branchId: student.branchId,
    action: 'fee.assign_plan',
    entityType: 'StudentFeePlan',
    entityId: studentPlan.id,
    after: {
      studentId: student.id,
      planId: plan.id,
      startDate: input.startDate,
      amountPaise: effectiveAmount,
    },
    reason: `Assigned ${plan.name} to ${student.name} (${student.studentCode})`,
  })

  return { studentFeePlan: studentPlan, due: generatedDue }
}

/**
 * Lists dues for a student with dynamic status resolution (Paid, Partial, Due, Overdue, Waived).
 * STRICT: Coaches are forbidden from accessing fee data (AUTH-AND-PERMISSIONS.md § 8.3).
 */
export async function listStudentDues(
  caller: UserContext,
  studentId: string
): Promise<FeeDueRecord[]> {
  authorize(caller, 'fee:view')

  const student = await getStudentById(caller, studentId)
  assertBranchAccess(caller, student.branchId, 'Student')

  const todayStr = new Date().toISOString().split('T')[0]

  if (isDbAvailable()) {
    try {
      const dues = await prisma.feeDue.findMany({
        where: { studentId },
        orderBy: { dueDate: 'asc' },
      })

      if (dues.length > 0) {
        return dues.map((d) => {
          let status: DueStatus = d.status as any
          if (d.status !== 'WAIVED') {
            if (d.paidPaise >= d.amountPaise) status = 'PAID'
            else if (d.paidPaise > 0) status = 'PARTIAL'
            else if (d.dueDate.toISOString().split('T')[0] < todayStr) status = 'OVERDUE'
            else status = 'UNPAID'
          }
          return {
            id: d.id,
            branchId: d.branchId,
            studentId: d.studentId,
            feePlanId: d.feePlanId,
            studentFeePlanId: d.studentFeePlanId,
            label: d.label,
            periodStart: d.periodStart.toISOString().split('T')[0],
            periodEnd: d.periodEnd?.toISOString().split('T')[0] || null,
            dueDate: d.dueDate.toISOString().split('T')[0],
            amountPaise: d.amountPaise,
            paidPaise: d.paidPaise,
            status,
            remindersPausedUntil: d.remindersPausedUntil?.toISOString() || null,
            pauseReason: d.pauseReason,
            waivedAt: d.waivedAt?.toISOString() || null,
            waiveNote: d.waiveNote,
            createdAt: d.createdAt.toISOString(),
          }
        })
      }
    } catch {
      markDbOffline()
    }
  }

  return demoFeeDues
    .filter((d) => d.studentId === studentId)
    .map((d) => {
      let resolvedStatus = d.status
      if (d.status !== 'WAIVED') {
        if (d.paidPaise >= d.amountPaise) resolvedStatus = 'PAID'
        else if (d.paidPaise > 0) resolvedStatus = 'PARTIAL'
        else if (d.dueDate < todayStr) resolvedStatus = 'OVERDUE'
        else resolvedStatus = 'UNPAID'
      }
      return { ...d, status: resolvedStatus }
    })
}

/**
 * Pauses automated fee reminders for a due (WORKFLOWS.md § 5).
 * Mandatory manager reason is required for audit.
 */
export async function pauseDueReminders(
  caller: UserContext,
  dueId: string,
  pauseUntil: string,
  reason: string
): Promise<FeeDueRecord> {
  authorize(caller, 'fee:view')

  if (!reason || reason.trim().length < 5) {
    throw new Error('A detailed reason (minimum 5 characters) is required to pause fee reminders.')
  }

  const due = demoFeeDues.find((d) => d.id === dueId)
  if (!due) {
    throw new RecordNotFoundError('FeeDue')
  }

  assertBranchAccess(caller, due.branchId, 'FeeDue')

  due.remindersPausedUntil = pauseUntil
  due.pauseReason = reason.trim()

  await logAudit({
    actorId: caller.userId,
    branchId: due.branchId,
    action: 'fee.pause_reminders',
    entityType: 'FeeDue',
    entityId: due.id,
    after: { pauseUntil, reason: due.pauseReason },
    reason: `Paused fee reminders for ${due.label} until ${pauseUntil}: ${due.pauseReason}`,
  })

  return due
}

/**
 * Waives a fee due (Admin or Manager with note).
 */
export async function waiveDue(
  caller: UserContext,
  dueId: string,
  note: string
): Promise<FeeDueRecord> {
  authorize(caller, 'fee:view')

  if (!note || note.trim().length < 5) {
    throw new Error('A justification note (minimum 5 characters) is mandatory to waive a due.')
  }

  const due = demoFeeDues.find((d) => d.id === dueId)
  if (!due) {
    throw new RecordNotFoundError('FeeDue')
  }

  assertBranchAccess(caller, due.branchId, 'FeeDue')

  due.status = 'WAIVED'
  due.waivedAt = new Date().toISOString()
  due.waiveNote = note.trim()

  await logAudit({
    actorId: caller.userId,
    branchId: due.branchId,
    action: 'fee.waive_due',
    entityType: 'FeeDue',
    entityId: due.id,
    after: { status: 'WAIVED', note: due.waiveNote },
    reason: `Waived fee due ${due.label} (₹${(due.amountPaise / 100).toLocaleString()}): ${due.waiveNote}`,
  })

  return due
}

/**
 * Applies a payment amount to a fee due and updates its paid status and database record.
 */
export async function applyDuePayment(
  dueId: string,
  amountPaise: number
): Promise<{ paidPaise: number; status: DueStatus }> {
  if (isDbAvailable()) {
    try {
      const d = await prisma.feeDue.findUnique({ where: { id: dueId } })
      if (d) {
        const newPaid = d.paidPaise + amountPaise
        const newStatus: DueStatus = newPaid >= d.amountPaise ? 'PAID' : 'PARTIAL'
        await prisma.feeDue.update({
          where: { id: dueId },
          data: {
            paidPaise: newPaid,
            status: newStatus as any,
          },
        })
        return { paidPaise: newPaid, status: newStatus }
      }
    } catch {
      markDbOffline()
    }
  }

  const due = demoFeeDues.find((d) => d.id === dueId)
  if (due) {
    due.paidPaise = (due.paidPaise || 0) + amountPaise
    if (due.paidPaise >= due.amountPaise) due.status = 'PAID'
    else due.status = 'PARTIAL'
    return { paidPaise: due.paidPaise, status: due.status }
  }

  return { paidPaise: amountPaise, status: 'PARTIAL' }
}

/**
 * Reverts an allocated payment from a fee due.
 */
export async function revertDuePayment(
  dueId: string,
  amountPaise: number
): Promise<{ paidPaise: number; status: DueStatus }> {
  if (isDbAvailable()) {
    try {
      const d = await prisma.feeDue.findUnique({ where: { id: dueId } })
      if (d) {
        const newPaid = Math.max(0, d.paidPaise - amountPaise)
        const newStatus: DueStatus = newPaid === 0 ? 'UNPAID' : newPaid < d.amountPaise ? 'PARTIAL' : 'PAID'
        await prisma.feeDue.update({
          where: { id: dueId },
          data: {
            paidPaise: newPaid,
            status: newStatus as any,
          },
        })
        return { paidPaise: newPaid, status: newStatus }
      }
    } catch {
      markDbOffline()
    }
  }

  const due = demoFeeDues.find((d) => d.id === dueId)
  if (due) {
    due.paidPaise = Math.max(0, (due.paidPaise || 0) - amountPaise)
    if (due.paidPaise === 0) due.status = 'UNPAID'
    else if (due.paidPaise < due.amountPaise) due.status = 'PARTIAL'
    else due.status = 'PAID'
    return { paidPaise: due.paidPaise, status: due.status }
  }

  return { paidPaise: 0, status: 'UNPAID' }
}

