import { prisma, isDbAvailable, markDbOffline } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { UserContext, authorize, RecordNotFoundError, SecurityError } from '@/lib/rbac'
import { assertBranchAccess } from '@/lib/branch-query'
import { EnquiryStatus, EnquiryRecord, getEnquiryById, listEnquiries, updateDemoEnquiryStage } from './enquiry.service'
import { isValidLostReason } from './lost-reasons'

export class VersionConflictError extends SecurityError {
  public override statusCode = 409
  constructor(message = 'Record has been modified by another user. Please refresh and try again.') {
    super(message, 409)
    this.name = 'VersionConflictError'
    this.statusCode = 409
  }
}

export class InvalidStageTransitionError extends SecurityError {
  public override statusCode = 400
  constructor(from: EnquiryStatus, to: EnquiryStatus) {
    super(`Invalid stage transition from ${from} to ${to}.`, 400)
    this.name = 'InvalidStageTransitionError'
    this.statusCode = 400
  }
}

/**
 * Allowed Stage Transitions Matrix (A-05, W2-4)
 */
export const ALLOWED_TRANSITIONS: Record<EnquiryStatus, EnquiryStatus[]> = {
  NEW: ['CONTACTED', 'TRIAL_SCHEDULED', 'LOST'],
  CONTACTED: ['TRIAL_SCHEDULED', 'LOST', 'NEW'], // NEW is undo
  TRIAL_SCHEDULED: ['TRIAL_DONE', 'CONTACTED', 'LOST'], // CONTACTED is trial cancelled
  TRIAL_DONE: ['CONVERTED', 'CONTACTED', 'LOST'],
  LOST: ['NEW', 'CONTACTED'], // Reopen
  CONVERTED: [], // Terminal
}

export function isValidTransition(from: EnquiryStatus, to: EnquiryStatus): boolean {
  if (from === to) return true
  const allowed = ALLOWED_TRANSITIONS[from] || []
  return allowed.includes(to)
}

export interface TransitionStageInput {
  enquiryId: string
  toStatus: EnquiryStatus
  expectedVersion?: number
  lostReasonId?: string
  lostNote?: string
  note?: string
}

export interface PipelineBoardColumn {
  status: EnquiryStatus
  label: string
  count: number
  items: EnquiryRecord[]
}

export interface PipelineBoardResult {
  branchId?: string
  totalCount: number
  columns: Record<EnquiryStatus, PipelineBoardColumn>
}

const STAGE_LABELS: Record<EnquiryStatus, string> = {
  NEW: 'New Enquiries',
  CONTACTED: 'Contacted',
  TRIAL_SCHEDULED: 'Trial Scheduled',
  TRIAL_DONE: 'Trial Done',
  CONVERTED: 'Converted',
  LOST: 'Lost',
}

/**
 * Executes a valid stage transition on an enquiry with optimistic concurrency control (W2-4, W2-9).
 */
export async function transitionEnquiryStage(
  caller: UserContext,
  input: TransitionStageInput
): Promise<{ enquiry: EnquiryRecord; previousStatus: EnquiryStatus }> {
  authorize(caller, 'enquiry:change_stage')

  const enquiry = await getEnquiryById(caller, input.enquiryId)
  assertBranchAccess(caller, enquiry.branchId, 'Enquiry')

  const fromStatus = enquiry.status
  const toStatus = input.toStatus

  // 1. Optimistic locking check (A-15, W2-4)
  if (input.expectedVersion !== undefined && enquiry.version !== input.expectedVersion) {
    throw new VersionConflictError(
      `Conflict: Enquiry has version ${enquiry.version}, but client expected version ${input.expectedVersion}.`
    )
  }

  // 2. Validate allowed stage transitions
  if (!isValidTransition(fromStatus, toStatus)) {
    throw new InvalidStageTransitionError(fromStatus, toStatus)
  }

  // 3. Moving to LOST requirements (E-5, W2-9)
  if (toStatus === 'LOST') {
    authorize(caller, 'enquiry:mark_lost')
    if (!input.lostReasonId || !isValidLostReason(input.lostReasonId)) {
      throw new Error('A valid lost reason is required when marking an enquiry as Lost.')
    }
  }

  // 4. Reopening LOST enquiry requirements (W2-9)
  if (fromStatus === 'LOST' && (toStatus === 'NEW' || toStatus === 'CONTACTED')) {
    authorize(caller, 'enquiry:mark_lost')
    if (!input.note?.trim()) {
      throw new Error('A note explaining why the enquiry is being reopened is required.')
    }
  }

  // 5. Update Record State
  const now = new Date().toISOString()
  const oldVersion = enquiry.version
  const newVersion = oldVersion + 1

  enquiry.status = toStatus
  enquiry.version = newVersion
  enquiry.updatedAt = now

  if (toStatus === 'LOST') {
    enquiry.lostReasonId = input.lostReasonId || null
    enquiry.lostNote = input.lostNote?.trim() || null
  } else if (fromStatus === 'LOST') {
    // Clear lost state on reopen
    enquiry.lostReasonId = null
    enquiry.lostNote = null
  }

  if (toStatus === 'CONTACTED' && !enquiry.lastContactedAt) {
    enquiry.lastContactedAt = now
  }

  // 6. Database Update
  if (isDbAvailable()) {
    try {
      await prisma.enquiry.update({
        where: { id: enquiry.id },
        data: {
          status: enquiry.status,
          lostReasonId: enquiry.lostReasonId,
          lostNote: enquiry.lostNote,
          lastContactedAt: enquiry.lastContactedAt ? new Date(enquiry.lastContactedAt) : null,
          version: enquiry.version,
        },
      })

      // Append Stage History entry
      await prisma.enquiryStageHistory.create({
        data: {
          enquiryId: enquiry.id,
          fromStatus,
          toStatus,
          changedByUserId: caller.userId,
          note: input.note?.trim() || (toStatus === 'LOST' ? input.lostNote || null : null),
        },
      })
    } catch {
      markDbOffline()
    }
  }

  // Update in-memory / demo items store
  updateDemoEnquiryStage(enquiry.id, {
    status: enquiry.status,
    version: enquiry.version,
    lostReasonId: enquiry.lostReasonId,
    lostNote: enquiry.lostNote,
    lastContactedAt: enquiry.lastContactedAt,
    updatedAt: enquiry.updatedAt,
  })

  // 7. Audit Log (No PII)
  const auditAction =
    toStatus === 'LOST'
      ? 'p2.enquiry.lost'
      : fromStatus === 'LOST'
      ? 'p2.enquiry.reopen'
      : 'p2.enquiry.stage_change'

  await logAudit({
    actorId: caller.userId,
    branchId: enquiry.branchId,
    action: auditAction,
    entityType: 'Enquiry',
    entityId: enquiry.id,
    before: { status: fromStatus, version: oldVersion },
    after: { status: toStatus, version: newVersion, lostReasonId: enquiry.lostReasonId },
    reason: input.note || input.lostNote || `Stage transition: ${fromStatus} -> ${toStatus}`,
  })

  return { enquiry, previousStatus: fromStatus }
}

