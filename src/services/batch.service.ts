import { prisma, isDbAvailable, markDbOffline } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { UserContext, authorize, RecordNotFoundError, PermissionDeniedError } from '@/lib/rbac'
import { scopeBranchWhere, assertBranchAccess } from '@/lib/branch-query'
import { listBranches } from './branch.service'
import { listUsers } from './user.service'
import { loadDemoData, saveDemoData } from '@/lib/demo-storage'

export interface CreateBatchInput {
  branchId: string
  name: string
  ageGroup?: string | null
  capacity: number
  daysOfWeek: number[] // 0=Sun, 1=Mon, ..., 6=Sat
  startTime: string    // "HH:mm"
  endTime: string      // "HH:mm"
  coachId?: string     // Initial assigned primary coach
}

export interface UpdateBatchInput {
  name?: string
  ageGroup?: string | null
  capacity?: number
  daysOfWeek?: number[]
  startTime?: string
  endTime?: string
  coachId?: string
  isPrimary?: boolean
  action?: 'add_coach' | 'remove_coach' | 'replace_coach'
  removeCoachId?: string
  isActive?: boolean
}

export interface BatchSummary {
  id: string
  branchId: string
  branchName?: string
  branchCode?: string
  name: string
  ageGroup?: string | null
  capacity: number
  enrolledCount: number
  daysOfWeek: number[]
  startTime: string
  endTime: string
  isActive: boolean
  currentCoach?: {
    id: string
    name: string
    loginId: string
    isPrimary: boolean
  } | null
  coachingStaff?: {
    id: string
    name: string
    loginId?: string
    isPrimary: boolean
  }[]
  createdAt: string
}

// Initial demo store fallback
const initialDemoBatches: (BatchSummary & { assignedCoaches: { coachId: string; name: string; isPrimary: boolean; assignedFrom: string; assignedTo?: string }[] })[] = [
  {
    id: 'batch-1',
    branchId: 'branch-kkp',
    branchName: 'CPA Kukatpally',
    branchCode: 'KKP',
    name: 'Under-14 Morning',
    ageGroup: 'U14',
    capacity: 20,
    enrolledCount: 5,
    daysOfWeek: [1, 3, 5], // Mon, Wed, Fri
    startTime: '06:00',
    endTime: '08:00',
    isActive: true,
    currentCoach: {
      id: 'usr-cch-1',
      name: 'Arjun Sharma',
      loginId: 'CCH-KKP-001',
      isPrimary: true,
    },
    assignedCoaches: [
      {
        coachId: 'usr-cch-1',
        name: 'Arjun Sharma',
        isPrimary: true,
        assignedFrom: '2026-08-01',
      },
    ],
    createdAt: new Date().toISOString(),
  },
  {
    id: 'batch-2',
    branchId: 'branch-kkp',
    branchName: 'CPA Kukatpally',
    branchCode: 'KKP',
    name: 'Under-17 Evening',
    ageGroup: 'U17',
    capacity: 15,
    enrolledCount: 4,
    daysOfWeek: [2, 4, 6], // Tue, Thu, Sat
    startTime: '16:00',
    endTime: '18:00',
    isActive: true,
    currentCoach: {
      id: 'usr-cch-2',
      name: 'Vikram Patel',
      loginId: 'CCH-KKP-002',
      isPrimary: true,
    },
    assignedCoaches: [
      {
        coachId: 'usr-cch-2',
        name: 'Vikram Patel',
        isPrimary: true,
        assignedFrom: '2026-08-01',
      },
    ],
    createdAt: new Date().toISOString(),
  },
  {
    id: 'batch-3',
    branchId: 'branch-kkp',
    branchName: 'CPA Kukatpally',
    branchCode: 'KKP',
    name: 'Open Batch',
    ageGroup: 'Open',
    capacity: 25,
    enrolledCount: 2,
    daysOfWeek: [1, 2, 3, 4, 5],
    startTime: '07:00',
    endTime: '09:00',
    isActive: true,
    currentCoach: {
      id: 'usr-cch-1',
      name: 'Arjun Sharma',
      loginId: 'CCH-KKP-001',
      isPrimary: true,
    },
    assignedCoaches: [
      {
        coachId: 'usr-cch-1',
        name: 'Arjun Sharma',
        isPrimary: true,
        assignedFrom: '2026-08-01',
      },
    ],
    createdAt: new Date().toISOString(),
  },
]

