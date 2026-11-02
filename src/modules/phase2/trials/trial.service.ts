import { prisma, isDbAvailable, markDbOffline } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { UserContext, authorize, RecordNotFoundError, PermissionDeniedError } from '@/lib/rbac'
import { assertBranchAccess } from '@/lib/branch-query'
import { getEnquiryById, EnquiryRecord } from '../enquiries/enquiry.service'
import { transitionEnquiryStage } from '../enquiries/pipeline.service'
import { getBatchById } from '@/services/batch.service'

export type TrialStatus = 'SCHEDULED' | 'ATTENDED' | 'NO_SHOW' | 'CANCELLED'

export interface TrialSessionRecord {
  id: string
  enquiryId: string
  batchId: string
  sessionDate: string // YYYY-MM-DD
  status: TrialStatus
  outcomeMarkedByUserId?: string | null
  outcomeMarkedAt?: string | null
  note?: string | null
  createdByUserId: string
  createdAt: string
  updatedAt: string
  childName?: string
  childAgeYears?: number | null
  guardianName?: string | null
  guardianPhone?: string | null
}

export interface BookTrialInput {
  enquiryId: string
  batchId: string
  sessionDate: string // YYYY-MM-DD
  note?: string
}

export interface MarkTrialOutcomeInput {
  trialId: string
  status: 'ATTENDED' | 'NO_SHOW' | 'CANCELLED'
  note?: string
}

export interface TrialGuestListItem {
  trialId: string
  enquiryId: string
  childName: string
  childAgeYears?: number | null
  status: TrialStatus
  sessionDate: string
  guardianName?: string | null
  guardianPhone?: string | null
}

// In-memory demo buffer for fallback / offline test resiliency
let demoTrialSessions: TrialSessionRecord[] = []

export function resetDemoTrialSessions(): void {
  demoTrialSessions = []
}

export const resetDemoTrials = resetDemoTrialSessions


/**
 * Books a trial session for an enquiry (W2-7).
 * Soft guest limit: max 3 scheduled trials per batch session date.
 * Hard Rule 8: Trials NEVER touch Phase 1 Attendance rows or batch capacity.
 */
