import {
  getSessionsForDate,
  submitSessionAttendance,
  cancelSession,
  managerCorrectAttendance,
  __setSessionSubmittedAtForTest,
} from '../src/services/attendance.service'
import { listMessages } from '../src/services/whatsapp.service'
import { UserContext, PermissionDeniedError, RecordNotFoundError } from '../src/lib/rbac'

console.log('🧪 Running Step 1.9 Coach Attendance & Absence Alerts Automated Tests...')

let passed = 0
let failed = 0

function assert(condition: boolean, testName: string) {
  if (condition) {
    passed++
    console.log(`  ✓ ${testName}`)
  } else {
    failed++
    console.error(`  ✗ FAIL: ${testName}`)
  }
}

const adminUser: UserContext = {
  userId: 'usr-admin-1',
  loginId: 'ADM-001',
  role: 'ADMIN',
  branchId: null,
}

const managerKKP: UserContext = {
  userId: 'usr-mgr-kkp',
  loginId: 'MGR-KKP-001',
  role: 'MANAGER',
  branchId: 'branch-kkp',
  branchType: 'OWNED',
}

const coachArjun: UserContext = {
  userId: 'usr-cch-1',
  loginId: 'CCH-KKP-001',
  role: 'COACH',
  branchId: 'branch-kkp',
  branchType: 'OWNED',
}

const coachOther: UserContext = {
  userId: 'usr-cch-99',
  loginId: 'CCH-KKP-099',
  role: 'COACH',
  branchId: 'branch-kkp',
  branchType: 'OWNED',
}

