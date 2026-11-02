import { prisma, isDbAvailable, markDbOffline } from '@/lib/prisma'
import { loadDemoData, saveDemoData } from '@/lib/demo-storage'
import { logAudit } from '@/lib/audit'
import { UserContext, authorize, RecordNotFoundError, PermissionDeniedError } from '@/lib/rbac'
import { assertBranchAccess } from '@/lib/branch-query'
import { getEnquiryById, listEnquiries, EnquiryRecord, updateDemoEnquiryStage } from './enquiry.service'
import { transitionEnquiryStage } from './pipeline.service'
import { isOptedIn, queueOutboundMessage } from '@/services/whatsapp.service'
import { listUsers } from '@/services/user.service'

export type FollowUpChannel = 'CALL' | 'WHATSAPP' | 'VISIT'

export interface FollowUpRecord {
  id: string
  enquiryId: string
  dueAt: string
  channel: FollowUpChannel
  note?: string | null
  outcome?: string | null
  doneAt?: string | null
  doneByUserId?: string | null
  cancelledAt?: string | null
  createdByUserId: string
  createdAt: string
  isOverdue?: boolean
  childName?: string
  phone?: string
}

export interface CreateFollowUpInput {
  enquiryId: string
  dueAt: string
  channel: FollowUpChannel
  note?: string
  sendWhatsAppNow?: boolean
  branchName?: string
}

export interface MarkFollowUpDoneInput {
  followUpId: string
  outcome: string
  note?: string
  scheduleNext?: {
    dueAt: string
    channel: FollowUpChannel
    note?: string
  }
}

// In-memory demo buffer for fallback / offline test resiliency with disk persistence
let demoFollowUps: FollowUpRecord[] = loadDemoData('follow-ups', [])

export function resetDemoFollowUps(): void {
  demoFollowUps = []
  saveDemoData('follow-ups', demoFollowUps)
}

/**
 * Recomputes and sets the derived nextFollowUpAt on an enquiry (A-06).
 */
async function updateDerivedNextFollowUp(enquiryId: string): Promise<string | null> {
  let nextDate: string | null = null

  if (isDbAvailable()) {
    try {
      const openFollowUps = await prisma.enquiryFollowUp.findMany({
        where: {
          enquiryId,
          doneAt: null,
          cancelledAt: null,
        },
        orderBy: { dueAt: 'asc' },
        take: 1,
      })

      if (openFollowUps.length > 0) {
        nextDate = openFollowUps[0].dueAt.toISOString()
      }

      await prisma.enquiry.update({
        where: { id: enquiryId },
        data: { nextFollowUpAt: nextDate ? new Date(nextDate) : null },
      })
      return nextDate
    } catch {
      markDbOffline()
    }
  }

  // Fallback demo store
  const openDemo = demoFollowUps
    .filter((f) => f.enquiryId === enquiryId && !f.doneAt && !f.cancelledAt)
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())

  nextDate = openDemo[0]?.dueAt || null
  try {
    const adminUser: UserContext = { userId: 'system', loginId: 'SYS', role: 'ADMIN', branchId: null }
    const enq = await getEnquiryById(adminUser, enquiryId)
    enq.nextFollowUpAt = nextDate
  } catch {}

  return nextDate
}

/**
 * Schedules a follow-up task and optionally dispatches an approved WhatsApp follow-up template (W2-5).
 */