// Persistent demo batches store
let demoBatches: (BatchSummary & { assignedCoaches: { coachId: string; name: string; isPrimary: boolean; assignedFrom: string; assignedTo?: string }[] })[] = loadDemoData(
  'batches',
  initialDemoBatches
)

/** Converts "HH:mm" to total minutes from midnight for overlap comparison */
function timeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number)
  return hours * 60 + minutes
}

/** Determines if two time ranges overlap */
function timeRangesOverlap(start1: string, end1: string, start2: string, end2: string): boolean {
  const s1 = timeToMinutes(start1)
  const e1 = timeToMinutes(end1)
  const s2 = timeToMinutes(start2)
  const e2 = timeToMinutes(end2)
  return s1 < e2 && s2 < e1
}

/** Checks whether a coach is already double-booked in an overlapping slot on the same days */
async function checkCoachDoubleBooking(
  coachId: string,
  daysOfWeek: number[],
  startTime: string,
  endTime: string,
  excludeBatchId?: string
): Promise<{ conflict: boolean; conflictingBatchName?: string }> {
  // Check against all active batches
  for (const batch of demoBatches) {
    if (!batch.isActive) continue
    if (excludeBatchId && batch.id === excludeBatchId) continue

    if (batch.currentCoach?.id === coachId) {
      // Check for shared days
      const sharedDays = batch.daysOfWeek.filter((d) => daysOfWeek.includes(d))
      if (sharedDays.length > 0) {
        // Check time overlap
        if (timeRangesOverlap(startTime, endTime, batch.startTime, batch.endTime)) {
          return { conflict: true, conflictingBatchName: batch.name }
        }
      }
    }
  }

  return { conflict: false }
}

export async function listBatches(
  caller: UserContext,
  branchId?: string,
  options?: { includeArchived?: boolean; onlyArchived?: boolean }
): Promise<BatchSummary[]> {
  if (isDbAvailable()) {
    try {
      const baseWhere: any = {}
      if (options?.onlyArchived) {
        baseWhere.isActive = false
      } else if (!options?.includeArchived) {
        baseWhere.isActive = true
      }

      const where = scopeBranchWhere(caller, baseWhere, branchId)

      const batches = await prisma.batch.findMany({
        where,
        orderBy: { name: 'asc' },
        include: {
          branch: { select: { id: true, code: true, name: true } },
          coaches: {
            where: { assignedTo: null },
            include: { coach: { select: { id: true, name: true, loginId: true } } },
          },
          _count: {
            select: {
              enrollments: { where: { endDate: null } },
            },
          },
        },
      })

      if (batches.length > 0) {
        return batches.map((b) => {
          const primaryCoach = b.coaches.find((c) => c.isPrimary) || b.coaches[0]
          return {
            id: b.id,
            branchId: b.branchId,
            branchName: b.branch.name,
            branchCode: b.branch.code,
            name: b.name,
            ageGroup: b.ageGroup,
            capacity: b.capacity,
            enrolledCount: b._count.enrollments,
            daysOfWeek: b.daysOfWeek,
            startTime: b.startTime,
            endTime: b.endTime,
            isActive: b.isActive,
            currentCoach: primaryCoach
              ? {
                  id: primaryCoach.coach.id,
                  name: primaryCoach.coach.name,
                  loginId: primaryCoach.coach.loginId,
                  isPrimary: primaryCoach.isPrimary,
                }
              : null,
            coachingStaff: b.coaches.map((c) => ({
              id: c.coach.id,
              name: c.coach.name,
              loginId: c.coach.loginId,
              isPrimary: c.isPrimary,
            })),
            createdAt: b.createdAt.toISOString(),
          }
        })
      }
    } catch {
      markDbOffline()
    }
  }

  return demoBatches
    .filter((b) => {
      if (caller.role !== 'ADMIN' && b.branchId !== caller.branchId) return false
      if (branchId && b.branchId !== branchId) return false
      if (options?.onlyArchived) {
        if (b.isActive !== false) return false
      } else if (!options?.includeArchived) {
        if (b.isActive === false) return false
      }
      return true
    })
    .map((b) => {
      const activeStaff = (b.assignedCoaches || [])
        .filter((c) => !c.assignedTo)
        .map((c) => ({
          id: c.coachId,
          name: c.name,
          isPrimary: c.isPrimary,
        }))
      return {
        ...b,
        coachingStaff: activeStaff,
      }
    })
}

