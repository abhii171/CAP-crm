import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { UserContext, authorize, can, RecordNotFoundError, PermissionDeniedError } from '@/lib/rbac'
import { scopeBranchWhere, assertBranchAccess, assertCoachBatchAssignment, sanitizeStudentForRole } from '@/lib/branch-query'
import { listBatches } from './batch.service'
import { listStudents, getStudentContactForAlert } from './student.service'
import { queueOutboundMessage } from './whatsapp.service'

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'
export type SessionStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED'

export interface AttendanceItem {
  studentId: string
  status: AttendanceStatus
}

export interface SubmitAttendanceInput {
  batchId: string
  date: string // YYYY-MM-DD
  records: AttendanceItem[]
}

export interface SessionRecord {
  id: string
  batchId: string
  batchName: string
  branchId: string
  date: string
  status: SessionStatus
  cancelReason?: string | null
  attendanceSubmittedAt?: string | null
  startTime: string
  endTime: string
  coachName?: string
  isLive: boolean
  roster: {
    studentId: string
    studentCode: string
    name: string
    emergencyPhone?: string
    status?: AttendanceStatus | null
    isLateEntry?: boolean
  }[]
  summary?: {
    total: number
    present: number
    absent: number
    late: number
    excused: number
    unmarked: number
  }
}

// In-memory demo store for sessions and attendance
let demoSessions: (SessionRecord & {
  attendances: {
    id: string
    studentId: string
    status: AttendanceStatus
    markedById: string
    markedAt: string
    isLateEntry: boolean
    editedAt?: string | null
    editReason?: string | null
  }[]
})[] = []

/**
 * Checks if a session is currently live (current time between startTime and endTime on date).
 */
function isSessionLive(dateStr: string, startTime: string, endTime: string): boolean {
  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]
  if (dateStr !== todayStr) return false

  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)

  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const startMinutes = sh * 60 + sm
  const endMinutes = eh * 60 + em

  return nowMinutes >= startMinutes && nowMinutes <= endMinutes
}

/**
 * Checks if attendance entry is "Late" (> 2 hours after session endTime).
 */
function isLateEntry(dateStr: string, endTime: string): boolean {
  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]

  // If marked on a subsequent day, it is definitely late
  if (todayStr > dateStr) return true
  if (todayStr < dateStr) return false

  const [eh, em] = endTime.split(':').map(Number)
  const sessionEndMinutes = eh * 60 + em
  const cutoffMinutes = sessionEndMinutes + 120 // 2 hours grace period

  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  return nowMinutes > cutoffMinutes
}

/**
 * Retrieves sessions for a user (Coach sees only assigned batches; Manager/Admin sees branch batches).
 */
export async function getSessionsForDate(
  caller: UserContext,
  dateStr?: string,
  targetBranchId?: string
): Promise<SessionRecord[]> {
  const effectiveDate = dateStr || new Date().toISOString().split('T')[0]
  const branchId = targetBranchId || caller.branchId || 'branch-kkp'

  assertBranchAccess(caller, branchId, 'Branch')

  // Get active batches in this branch
  const allBatches = await listBatches(caller, branchId)

  // Filter to batches assigned to coach if caller is a coach
  const permittedBatches = allBatches.filter((b) => {
    if (caller.role === 'COACH') {
      return (
        b.currentCoach?.id === caller.userId ||
        b.currentCoach?.loginId === caller.loginId ||
        (b as any).coachId === caller.userId
      )
    }
    return true
  })

  // Get all active students in the branch
  const students = await listStudents(caller, { branchId, status: 'ACTIVE' })

  const results: SessionRecord[] = []

  for (const batch of permittedBatches) {
    const isLive = isSessionLive(effectiveDate, batch.startTime, batch.endTime)

    // Find existing session in demo store or DB
    let session = demoSessions.find((s) => s.batchId === batch.id && s.date === effectiveDate)

    if (!session) {
      session = {
        id: `sess-${batch.id}-${effectiveDate}`,
        batchId: batch.id,
        batchName: batch.name,
        branchId: batch.branchId,
        date: effectiveDate,
        status: 'SCHEDULED',
        startTime: batch.startTime,
        endTime: batch.endTime,
        coachName: batch.currentCoach?.name,
        isLive,
        roster: [],
        attendances: [],
      }
      demoSessions.push(session)
    } else {
      session.isLive = isLive
    }

    // Filter students enrolled in this batch
    const batchStudents = students.filter((s) => s.currentBatch?.id === batch.id)

    const roster = batchStudents.map((s) => {
      // Coach privacy sanitization: emergency phone only during live sessions
      const sanitized = sanitizeStudentForRole(s as any, caller.role, isLive)
      const existingAttendance = session?.attendances.find((a) => a.studentId === s.id)

      return {
        studentId: s.id,
        studentCode: s.studentCode,
        name: s.name,
        emergencyPhone: sanitized.emergencyPhone,
        status: existingAttendance?.status || null,
        isLateEntry: existingAttendance?.isLateEntry || false,
      }
    })

    const present = roster.filter((r) => r.status === 'PRESENT').length
    const absent = roster.filter((r) => r.status === 'ABSENT').length
    const late = roster.filter((r) => r.status === 'LATE').length
    const excused = roster.filter((r) => r.status === 'EXCUSED').length
    const unmarked = roster.filter((r) => r.status === null).length

    results.push({
      id: session.id,
      batchId: batch.id,
      batchName: batch.name,
      branchId: batch.branchId,
      date: effectiveDate,
      status: session.status,
      cancelReason: session.cancelReason,
      attendanceSubmittedAt: session.attendanceSubmittedAt,
      startTime: batch.startTime,
      endTime: batch.endTime,
      coachName: batch.currentCoach?.name,
      isLive,
      roster,
      summary: {
        total: roster.length,
        present,
        absent,
        late,
        excused,
        unmarked,
      },
    })
  }

  return results
}