export async function bookTrialSession(
  caller: UserContext,
  input: BookTrialInput
): Promise<TrialSessionRecord> {
  authorize(caller, 'trial:manage')

  const enquiry = await getEnquiryById(caller, input.enquiryId)
  assertBranchAccess(caller, enquiry.branchId, 'Enquiry')

  if (enquiry.status === 'CONVERTED') {
    throw new Error('Cannot book a trial for an already converted enquiry.')
  }
  if (enquiry.status === 'LOST') {
    throw new Error('Cannot book a trial for a lost enquiry. Please reopen the enquiry first.')
  }

  // Verify batch existence, branch alignment, and active status
  const batch = await getBatchById(caller, input.batchId)
  if (!batch || batch.branchId !== enquiry.branchId) {
    throw new RecordNotFoundError('Batch')
  }
  if (!batch.isActive) {
    throw new Error('Cannot book a trial in an inactive batch.')
  }

  // Validate session date format
  const dateObj = new Date(input.sessionDate)
  if (isNaN(dateObj.getTime())) {
    throw new Error('Invalid session date provided.')
  }
  const dateFormatted = input.sessionDate.split('T')[0]

  // Validate session date matches batch schedule daysOfWeek
  const dayOfWeek = dateObj.getUTCDay()
  if (Array.isArray(batch.daysOfWeek) && batch.daysOfWeek.length > 0) {
    if (!batch.daysOfWeek.includes(dayOfWeek)) {
      throw new Error(`Session date ${dateFormatted} does not match batch operating schedule.`)
    }
  }

  // Check no duplicate active/scheduled trial for this enquiry
  let existingScheduledCount = 0
  let guestCountOnDate = 0

  if (isDbAvailable()) {
    try {
      existingScheduledCount = await prisma.trialSession.count({
        where: {
          enquiryId: enquiry.id,
          status: 'SCHEDULED',
        },
      })

      guestCountOnDate = await prisma.trialSession.count({
        where: {
          batchId: batch.id,
          sessionDate: new Date(dateFormatted),
          status: 'SCHEDULED',
        },
      })
    } catch {
      markDbOffline()
    }
  }

  if (!isDbAvailable()) {
    existingScheduledCount = demoTrialSessions.filter(
      (t) => t.enquiryId === enquiry.id && t.status === 'SCHEDULED'
    ).length

    guestCountOnDate = demoTrialSessions.filter(
      (t) => t.batchId === batch.id && t.sessionDate === dateFormatted && t.status === 'SCHEDULED'
    ).length
  }

  if (existingScheduledCount > 0) {
    throw new Error('An active trial is already scheduled for this enquiry.')
  }

  // Soft guest limit check (W2-7 default 3)
  const MAX_TRIAL_GUESTS_PER_SESSION = 3
  if (guestCountOnDate >= MAX_TRIAL_GUESTS_PER_SESSION) {
    throw new Error(`Trial guest limit of ${MAX_TRIAL_GUESTS_PER_SESSION} reached for this batch session.`)
  }

  const now = new Date().toISOString()
  const trialId = `ts-${Date.now()}-${Math.random().toString(36).substring(7)}`

  const trialRecord: TrialSessionRecord = {
    id: trialId,
    enquiryId: enquiry.id,
    batchId: batch.id,
    sessionDate: dateFormatted,
    status: 'SCHEDULED',
    note: input.note?.trim() || null,
    createdByUserId: caller.userId,
    createdAt: now,
    updatedAt: now,
    childName: enquiry.childName,
    childAgeYears: enquiry.childAgeYears,
    guardianName: enquiry.guardianName,
    guardianPhone: enquiry.phoneNormalized,
  }

  if (isDbAvailable()) {
    try {
      await prisma.trialSession.create({
        data: {
          id: trialRecord.id,
          enquiryId: trialRecord.enquiryId,
          batchId: trialRecord.batchId,
          sessionDate: new Date(dateFormatted),
          status: 'SCHEDULED',
          note: trialRecord.note,
          createdByUserId: caller.userId,
        },
      })
    } catch {
      markDbOffline()
    }
  }

  demoTrialSessions.unshift(trialRecord)

  // Advance enquiry pipeline stage to TRIAL_SCHEDULED (W2-4, W2-7)
  await transitionEnquiryStage(caller, {
    enquiryId: enquiry.id,
    toStatus: 'TRIAL_SCHEDULED',
    note: `Trial booked for ${dateFormatted} in batch ${batch.name}`,
  })

  // Audit log (zero PII)
  await logAudit({
    actorId: caller.userId,
    branchId: enquiry.branchId,
    action: 'p2.trial.book',
    entityType: 'TrialSession',
    entityId: trialRecord.id,
    after: {
      enquiryId: enquiry.id,
      batchId: batch.id,
      sessionDate: dateFormatted,
      status: 'SCHEDULED',
    },
    reason: `Booked trial session for enquiry ${enquiry.id} on ${dateFormatted}`,
  })

  return trialRecord
}

/**
 * Records outcome of a trial session (W2-7).
 * Outcomes:
 * - ATTENDED: advances enquiry to TRIAL_DONE
 * - CANCELLED: returns enquiry to CONTACTED
 * - NO_SHOW: records no show
 */