export async function getBatchById(caller: UserContext, batchId: string): Promise<BatchSummary> {
  const batches = await listBatches(caller)
  const batch = batches.find((b) => b.id === batchId)
  if (!batch) {
    throw new RecordNotFoundError('Batch')
  }
  return batch
}

export async function createBatch(
  caller: UserContext,
  input: CreateBatchInput
): Promise<BatchSummary> {
  const branches = await listBranches(caller)
  const branch = branches.find((b) => b.id === input.branchId)
  if (!branch) {
    throw new RecordNotFoundError('Branch')
  }

  // Permission: Franchise managers view-only!
  authorize(caller, 'batch:create', branch.type)
  assertBranchAccess(caller, branch.id, 'Branch')

  // Validation
  if (input.capacity <= 0) {
    throw new Error('Batch capacity must be greater than zero')
  }
  if (!input.daysOfWeek || input.daysOfWeek.length === 0) {
    throw new Error('At least one day of the week must be selected')
  }
  if (timeToMinutes(input.startTime) >= timeToMinutes(input.endTime)) {
    throw new Error('Batch start time must be before end time')
  }

  // Coach double-booking check
  let coachInfo = null
  if (input.coachId) {
    const doubleBooking = await checkCoachDoubleBooking(
      input.coachId,
      input.daysOfWeek,
      input.startTime,
      input.endTime
    )

    if (doubleBooking.conflict) {
      throw new Error(
        `Coach double-booking conflict: This coach is already assigned to overlapping batch "${doubleBooking.conflictingBatchName}"`
      )
    }

    const users = await listUsers(caller, { role: 'COACH', branchId: input.branchId })
    let coach = users.find((u) => u.id === input.coachId)
    if (!coach) {
      const allCoaches = await listUsers(caller, { role: 'COACH' })
      coach = allCoaches.find((u) => u.id === input.coachId)
    }
    if (coach) {
      coachInfo = {
        id: coach.id,
        name: coach.name,
        loginId: coach.loginId,
        isPrimary: true,
      }
    }
  }

  const newBatch: BatchSummary = {
    id: `batch-${Date.now()}`,
    branchId: branch.id,
    branchName: branch.name,
    branchCode: branch.code,
    name: input.name.trim(),
    ageGroup: input.ageGroup || null,
    capacity: input.capacity,
    enrolledCount: 0,
    daysOfWeek: input.daysOfWeek,
    startTime: input.startTime,
    endTime: input.endTime,
    isActive: true,
    currentCoach: coachInfo,
    createdAt: new Date().toISOString(),
  }

  try {
    const created = await prisma.batch.create({
      data: {
        branchId: branch.id,
        name: input.name.trim(),
        ageGroup: input.ageGroup || null,
        capacity: input.capacity,
        daysOfWeek: input.daysOfWeek,
        startTime: input.startTime,
        endTime: input.endTime,
        isActive: true,
      },
    })

    if (input.coachId) {
      await prisma.batchCoach.create({
        data: {
          batchId: created.id,
          coachId: input.coachId,
          isPrimary: true,
          assignedFrom: new Date(),
        },
      })
    }
  } catch {
    // Save to demo store
  }

  demoBatches.push({
    ...newBatch,
    assignedCoaches: coachInfo
      ? [
          {
            coachId: coachInfo.id,
            name: coachInfo.name,
            isPrimary: true,
            assignedFrom: new Date().toISOString().split('T')[0],
          },
        ]
      : [],
  })

  saveDemoData('batches', demoBatches)

  await logAudit({
    actorId: caller.userId,
    branchId: branch.id,
    action: 'batch.create',
    entityType: 'Batch',
    entityId: newBatch.id,
    after: { name: newBatch.name, capacity: newBatch.capacity, startTime: newBatch.startTime, endTime: newBatch.endTime },
    reason: `Created batch ${newBatch.name} at ${branch.name}`,
  })

  return newBatch
}