/**
 * Submits daily session attendance (WORKFLOWS.md § 3).
 * - Enforces 7-day edit window for coaches.
 * - Flags late-entries if submitted > 2 hours after session end.
 * - Automatically dispatches WhatsApp absence alerts to parents of absent students.
 */
export async function submitSessionAttendance(
  caller: UserContext,
  input: SubmitAttendanceInput
): Promise<{ success: boolean; alertsSent: number; lateEntryCount: number }> {
  authorize(caller, 'attendance:mark')

  const batches = await listBatches(caller)
  const batch = batches.find((b) => b.id === input.batchId)
  if (!batch) {
    throw new RecordNotFoundError('Batch')
  }

  assertBranchAccess(caller, batch.branchId, 'Batch')

  // If coach, verify assignment to this batch
  if (caller.role === 'COACH') {
    const coachIds = [batch.currentCoach?.id, batch.currentCoach?.loginId, (batch as any).coachId].filter(
      Boolean
    ) as string[]
    assertCoachBatchAssignment(caller, coachIds, batch.name)
  }

  // Find or create session record
  let session = demoSessions.find((s) => s.batchId === input.batchId && s.date === input.date)
  if (!session) {
    session = {
      id: `sess-${batch.id}-${input.date}`,
      batchId: batch.id,
      batchName: batch.name,
      branchId: batch.branchId,
      date: input.date,
      status: 'SCHEDULED',
      startTime: batch.startTime,
      endTime: batch.endTime,
      coachName: batch.currentCoach?.name,
      isLive: isSessionLive(input.date, batch.startTime, batch.endTime),
      roster: [],
      attendances: [],
    }
    demoSessions.push(session)
  }

  // Check 7-day edit window for coaches (WORKFLOWS.md § 3)
  if (caller.role === 'COACH' && session.attendanceSubmittedAt) {
    const submissionTime = new Date(session.attendanceSubmittedAt).getTime()
    const now = Date.now()
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
    if (now - submissionTime > sevenDaysMs) {
      throw new PermissionDeniedError(
        'The 7-day coach edit window has expired. Manager correction with reason is required.'
      )
    }
  }

  const lateFlag = isLateEntry(input.date, batch.endTime)
  const nowIso = new Date().toISOString()
  const wasCancelled = session.status === 'CANCELLED'
  if (!wasCancelled) {
    session.status = 'COMPLETED'
  }
  session.attendanceSubmittedAt = nowIso

  let alertsSent = 0
  let lateEntryCount = 0

  // Fetch all students for absence alerts and contact info
  const allStudents = await listStudents(caller, { branchId: batch.branchId })

  // Update attendances
  for (const item of input.records) {
    let existing = session.attendances.find((a) => a.studentId === item.studentId)
    const isNewLate = lateFlag

    if (isNewLate) lateEntryCount++

    if (existing) {
      existing.status = item.status
      existing.editedAt = nowIso
      existing.isLateEntry = isNewLate
    } else {
      existing = {
        id: `att-${Date.now()}-${item.studentId}`,
        studentId: item.studentId,
        status: item.status,
        markedById: caller.userId,
        markedAt: nowIso,
        isLateEntry: isNewLate,
      }
      session.attendances.push(existing)
    }

    // AUTOMATED ABSENCE ALERT (WORKFLOWS.md § 3, § 4)
    // Only send if student is marked ABSENT and session is NOT CANCELLED
    if (item.status === 'ABSENT' && !wasCancelled) {
      const contact = await getStudentContactForAlert(item.studentId)
      if (contact && contact.whatsappNumber) {
        await queueOutboundMessage(caller, {
          branchId: batch.branchId,
          guardianId: contact.guardianId,
          studentId: item.studentId,
          recipientPhone: contact.whatsappNumber,
          templateName: 'absence_alert',
          variables: {
            cadetName: contact.name,
            batchName: batch.name,
            sessionDate: input.date,
          },
          relatedType: 'ATTENDANCE',
          relatedId: existing.id,
        })
        alertsSent++
      }
    }
  }

  await logAudit({
    actorId: caller.userId,
    branchId: batch.branchId,
    action: 'attendance.submit',
    entityType: 'Session',
    entityId: session.id,
    after: {
      date: input.date,
      batchId: batch.id,
      totalMarked: input.records.length,
      alertsDispatched: alertsSent,
      isLateEntry: lateFlag,
    },
    reason: `Submitted attendance for ${batch.name} on ${input.date} (${alertsSent} absence alerts dispatched)`,
  })

  return { success: true, alertsSent, lateEntryCount }
}