export async function createFollowUp(
  caller: UserContext,
  input: CreateFollowUpInput
): Promise<{ followUp: FollowUpRecord; whatsappSent?: boolean; whatsappSkippedReason?: string }> {
  authorize(caller, 'followup:manage')

  const enquiry = await getEnquiryById(caller, input.enquiryId)
  assertBranchAccess(caller, enquiry.branchId, 'Enquiry')

  if (!input.dueAt) {
    throw new Error('Due date and time is required for follow-up.')
  }

  const now = new Date().toISOString()
  const followUpId = `fu-${Date.now()}-${Math.random().toString(36).substring(7)}`

  const followUp: FollowUpRecord = {
    id: followUpId,
    enquiryId: enquiry.id,
    dueAt: new Date(input.dueAt).toISOString(),
    channel: input.channel,
    note: input.note?.trim() || null,
    outcome: null,
    doneAt: null,
    doneByUserId: null,
    cancelledAt: null,
    createdByUserId: caller.userId,
    createdAt: now,
    childName: enquiry.childName,
    phone: enquiry.phoneNormalized,
  }

  // 1. WhatsApp follow-up dispatch with strict STOP suppression (A-11, W2-5)
  let whatsappSent = false
  let whatsappSkippedReason: string | undefined = undefined

  if (input.channel === 'WHATSAPP' && input.sendWhatsAppNow) {
    // Check Phase 1 opt-out suppression by normalised phone number
    const optedIn = await isOptedIn(enquiry.phoneNormalized, enquiry.branchId)
    if (!optedIn) {
      whatsappSkippedReason = 'Phone number is suppressed in Phase 1 opt-out store (parent replied STOP).'
    } else {
      await queueOutboundMessage(caller, {
        branchId: enquiry.branchId,
        recipientPhone: enquiry.phoneNormalized,
        templateName: 'enquiry_followup',
        variables: {
          guardianName: enquiry.guardianName || 'Parent',
          childName: enquiry.childName,
          branchName: input.branchName || 'Academy Center',
        },
        relatedType: 'ADMISSION',
        relatedId: enquiry.id,
        sentById: caller.userId,
      })
      whatsappSent = true
    }
  }

  // 2. Database Write
  if (isDbAvailable()) {
    try {
      await prisma.enquiryFollowUp.create({
        data: {
          id: followUp.id,
          enquiryId: followUp.enquiryId,
          dueAt: new Date(followUp.dueAt),
          channel: followUp.channel,
          note: followUp.note,
          createdByUserId: followUp.createdByUserId,
        },
      })
    } catch {
      markDbOffline()
    }
  }

  demoFollowUps.unshift(followUp)
  saveDemoData('follow-ups', demoFollowUps)

  // 3. Update derived next follow-up on enquiry
  await updateDerivedNextFollowUp(enquiry.id)

  // 4. Audit Log
  await logAudit({
    actorId: caller.userId,
    branchId: enquiry.branchId,
    action: 'p2.followup.create',
    entityType: 'EnquiryFollowUp',
    entityId: followUp.id,
    after: {
      enquiryId: enquiry.id,
      channel: followUp.channel,
      dueAt: followUp.dueAt,
      whatsappSent,
      whatsappSkippedReason,
    },
    reason: `Scheduled ${followUp.channel} follow-up for enquiry ${enquiry.id}`,
  })

  return { followUp, whatsappSent, whatsappSkippedReason }
}

/**
 * Marks a follow-up done with an outcome and optionally schedules the next one (W2-5).
 */
export async function markFollowUpDone(
  caller: UserContext,
  input: MarkFollowUpDoneInput
): Promise<{ followUp: FollowUpRecord; nextFollowUp?: FollowUpRecord }> {
  authorize(caller, 'followup:manage')

  let followUp = demoFollowUps.find((f) => f.id === input.followUpId)

  if (isDbAvailable()) {
    try {
      const dbFu = await prisma.enquiryFollowUp.findUnique({
        where: { id: input.followUpId },
        include: { enquiry: true },
      })
      if (dbFu) {
        assertBranchAccess(caller, dbFu.enquiry.branchId, 'Enquiry')
        followUp = {
          ...dbFu,
          dueAt: dbFu.dueAt.toISOString(),
          doneAt: dbFu.doneAt?.toISOString() || null,
          cancelledAt: dbFu.cancelledAt?.toISOString() || null,
          createdAt: dbFu.createdAt.toISOString(),
        }
      }
    } catch {
      markDbOffline()
    }
  }

  if (!followUp) {
    throw new RecordNotFoundError('FollowUp')
  }

  const enquiry = await getEnquiryById(caller, followUp.enquiryId)
  assertBranchAccess(caller, enquiry.branchId, 'Enquiry')

  if (!input.outcome?.trim()) {
    throw new Error('Follow-up outcome is required.')
  }

  const now = new Date().toISOString()
  followUp.doneAt = now
  followUp.doneByUserId = caller.userId
  followUp.outcome = input.outcome.trim()
  if (input.note?.trim()) {
    followUp.note = followUp.note ? `${followUp.note}\n${input.note.trim()}` : input.note.trim()
  }
  saveDemoData('follow-ups', demoFollowUps)

  if (isDbAvailable()) {
    try {
      await prisma.enquiryFollowUp.update({
        where: { id: followUp.id },
        data: {
          doneAt: new Date(followUp.doneAt),
          doneByUserId: followUp.doneByUserId,
          outcome: followUp.outcome,
          note: followUp.note,
        },
      })
    } catch {
      markDbOffline()
    }
  }

  // If enquiry was NEW, advance it automatically to CONTACTED (W2-5)
  if (enquiry.status === 'NEW') {
    await transitionEnquiryStage(caller, {
      enquiryId: enquiry.id,
      toStatus: 'CONTACTED',
      note: `Contacted during follow-up #${followUp.id}: ${followUp.outcome}`,
    })
  }

  // Schedule next follow-up if requested
  let nextFollowUp: FollowUpRecord | undefined = undefined
  if (input.scheduleNext && input.scheduleNext.dueAt) {
    const nextRes = await createFollowUp(caller, {
      enquiryId: enquiry.id,
      dueAt: input.scheduleNext.dueAt,
      channel: input.scheduleNext.channel,
      note: input.scheduleNext.note,
    })
    nextFollowUp = nextRes.followUp
  } else {
    await updateDerivedNextFollowUp(enquiry.id)
  }

  await logAudit({
    actorId: caller.userId,
    branchId: enquiry.branchId,
    action: 'p2.followup.done',
    entityType: 'EnquiryFollowUp',
    entityId: followUp.id,
    after: {
      outcome: followUp.outcome,
      enquiryId: enquiry.id,
      nextScheduled: Boolean(nextFollowUp),
    },
    reason: `Completed follow-up for enquiry ${enquiry.id}: ${followUp.outcome}`,
  })

  return { followUp, nextFollowUp }
}