export async function updateBatch(
  caller: UserContext,
  batchId: string,
  input: UpdateBatchInput
): Promise<BatchSummary> {
  const existing = demoBatches.find((b) => b.id === batchId)
  if (!existing) {
    throw new RecordNotFoundError('Batch')
  }

  const branches = await listBranches(caller)
  const branch = branches.find((b) => b.id === existing.branchId)
  const branchType = branch?.type || 'OWNED'

  // Permission: Franchise managers view-only!
  authorize(caller, 'batch:edit', branchType)
  assertBranchAccess(caller, existing.branchId, 'Batch')

  const updatedStartTime = input.startTime ?? existing.startTime
  const updatedEndTime = input.endTime ?? existing.endTime
  const updatedDays = input.daysOfWeek ?? existing.daysOfWeek

  if (timeToMinutes(updatedStartTime) >= timeToMinutes(updatedEndTime)) {
    throw new Error('Batch start time must be before end time')
  }

  // Handle coach reassignment / double-booking
  const targetCoachId = input.coachId ?? existing.currentCoach?.id
  if (targetCoachId) {
    const doubleBooking = await checkCoachDoubleBooking(
      targetCoachId,
      updatedDays,
      updatedStartTime,
      updatedEndTime,
      batchId // exclude current batch
    )

    if (doubleBooking.conflict) {
      throw new Error(
        `Coach double-booking conflict: Coach is already assigned to overlapping batch "${doubleBooking.conflictingBatchName}"`
      )
    }
  }

  // Handle coaching staff management (assign / add / remove)
  let coachInfo = existing.currentCoach
  const today = new Date().toISOString().split('T')[0]

  if (!existing.assignedCoaches) {
    existing.assignedCoaches = []
  }

  if (input.action === 'remove_coach' && input.removeCoachId) {
    const assignment = existing.assignedCoaches.find(
      (c) => c.coachId === input.removeCoachId && !c.assignedTo
    )
    if (assignment) {
      assignment.assignedTo = today
    }
    const remainingActive = existing.assignedCoaches.filter((c) => !c.assignedTo)
    if (existing.currentCoach?.id === input.removeCoachId) {
      if (remainingActive.length > 0) {
        remainingActive[0].isPrimary = true
        coachInfo = {
          id: remainingActive[0].coachId,
          name: remainingActive[0].name,
          loginId: '',
          isPrimary: true,
        }
      } else {
        coachInfo = null
      }
    }
  } else if (input.coachId) {
    const coaches = await listUsers(caller, { role: 'COACH', branchId: existing.branchId })
    let newCoach = coaches.find((c) => c.id === input.coachId)
    if (!newCoach) {
      const allCoaches = await listUsers(caller, { role: 'COACH' })
      newCoach = allCoaches.find((c) => c.id === input.coachId)
    }

    if (newCoach) {
      // Only close existing primary if explicitly requested as replace_coach
      if (input.action === 'replace_coach') {
        const oldAssignment = existing.assignedCoaches.find(
          (c) => c.coachId === existing.currentCoach?.id && !c.assignedTo
        )
        if (oldAssignment) {
          oldAssignment.assignedTo = today
        }
      }

      // Preserve existing coaches: add to coaching staff if not already active
      const alreadyActive = existing.assignedCoaches.find(
        (c) => c.coachId === newCoach!.id && !c.assignedTo
      )
      if (!alreadyActive) {
        const isPrimary = input.isPrimary ?? (existing.assignedCoaches.filter((c) => !c.assignedTo).length === 0)
        existing.assignedCoaches.push({
          coachId: newCoach.id,
          name: newCoach.name,
          isPrimary,
          assignedFrom: today,
        })
      }

      // Set primary coach if requested or if none exists
      if (input.isPrimary !== false || !existing.currentCoach) {
        existing.assignedCoaches.forEach((c) => {
          if (!c.assignedTo) {
            c.isPrimary = c.coachId === newCoach!.id
          }
        })
        coachInfo = {
          id: newCoach.id,
          name: newCoach.name,
          loginId: newCoach.loginId,
          isPrimary: true,
        }
      }
    }
  }

  // Apply updates
  if (input.name) existing.name = input.name.trim()
  if (input.capacity) existing.capacity = input.capacity
  if (input.ageGroup !== undefined) existing.ageGroup = input.ageGroup
  existing.daysOfWeek = updatedDays
  existing.startTime = updatedStartTime
  existing.endTime = updatedEndTime
  existing.currentCoach = coachInfo
  if (input.isActive !== undefined) existing.isActive = input.isActive

  saveDemoData('batches', demoBatches)

  await logAudit({
    actorId: caller.userId,
    branchId: existing.branchId,
    action: 'batch.edit',
    entityType: 'Batch',
    entityId: existing.id,
    after: { name: existing.name, coachId: existing.currentCoach?.id, capacity: existing.capacity },
    reason: `Updated batch ${existing.name}`,
  })

  const activeStaff = (existing.assignedCoaches || [])
    .filter((c) => !c.assignedTo)
    .map((c) => ({
      id: c.coachId,
      name: c.name,
      isPrimary: c.isPrimary,
    }))

  return {
    ...existing,
    coachingStaff: activeStaff,
  }
}