export async function markTrialOutcome(
  caller: UserContext,
  input: MarkTrialOutcomeInput
): Promise<TrialSessionRecord> {
  // Both managers and coaches assigned to the batch can mark outcomes
  authorize(caller, 'trial:view_own_batches')

  let trial = demoTrialSessions.find((t) => t.id === input.trialId)
  let enquiry: EnquiryRecord | null = null

  if (isDbAvailable()) {
    try {
      const dbTrial = await prisma.trialSession.findUnique({
        where: { id: input.trialId },
        include: { enquiry: true, batch: true },
      })
      if (dbTrial) {
        assertBranchAccess(caller, dbTrial.enquiry.branchId, 'Enquiry')
        trial = {
          id: dbTrial.id,
          enquiryId: dbTrial.enquiryId,
          batchId: dbTrial.batchId,
          sessionDate: dbTrial.sessionDate.toISOString().split('T')[0],
          status: dbTrial.status as TrialStatus,
          outcomeMarkedByUserId: dbTrial.outcomeMarkedByUserId,
          outcomeMarkedAt: dbTrial.outcomeMarkedAt?.toISOString() || null,
          note: dbTrial.note,
          createdByUserId: dbTrial.createdByUserId,
          createdAt: dbTrial.createdAt.toISOString(),
          updatedAt: dbTrial.updatedAt.toISOString(),
          childName: dbTrial.enquiry.childName,
          childAgeYears: dbTrial.enquiry.childAgeYears,
          guardianName: dbTrial.enquiry.guardianName,
          guardianPhone: dbTrial.enquiry.phoneNormalized,
        }
      }
    } catch {
      markDbOffline()
    }
  }

  if (!trial) {
    throw new RecordNotFoundError('TrialSession')
  }

  enquiry = await getEnquiryById(caller, trial.enquiryId)
  assertBranchAccess(caller, enquiry.branchId, 'Enquiry')

  const now = new Date().toISOString()
  trial.status = input.status
  trial.outcomeMarkedAt = now
  trial.outcomeMarkedByUserId = caller.userId
  if (input.note?.trim()) {
    trial.note = trial.note ? `${trial.note}\n${input.note.trim()}` : input.note.trim()
  }

  if (isDbAvailable()) {
    try {
      await prisma.trialSession.update({
        where: { id: trial.id },
        data: {
          status: trial.status,
          outcomeMarkedAt: new Date(now),
          outcomeMarkedByUserId: caller.userId,
          note: trial.note,
        },
      })
    } catch {
      markDbOffline()
    }
  }

  // State machine advancement based on outcome (W2-4, W2-7)
  if (input.status === 'ATTENDED' && enquiry.status === 'TRIAL_SCHEDULED') {
    await transitionEnquiryStage(caller, {
      enquiryId: enquiry.id,
      toStatus: 'TRIAL_DONE',
      note: input.note || 'Trial attended successfully.',
    })
  } else if (input.status === 'CANCELLED' && enquiry.status === 'TRIAL_SCHEDULED') {
    await transitionEnquiryStage(caller, {
      enquiryId: enquiry.id,
      toStatus: 'CONTACTED',
      note: input.note || 'Trial cancelled.',
    })
  }

  await logAudit({
    actorId: caller.userId,
    branchId: enquiry.branchId,
    action: 'p2.trial.outcome',
    entityType: 'TrialSession',
    entityId: trial.id,
    after: {
      enquiryId: enquiry.id,
      trialId: trial.id,
      status: trial.status,
      outcomeMarkedAt: trial.outcomeMarkedAt,
    },
    reason: `Recorded trial outcome: ${trial.status}`,
  })

  return trial
}

/**
 * Returns trial guest roster for a batch on a given session date (W2-7).
 * Anti-Poaching & Privacy Compliance (A-10):
 * If caller is COACH, parent phone numbers and guardian names are strictly STRIPPED.
 */