/**
 * Lists follow-ups, with support for "My follow-ups today" and overdue items (E-7, W2-5).
 */
export async function listFollowUps(
  caller: UserContext,
  filters?: {
    enquiryId?: string
    ownerId?: string
    overdueOnly?: boolean
    dueTodayOnly?: boolean
  }
): Promise<FollowUpRecord[]> {
  authorize(caller, 'followup:manage')

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)

  if (isDbAvailable()) {
    try {
      const dbWhere: Record<string, any> = {}
      if (filters?.enquiryId) dbWhere.enquiryId = filters.enquiryId
      if (caller.role !== 'ADMIN' && caller.branchId) {
        dbWhere.enquiry = { branchId: caller.branchId }
      }

      const records = await prisma.enquiryFollowUp.findMany({
        where: dbWhere,
        include: { enquiry: { select: { childName: true, phoneNormalized: true, assignedToUserId: true } } },
        orderBy: { dueAt: 'asc' },
      })

      let items: (FollowUpRecord & { assignedToUserId?: string | null })[] = records.map((f: any) => ({
        ...f,
        dueAt: f.dueAt.toISOString(),
        doneAt: f.doneAt ? f.doneAt.toISOString() : null,
        cancelledAt: f.cancelledAt ? f.cancelledAt.toISOString() : null,
        createdAt: f.createdAt.toISOString(),
        isOverdue: !f.doneAt && !f.cancelledAt && f.dueAt < now,
        childName: f.enquiry?.childName,
        phone: f.enquiry?.phoneNormalized,
        assignedToUserId: f.enquiry?.assignedToUserId,
      }))

      if (filters?.ownerId) {
        items = items.filter((i: any) => i.assignedToUserId === filters.ownerId)
      }
      if (filters?.overdueOnly) {
        items = items.filter((i: any) => i.isOverdue)
      }
      if (filters?.dueTodayOnly) {
        items = items.filter((i: any) => {
          const d = new Date(i.dueAt)
          return d >= todayStart && d <= todayEnd && !i.doneAt && !i.cancelledAt
        })
      }

      return items
    } catch {
      markDbOffline()
    }
  }

  // Filter demo items
  if (demoFollowUps.length === 0) {
    demoFollowUps = loadDemoData('follow-ups', [])
  }
  return demoFollowUps
    .filter((f) => {
      if (filters?.enquiryId && f.enquiryId !== filters.enquiryId) return false
      const dueTime = new Date(f.dueAt).getTime()
      const isOverdue = !f.doneAt && !f.cancelledAt && dueTime < now.getTime()
      f.isOverdue = isOverdue

      if (filters?.overdueOnly && !isOverdue) return false
      if (filters?.dueTodayOnly) {
        const d = new Date(f.dueAt)
        if (d < todayStart || d > todayEnd || f.doneAt || f.cancelledAt) return false
      }
      return true
    })
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
}