export function setBatchEnrolledCount(batchId: string, count: number): void {
  const b = demoBatches.find((item) => item.id === batchId)
  if (b) {
    b.enrolledCount = count
    saveDemoData('batches', demoBatches)
  }
}

export async function deleteBatch(
  caller: UserContext,
  batchId: string
): Promise<{ success: boolean; message: string; action: 'archived' | 'deleted' }> {
  authorize(caller, 'batch:delete', caller.branchType)

  let batchName = batchId
  let batchBranchId = ''
  if (isDbAvailable()) {
    try {
      const existing = await prisma.batch.findUnique({
        where: { id: batchId },
        include: {
          _count: {
            select: {
              enrollments: { where: { endDate: null } },
            },
          },
        },
      })
      if (!existing) {
        throw new RecordNotFoundError('Batch')
      }

      // Check manager's branch scope
      assertBranchAccess(caller, existing.branchId, 'Batch')

      batchName = existing.name
      batchBranchId = existing.branchId

      // Requirement: Do not allow deletion of active batches with currently enrolled students
      if (existing._count.enrollments > 0) {
        const count = existing._count.enrollments
        throw new Error(
          `Cannot delete batch "${batchName}" because it has ${count} actively enrolled cadet(s). Please transfer or remove students before deleting this batch.`
        )
      }

      // Safe archival (soft delete) to preserve historical records, attendance, and coach history
      await prisma.batch.update({
        where: { id: batchId },
        data: { isActive: false },
      })

      await logAudit({
        actorId: caller.userId,
        branchId: batchBranchId,
        action: 'batch.archive',
        entityType: 'Batch',
        entityId: batchId,
        before: { isActive: true },
        after: { isActive: false },
        reason: `Batch ${batchName} archived by ${caller.role}`,
      })

      return {
        success: true,
        action: 'archived',
        message: `Batch "${batchName}" has been safely archived. Historical attendance and records have been preserved.`,
      }
    } catch (err: any) {
      if (err instanceof RecordNotFoundError || err.message?.startsWith('Cannot delete batch')) {
        throw err
      }
      markDbOffline()
    }
  }

  // Demo fallback
  const targets = demoBatches.filter((b) => b.id === batchId)
  if (targets.length === 0) {
    throw new RecordNotFoundError('Batch')
  }
  const target = targets[0]

  // Assert branch access (Managers strictly cannot delete other branch batches)
  assertBranchAccess(caller, target.branchId, 'Batch')

  batchName = target.name
  batchBranchId = target.branchId

  if (target.enrolledCount > 0) {
    throw new Error(
      `Cannot delete batch "${batchName}" because it has ${target.enrolledCount} actively enrolled cadet(s). Please transfer or remove students before deleting this batch.`
    )
  }

  demoBatches.forEach((b) => {
    if (b.id === batchId) {
      b.isActive = false
    }
  })
  saveDemoData('batches', demoBatches)

  await logAudit({
    actorId: caller.userId,
    branchId: batchBranchId,
    action: 'batch.archive',
    entityType: 'Batch',
    entityId: batchId,
    before: { isActive: true },
    after: { isActive: false },
    reason: `Batch ${batchName} archived by ${caller.role}`,
  })

  return {
    success: true,
    action: 'archived',
    message: `Batch "${batchName}" has been safely archived. Historical attendance and records have been preserved.`,
  }
}