export async function listTrialGuestsForBatch(
  caller: UserContext,
  batchId: string,
  sessionDate: string
): Promise<TrialGuestListItem[]> {
  authorize(caller, 'trial:view_own_batches')

  const batch = await getBatchById(caller, batchId)
  if (!batch) {
    throw new RecordNotFoundError('Batch')
  }
  assertBranchAccess(caller, batch.branchId, 'Batch')

  const dateFormatted = sessionDate.split('T')[0]
  let trials: TrialSessionRecord[] = []

  if (isDbAvailable()) {
    try {
      const dbTrials = await prisma.trialSession.findMany({
        where: {
          batchId,
          sessionDate: new Date(dateFormatted),
        },
        include: { enquiry: true },
        orderBy: { createdAt: 'asc' },
      })

      trials = dbTrials.map((t) => ({
        id: t.id,
        enquiryId: t.enquiryId,
        batchId: t.batchId,
        sessionDate: t.sessionDate.toISOString().split('T')[0],
        status: t.status as TrialStatus,
        outcomeMarkedByUserId: t.outcomeMarkedByUserId,
        outcomeMarkedAt: t.outcomeMarkedAt?.toISOString() || null,
        note: t.note,
        createdByUserId: t.createdByUserId,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
        childName: t.enquiry.childName,
        childAgeYears: t.enquiry.childAgeYears,
        guardianName: t.enquiry.guardianName,
        guardianPhone: t.enquiry.phoneNormalized,
      }))
    } catch {
      markDbOffline()
    }
  }

  if (!isDbAvailable()) {
    trials = demoTrialSessions.filter(
      (t) => t.batchId === batchId && t.sessionDate === dateFormatted
    )
  }

  const isCoach = caller.role === 'COACH'

  return trials.map((t) => ({
    trialId: t.id,
    enquiryId: t.enquiryId,
    childName: t.childName || 'Guest Student',
    childAgeYears: t.childAgeYears ?? null,
    status: t.status,
    sessionDate: t.sessionDate,
    // Strictly redact guardian contact details for coaches
    guardianName: isCoach ? undefined : t.guardianName,
    guardianPhone: isCoach ? undefined : t.guardianPhone,
  }))
}

/**
 * Lists all trial records associated with an enquiry.
 */
export async function listTrialsForEnquiry(
  caller: UserContext,
  enquiryId: string
): Promise<TrialSessionRecord[]> {
  authorize(caller, 'enquiry:read')

  const enquiry = await getEnquiryById(caller, enquiryId)
  assertBranchAccess(caller, enquiry.branchId, 'Enquiry')

  if (isDbAvailable()) {
    try {
      const records = await prisma.trialSession.findMany({
        where: { enquiryId },
        orderBy: { sessionDate: 'desc' },
      })

      return records.map((r) => ({
        id: r.id,
        enquiryId: r.enquiryId,
        batchId: r.batchId,
        sessionDate: r.sessionDate.toISOString().split('T')[0],
        status: r.status as TrialStatus,
        outcomeMarkedByUserId: r.outcomeMarkedByUserId,
        outcomeMarkedAt: r.outcomeMarkedAt?.toISOString() || null,
        note: r.note,
        createdByUserId: r.createdByUserId,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        childName: enquiry.childName,
      }))
    } catch {
      markDbOffline()
    }
  }

  return demoTrialSessions
    .filter((t) => t.enquiryId === enquiryId)
    .sort((a, b) => new Date(b.sessionDate).getTime() - new Date(a.sessionDate).getTime())
}

/**
 * Lists trial sessions for a branch or filter criteria.
 */
export async function listTrialSessions(
  caller: UserContext,
  params: { branchId?: string; batchId?: string; sessionDate?: string }
): Promise<TrialSessionRecord[]> {
  if (params.branchId) {
    assertBranchAccess(caller, params.branchId, 'Branch')
  }

  if (isDbAvailable()) {
    try {
      const where: any = {}
      if (params.batchId) where.batchId = params.batchId
      if (params.sessionDate) where.sessionDate = new Date(params.sessionDate)
      if (params.branchId) {
        where.batch = { branchId: params.branchId }
      }

      const records = await prisma.trialSession.findMany({
        where,
        include: { enquiry: true },
        orderBy: { sessionDate: 'desc' },
      })

      return records.map((r) => ({
        id: r.id,
        enquiryId: r.enquiryId,
        batchId: r.batchId,
        sessionDate: r.sessionDate.toISOString().split('T')[0],
        status: r.status as TrialStatus,
        outcomeMarkedByUserId: r.outcomeMarkedByUserId,
        outcomeMarkedAt: r.outcomeMarkedAt?.toISOString() || null,
        note: r.note,
        createdByUserId: r.createdByUserId,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        childName: r.enquiry.childName,
        childAgeYears: r.enquiry.childAgeYears,
        guardianName: r.enquiry.guardianName,
        guardianPhone: r.enquiry.phone,
      }))
    } catch {
      markDbOffline()
    }
  }

  return demoTrialSessions.filter((t) => {
    if (params.batchId && t.batchId !== params.batchId) return false
    if (params.sessionDate && t.sessionDate !== params.sessionDate) return false
    return true
  })
}

