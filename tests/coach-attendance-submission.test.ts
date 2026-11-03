import {
  getSessionsForDate,
  submitSessionAttendance,
} from '../src/services/attendance.service'
import { listBatches } from '../src/services/batch.service'
import { UserContext, RecordNotFoundError, PermissionDeniedError } from '../src/lib/rbac'
import { loadDemoData } from '../src/lib/demo-storage'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`)
  }
}

function assertStrictEqual<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)} but got ${String(actual)}. ${message || ''}`)
  }
}

async function runCoachAttendanceTests() {
  console.log('🧪 Running Comprehensive Coach Attendance Submission Verification Tests...\n')

  const todayStr = new Date().toISOString().split('T')[0]

  // This represents the EXACT logged-in session user context from login route for Arjun Sharma:
  const coachArjunSession: UserContext = {
    userId: 'demo-user-cch-1',
    loginId: 'CCH-KKP-001',
    role: 'COACH',
    branchId: 'branch-kkp',
    branchType: 'OWNED',
  }

  // An unassigned coach in the same branch:
  const coachOther: UserContext = {
    userId: 'usr-cch-99',
    loginId: 'CCH-KKP-099',
    role: 'COACH',
    branchId: 'branch-kkp',
    branchType: 'OWNED',
  }

  // A coach belonging to another branch (HBN):
  const coachHbn: UserContext = {
    userId: 'usr-cch-hbn-1',
    loginId: 'CCH-HBN-001',
    role: 'COACH',
    branchId: 'branch-hbn',
    branchType: 'FRANCHISE',
  }

  // Super Admin:
  const adminUser: UserContext = {
    userId: 'demo-user-admin',
    loginId: 'ADM-001',
    role: 'ADMIN',
    branchId: null,
  }

  // 1. Verify coach can see assigned batches including "Open Batch" (batch-3)
  const sessions = await getSessionsForDate(coachArjunSession, todayStr)
  assert(sessions.length > 0, 'Coach retrieves assigned sessions for date')
  const openBatchSession = sessions.find((s) => s.batchName === 'Open Batch' || s.batchId === 'batch-3')
  assert(Boolean(openBatchSession), 'Coach can view Open Batch (batch-3)')
  console.log('  ✓ Coach successfully fetches Open Batch session and cadet roster')

  // 2. Scenario 1 & 2: Coach submits attendance for Open Batch with mixed statuses (Present & Absent)
  const roster = openBatchSession!.roster
  assert(roster.length > 0, 'Open Batch has enrolled cadets in roster')

  const recordsToSubmit = roster.map((cadet, idx) => ({
    studentId: cadet.studentId,
    status: (idx === 0 ? 'PRESENT' : 'ABSENT') as 'PRESENT' | 'ABSENT',
  }))

  const submitResult = await submitSessionAttendance(coachArjunSession, {
    batchId: openBatchSession!.batchId,
    date: todayStr,
    records: recordsToSubmit,
  })

  assert(submitResult.success, 'submitSessionAttendance returns success: true')
  console.log('  ✓ Coach submits attendance for Open Batch without "Batch not found" error')

  // 3. Scenario 6: Coach refreshes / retrieves attendance after submission
  const reloadedSessions = await getSessionsForDate(coachArjunSession, todayStr)
  const reloadedOpenBatch = reloadedSessions.find((s) => s.batchId === openBatchSession!.batchId)
  assert(Boolean(reloadedOpenBatch), 'Reloaded Open Batch session exists')
  assertStrictEqual(reloadedOpenBatch!.status, 'COMPLETED', 'Session marked as COMPLETED')
  assert(Boolean(reloadedOpenBatch!.attendanceSubmittedAt), 'attendanceSubmittedAt timestamp is set')

  // Check that individual cadet statuses persist
  const firstCadet = reloadedOpenBatch!.roster.find((r) => r.studentId === recordsToSubmit[0].studentId)
  assertStrictEqual(firstCadet?.status, 'PRESENT', 'First cadet marked PRESENT persists after reload')
  console.log('  ✓ Reloading/refreshing strictly preserves submitted attendance status')

  // 4. Scenario 7: Coach submits attendance twice (Update submitted attendance)
  // Modify second cadet to PRESENT as well
  const updatedRecords = roster.map((cadet) => ({
    studentId: cadet.studentId,
    status: 'PRESENT' as const,
  }))

  const secondSubmit = await submitSessionAttendance(coachArjunSession, {
    batchId: openBatchSession!.batchId,
    date: todayStr,
    records: updatedRecords,
  })

  assert(secondSubmit.success, 'Second submission returns success: true')

  // Verify NO duplicate records created
  const reloadedAfterUpdate = await getSessionsForDate(coachArjunSession, todayStr)
  const batchAfterUpdate = reloadedAfterUpdate.find((s) => s.batchId === openBatchSession!.batchId)
  assertStrictEqual(batchAfterUpdate?.summary?.present, roster.length, 'All cadets updated to PRESENT')
  assertStrictEqual(batchAfterUpdate?.summary?.total, roster.length, 'No duplicate cadet entries in session')
  console.log('  ✓ Submitting attendance twice updates in place without duplicate records')

  // 5. Scenario 3: Coach submits attendance for another batch not assigned to them
  let unassignedBlocked = false
  try {
    await submitSessionAttendance(coachOther, {
      batchId: openBatchSession!.batchId,
      date: todayStr,
      records: recordsToSubmit,
    })
  } catch (err: any) {
    if (err instanceof RecordNotFoundError) {
      unassignedBlocked = true
      assertStrictEqual(err.message, 'Batch not found', 'Throws clean "Batch not found" without leaking batch name')
    }
  }
  assert(unassignedBlocked, 'Unassigned coach is blocked from submitting attendance')
  console.log('  ✓ Unassigned coach is securely blocked from submitting attendance')

  // 6. Scenario 4: Coach attempts to access another branch batch
  let crossBranchBlocked = false
  try {
    await submitSessionAttendance(coachHbn, {
      batchId: openBatchSession!.batchId,
      date: todayStr,
      records: recordsToSubmit,
    })
  } catch (err: any) {
    if (err instanceof RecordNotFoundError) {
      crossBranchBlocked = true
    }
  }
  assert(crossBranchBlocked, 'Cross-branch coach is strictly blocked by branch isolation')
  console.log('  ✓ Cross-branch coach is blocked by strict branch isolation')

  // 7. Scenario 5: Admin views submitted attendance
  const adminSessions = await getSessionsForDate(adminUser, todayStr, 'branch-kkp')
  const adminViewBatch = adminSessions.find((s) => s.batchId === openBatchSession!.batchId)
  assert(Boolean(adminViewBatch), 'Admin can view submitted session across branches')
  assertStrictEqual(adminViewBatch!.status, 'COMPLETED', 'Admin sees COMPLETED status')
  console.log('  ✓ Admin can view submitted attendance with accurate totals')

  // 8. Scenario 8 & 9: Verify permanent disk persistence in demo storage
  const savedDiskSessions = loadDemoData<any[]>('attendance-sessions', [])
  const diskRecord = savedDiskSessions.find((s) => s.batchId === openBatchSession!.batchId && s.date === todayStr)
  assert(Boolean(diskRecord), 'Attendance session permanently recorded in .demo-store/attendance-sessions.json')
  assertStrictEqual(diskRecord.status, 'COMPLETED', 'Disk record has COMPLETED status')
  console.log('  ✓ Attendance records are permanently stored on disk storage')

  console.log('\n==================================================')
  console.log('All Coach Attendance Submission Tests Passed! 🏏\n')
}

runCoachAttendanceTests().catch((err) => {
  console.error('❌ Test failed:', err)
  process.exit(1)
})