/**
 * Cancels a training session (e.g. rain, holiday).
 * Suppresses all absence alerts for this session.
 */
export async function cancelSession(
  caller: UserContext,
  input: { batchId: string; date: string; reason: string }
): Promise<{ success: boolean }> {
  if (!can(caller, 'attendance:mark') && !can(caller, 'attendance:override')) {
    throw new PermissionDeniedError('attendance:override')
  }

  const batches = await listBatches(caller)
  const batch = batches.find((b) => b.id === input.batchId)
  if (!batch) throw new RecordNotFoundError('Batch')

  assertBranchAccess(caller, batch.branchId, 'Batch')

  let session = demoSessions.find((s) => s.batchId === input.batchId && s.date === input.date)
  if (!session) {
    session = {
      id: `sess-${batch.id}-${input.date}`,
      batchId: batch.id,
      batchName: batch.name,
      branchId: batch.branchId,
      date: input.date,
      status: 'CANCELLED',
      cancelReason: input.reason,
      startTime: batch.startTime,
      endTime: batch.endTime,
      isLive: false,
      roster: [],
      attendances: [],
    }
    demoSessions.push(session)
  } else {
    session.status = 'CANCELLED'
    session.cancelReason = input.reason
  }

  await logAudit({
    actorId: caller.userId,
    branchId: batch.branchId,
    action: 'session.cancel',
    entityType: 'Session',
    entityId: session.id,
    after: { date: input.date, reason: input.reason },
    reason: `Cancelled training session for ${batch.name} on ${input.date}: ${input.reason}`,
  })

  return { success: true }
}

/**
 * Manager attendance correction (WORKFLOWS.md § 3).
 * Requires mandatory audit reason.
 */
export async function managerCorrectAttendance(
  caller: UserContext,
  input: {
    sessionId: string
    studentId: string
    newStatus: AttendanceStatus
    reason: string
  }
): Promise<{ success: boolean }> {
  // Only Managers or Admins can correct historical attendance
  if (caller.role !== 'ADMIN' && caller.role !== 'MANAGER') {
    throw new PermissionDeniedError('Only academy managers or admins can perform attendance corrections.')
  }

  if (!input.reason || input.reason.trim().length < 5) {
    throw new Error('A detailed justification reason (minimum 5 characters) is mandatory for attendance corrections.')
  }

  const session = demoSessions.find((s) => s.id === input.sessionId)
  if (!session) {
    throw new RecordNotFoundError('Session')
  }

  assertBranchAccess(caller, session.branchId, 'Session')

  let attendance = session.attendances.find((a) => a.studentId === input.studentId)
  const previousStatus = attendance?.status || 'UNMARKED'

  if (attendance) {
    attendance.status = input.newStatus
    attendance.editedAt = new Date().toISOString()
    attendance.editReason = input.reason
  } else {
    attendance = {
      id: `att-corr-${Date.now()}`,
      studentId: input.studentId,
      status: input.newStatus,
      markedById: caller.userId,
      markedAt: new Date().toISOString(),
      isLateEntry: false,
      editedAt: new Date().toISOString(),
      editReason: input.reason,
    }
    session.attendances.push(attendance)
  }

  await logAudit({
    actorId: caller.userId,
    branchId: session.branchId,
    action: 'attendance.correct',
    entityType: 'Attendance',
    entityId: attendance.id,
    before: { status: previousStatus },
    after: { status: input.newStatus, reason: input.reason },
    reason: `Manager attendance correction for student ${input.studentId} from ${previousStatus} to ${input.newStatus}: ${input.reason}`,
  })

  return { success: true }
}

/** Test utility to set attendance submission timestamp for window testing */
export function __setSessionSubmittedAtForTest(batchId: string, date: string, timestamp: string) {
  const session = demoSessions.find((s) => s.batchId === batchId && s.date === date)
  if (session) {
    session.attendanceSubmittedAt = timestamp
  }
}