/**
 * Returns grouped enquiries for the Kanban pipeline board (UI-UX § 4.2).
 */
export async function getEnquiryPipelineBoard(
  caller: UserContext,
  filters?: { branchId?: string; ownerId?: string }
): Promise<PipelineBoardResult> {
  authorize(caller, 'enquiry:read')

  const effectiveBranchId = (caller.role === 'ADMIN' ? filters?.branchId : caller.branchId) || undefined
  if (caller.role !== 'ADMIN' && caller.branchId) {
    assertBranchAccess(caller, caller.branchId, 'Branch')
  }

  const allStatuses: EnquiryStatus[] = ['NEW', 'CONTACTED', 'TRIAL_SCHEDULED', 'TRIAL_DONE', 'CONVERTED', 'LOST']
  const columns: Record<EnquiryStatus, PipelineBoardColumn> = {
    NEW: { status: 'NEW', label: STAGE_LABELS.NEW, count: 0, items: [] },
    CONTACTED: { status: 'CONTACTED', label: STAGE_LABELS.CONTACTED, count: 0, items: [] },
    TRIAL_SCHEDULED: { status: 'TRIAL_SCHEDULED', label: STAGE_LABELS.TRIAL_SCHEDULED, count: 0, items: [] },
    TRIAL_DONE: { status: 'TRIAL_DONE', label: STAGE_LABELS.TRIAL_DONE, count: 0, items: [] },
    CONVERTED: { status: 'CONVERTED', label: STAGE_LABELS.CONVERTED, count: 0, items: [] },
    LOST: { status: 'LOST', label: STAGE_LABELS.LOST, count: 0, items: [] },
  }

  let totalCount = 0

  if (isDbAvailable()) {
    try {
      const dbWhere: Record<string, any> = {}
      if (effectiveBranchId) dbWhere.branchId = effectiveBranchId
      if (filters?.ownerId) dbWhere.assignedToUserId = filters.ownerId

      const records = await prisma.enquiry.findMany({
        where: dbWhere,
        orderBy: { createdAt: 'desc' },
      })

      for (const r of records) {
        const item: EnquiryRecord = {
          ...r,
          nextFollowUpAt: r.nextFollowUpAt ? r.nextFollowUpAt.toISOString() : null,
          lastContactedAt: r.lastContactedAt ? r.lastContactedAt.toISOString() : null,
          convertedAt: r.convertedAt ? r.convertedAt.toISOString() : null,
          anonymizedAt: r.anonymizedAt ? r.anonymizedAt.toISOString() : null,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        }
        const statusKey = r.status as EnquiryStatus
        if (columns[statusKey]) {
          columns[statusKey].items.push(item)
          columns[statusKey].count++
          totalCount++
        }
      }

      return { branchId: effectiveBranchId, totalCount, columns }
    } catch {
      markDbOffline()
    }
  }

  // Fallback from enquiry service demo items
  const items = await listEnquiries(caller, { branchId: effectiveBranchId, assignedToUserId: filters?.ownerId })

  for (const item of items) {
    const statusKey = item.status as EnquiryStatus
    if (columns[statusKey]) {
      columns[statusKey].items.push(item)
      columns[statusKey].count++
      totalCount++
    }
  }

  return { branchId: effectiveBranchId, totalCount, columns }
}