async function runTests() {
  const todayStr = new Date().toISOString().split('T')[0]

  // Test 1: Coach only sees sessions for batches they are assigned to
  const coachSessions = await getSessionsForDate(coachArjun, todayStr)
  assert(
    coachSessions.length > 0 &&
      coachSessions.some((s) => s.batchId === 'batch-1') &&
      coachSessions.every((s) => s.coachName === 'Arjun Sharma'),
    'Coach view lists only sessions for assigned batches (Arjun Sharma)'
  )

  // Test 2: Unassigned coach cannot see or submit attendance for batch-1
  const unassignedSessions = await getSessionsForDate(coachOther, todayStr)
  assert(
    unassignedSessions.length === 0,
    'Unassigned coach sees 0 sessions for unassigned batches'
  )

  let unassignedSubmitBlocked = false
  try {
    await submitSessionAttendance(coachOther, {
      batchId: 'batch-1',
      date: todayStr,
      records: [{ studentId: 'std-1', status: 'PRESENT' }],
    })
  } catch (err) {
    if (err instanceof RecordNotFoundError) {
      unassignedSubmitBlocked = true
    }
  }
  assert(unassignedSubmitBlocked, 'Unassigned coach is blocked from submitting attendance (RecordNotFoundError)')

  // Test 3: Submitting attendance with an ABSENT student triggers automated WhatsApp absence alert
  const initialAbsenceAlerts = (
    await listMessages(adminUser, { direction: 'OUTBOUND' })
  ).filter((m) => m.templateName === 'absence_alert').length

  const submitResult = await submitSessionAttendance(coachArjun, {
    batchId: 'batch-1',
    date: todayStr,
    records: [
      { studentId: 'std-1', status: 'PRESENT' },
      { studentId: 'std-2', status: 'ABSENT' }, // Rahul Verma marked absent
    ],
  })

  const postAbsenceAlerts = (
    await listMessages(adminUser, { direction: 'OUTBOUND' })
  ).filter((m) => m.templateName === 'absence_alert').length

  assert(
    submitResult.success === true &&
      submitResult.alertsSent >= 1 &&
      postAbsenceAlerts > initialAbsenceAlerts,
    'Submitting ABSENT student automatically dispatches WhatsApp absence alert to parent'
  )

  // Test 4: Cancelled session suppresses all absence alerts (WORKFLOWS.md § 3)
  const tomorrowStr = '2026-11-02'
  await cancelSession(coachArjun, {
    batchId: 'batch-1',
    date: tomorrowStr,
    reason: 'Waterlogged ground due to monsoon rains',
  })

  const preCancelAlerts = (
    await listMessages(adminUser, { direction: 'OUTBOUND' })
  ).filter((m) => m.templateName === 'absence_alert').length

  // Now coach marks attendance on the cancelled session
  const cancelledSubmit = await submitSessionAttendance(coachArjun, {
    batchId: 'batch-1',
    date: tomorrowStr,
    records: [{ studentId: 'std-1', status: 'ABSENT' }],
  })

  const postCancelAlerts = (
    await listMessages(adminUser, { direction: 'OUTBOUND' })
  ).filter((m) => m.templateName === 'absence_alert').length

  assert(
    postCancelAlerts === preCancelAlerts,
    'Cancelled session suppresses all absence notifications to parents'
  )

  // Test 5: Submitting attendance for past session > 2 hours late flags isLateEntry
  const pastDate = '2026-10-25'
  const pastSubmit = await submitSessionAttendance(coachArjun, {
    batchId: 'batch-1',
    date: pastDate,
    records: [{ studentId: 'std-1', status: 'PRESENT' }],
  })
  assert(
    pastSubmit.lateEntryCount > 0,
    'Attendance marked > 2 hours after session end is flagged with isLateEntry = true'
  )

  // Test 5b: Manager cannot mark direct ground attendance (only coaches mark; manager overrides)
  let managerMarkBlocked = false
  try {
    await submitSessionAttendance(managerKKP, {
      batchId: 'batch-1',
      date: pastDate,
      records: [{ studentId: 'std-1', status: 'PRESENT' }],
    })
  } catch (err) {
    if (err instanceof PermissionDeniedError) {
      managerMarkBlocked = true
    }
  }
  assert(managerMarkBlocked, 'Manager cannot mark direct pitch attendance (attendance:mark reserved for coaches)')

  // Test 6: Coach attempting to correct attendance after 7 days is blocked
  // We simulate session submitted 8 days ago
  const sessions = await getSessionsForDate(managerKKP, pastDate)
  const pastSession = sessions.find((s) => s.batchId === 'batch-1')
  __setSessionSubmittedAtForTest('batch-1', pastDate, new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString())

  let coachExpiredEditBlocked = false
  try {
    await submitSessionAttendance(coachArjun, {
      batchId: 'batch-1',
      date: pastDate,
      records: [{ studentId: 'std-1', status: 'LATE' }],
    })
  } catch (err) {
    if (err instanceof PermissionDeniedError) {
      coachExpiredEditBlocked = true
    }
  }
  assert(coachExpiredEditBlocked, 'Coach edit attempt > 7 days is blocked (PermissionDeniedError)')

  // Test 7: Manager can correct historical attendance with mandatory reason
  const correctResult = await managerCorrectAttendance(managerKKP, {
    sessionId: pastSession?.id || 'sess-batch-1-2026-10-15',
    studentId: 'std-1',
    newStatus: 'EXCUSED',
    reason: 'Parent provided medical certificate for illness',
  })
  assert(correctResult.success === true, 'Manager successfully corrected historical attendance with logged reason')

  // Test 8: Manager correction requires reason of at least 5 characters
  let emptyReasonBlocked = false
  try {
    await managerCorrectAttendance(managerKKP, {
      sessionId: pastSession?.id || 'sess-batch-1-2026-10-15',
      studentId: 'std-1',
      newStatus: 'PRESENT',
      reason: 'No', // Too short
    })
  } catch {
    emptyReasonBlocked = true
  }
  assert(emptyReasonBlocked, 'Attendance correction without detailed reason is rejected')

  // Test 9: Coach cannot perform manager corrections
  let coachCorrectionBlocked = false
  try {
    await managerCorrectAttendance(coachArjun, {
      sessionId: pastSession?.id || 'sess-batch-1-2026-10-15',
      studentId: 'std-1',
      newStatus: 'PRESENT',
      reason: 'Coach trying to correct past window',
    })
  } catch (err) {
    if (err instanceof PermissionDeniedError) {
      coachCorrectionBlocked = true
    }
  }
  assert(coachCorrectionBlocked, 'Coach is blocked from calling managerCorrectAttendance')

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exit(1)
}

runTests().catch((err) => {
  console.error('Unexpected test error:', err)
  process.exit(1)
})