/**
 * Reassigns one or multiple enquiries to a target owner (E-6, W2-6).
 */
export async function reassignEnquiries(
  caller: UserContext,
  input: {
    enquiryIds: string[]
    targetUserId: string
    note?: string
  }
): Promise<{ updatedCount: number; targetUserName: string }> {
  authorize(caller, 'enquiry:assign')

  if (!input.enquiryIds || input.enquiryIds.length === 0) {
    throw new Error('At least one enquiry must be selected for reassignment.')
  }

  let targetUser: { id: string; name: string; branchId?: string | null; isActive?: boolean } | undefined

  if (isDbAvailable()) {
    try {
      const u = await prisma.user.findUnique({
        where: { id: input.targetUserId },
        select: { id: true, name: true, branchId: true, isActive: true },
      })
      if (u) targetUser = u
    } catch {
      markDbOffline()
    }
  }

  if (!targetUser) {
    const allUsers = await listUsers({ ...caller, role: 'ADMIN' })
    targetUser = allUsers.find((u) => u.id === input.targetUserId)
  }

  if (!targetUser) {
    throw new RecordNotFoundError('User')
  }

  if (targetUser.isActive === false) {
    throw new Error('Cannot assign enquiries to an inactive user.')
  }

  // Verify branch alignment
  if (caller.role !== 'ADMIN' && targetUser.branchId !== caller.branchId) {
    throw new PermissionDeniedError('Cannot reassign enquiries to a staff member outside your branch.')
  }

  // 1. Verify access and update in-memory / demo state
  const validatedEnquiries = []
  for (const id of input.enquiryIds) {
    const enq = await getEnquiryById(caller, id)
    assertBranchAccess(caller, enq.branchId, 'Enquiry')

    enq.assignedToUserId = targetUser.id
    enq.updatedAt = new Date().toISOString()
    updateDemoEnquiryStage(enq.id, { assignedToUserId: targetUser.id, updatedAt: enq.updatedAt })
    validatedEnquiries.push(enq)
  }

  // 2. Single atomic database update
  if (isDbAvailable()) {
    try {
      const allowedIds = validatedEnquiries.map((e) => e.id)
      await prisma.enquiry.updateMany({
        where: {
          id: { in: allowedIds },
          ...(caller.role !== 'ADMIN' && caller.branchId ? { branchId: caller.branchId } : {}),
        },
        data: {
          assignedToUserId: targetUser.id,
          updatedAt: new Date(),
        },
      })
    } catch {
      markDbOffline()
    }
  }

  // 3. Log audits for each reassigned enquiry
  for (const enq of validatedEnquiries) {
    await logAudit({
      actorId: caller.userId,
      branchId: enq.branchId,
      action: 'p2.enquiry.assign',
      entityType: 'Enquiry',
      entityId: enq.id,
      after: { assignedToUserId: targetUser.id, targetUserName: targetUser.name },
      reason: input.note || `Reassigned enquiry to ${targetUser.name}`,
    })
  }

  return { updatedCount: validatedEnquiries.length, targetUserName: targetUser.name }
}

/**
 * Finds open enquiries that need an owner (unassigned or owner deactivated in Phase 1) (E-11, W2-6).
 */
export async function listNeedsOwnerEnquiries(
  caller: UserContext,
  branchId?: string
): Promise<EnquiryRecord[]> {
  authorize(caller, 'enquiry:read')

  const effectiveBranchId = caller.role === 'ADMIN' ? branchId : caller.branchId
  if (caller.role !== 'ADMIN' && caller.branchId) {
    assertBranchAccess(caller, caller.branchId, 'Branch')
  }

  // Fetch all staff users to identify inactive owners
  const filterBranch = effectiveBranchId || undefined
  const allUsers = await listUsers(caller, filterBranch ? { branchId: filterBranch } : undefined)
  const inactiveUserIds = new Set(allUsers.filter((u) => !u.isActive).map((u) => u.id))

  const allEnquiries = await listEnquiries(caller, { branchId: filterBranch })

  // Open enquiries that have no owner OR whose owner is deactivated
  return allEnquiries.filter((e) => {
    if (e.status === 'CONVERTED' || e.status === 'LOST') return false
    if (!e.assignedToUserId) return true
    return inactiveUserIds.has(e.assignedToUserId)
  })
}