export async function restoreBatch(
  caller: UserContext,
  batchId: string
): Promise<{ success: boolean; message: string; batch: BatchSummary }> {
  authorize(caller, 'batch:restore', caller.branchType)

  let restoredBatch: BatchSummary | undefined
  if (isDbAvailable()) {
    try {
      const existing = await prisma.batch.findUnique({
        where: { id: batchId },
        include: {
          branch: { select: { id: true, code: true, name: true } },
          coaches: {
            where: { assignedTo: null },
            include: { coach: { select: { id: true, name: true, loginId: true } } },
          },
          _count: {
            select: {
              enrollments: { where: { endDate: null } },
            },
          },
        },
      })
      if (!existing) {
        throw new RecordNotFoundError('Batch')
      }

      assertBranchAccess(caller, existing.branchId, 'Batch')

      const updated = await prisma.batch.update({
        where: { id: batchId },
        data: { isActive: true },
        include: {
          branch: { select: { id: true, code: true, name: true } },
          coaches: {
            where: { assignedTo: null },
            include: { coach: { select: { id: true, name: true, loginId: true } } },
          },
          _count: {
            select: {
              enrollments: { where: { endDate: null } },
            },
          },
        },
      })

      const primaryCoach = updated.coaches.find((c) => c.isPrimary) || updated.coaches[0]
      restoredBatch = {
        id: updated.id,
        branchId: updated.branchId,
        branchName: updated.branch.name,
        branchCode: updated.branch.code,
        name: updated.name,
        ageGroup: updated.ageGroup,
        capacity: updated.capacity,
        enrolledCount: updated._count.enrollments,
        daysOfWeek: updated.daysOfWeek,
        startTime: updated.startTime,
        endTime: updated.endTime,
        isActive: updated.isActive,
        currentCoach: primaryCoach
          ? {
              id: primaryCoach.coach.id,
              name: primaryCoach.coach.name,
              loginId: primaryCoach.coach.loginId,
              isPrimary: primaryCoach.isPrimary,
            }
          : null,
        coachingStaff: updated.coaches.map((c) => ({
          id: c.coach.id,
          name: c.coach.name,
          loginId: c.coach.loginId,
          isPrimary: c.isPrimary,
        })),
        createdAt: updated.createdAt.toISOString(),
      }

      await logAudit({
        actorId: caller.userId,
        branchId: updated.branchId,
        action: 'batch.restore',
        entityType: 'Batch',
        entityId: batchId,
        before: { isActive: false },
        after: { isActive: true },
        reason: `Batch ${updated.name} restored by ${caller.role}`,
      })

      return {
        success: true,
        message: `Batch "${updated.name}" has been restored successfully.`,
        batch: restoredBatch,
      }
    } catch (err: any) {
      if (err instanceof RecordNotFoundError) throw err
      markDbOffline()
    }
  }

  const targets = demoBatches.filter((b) => b.id === batchId)
  if (targets.length === 0) {
    throw new RecordNotFoundError('Batch')
  }
  const target = targets[0]

  assertBranchAccess(caller, target.branchId, 'Batch')

  demoBatches.forEach((b) => {
    if (b.id === batchId) {
      b.isActive = true
    }
  })
  saveDemoData('batches', demoBatches)

  await logAudit({
    actorId: caller.userId,
    branchId: target.branchId,
    action: 'batch.restore',
    entityType: 'Batch',
    entityId: batchId,
    before: { isActive: false },
    after: { isActive: true },
    reason: `Batch ${target.name} restored by ${caller.role}`,
  })

  return {
    success: true,
    message: `Batch "${target.name}" has been restored successfully.`,
    batch: target,
  }
}

