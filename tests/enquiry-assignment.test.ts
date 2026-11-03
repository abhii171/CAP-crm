import {
  createEnquiry,
  getEnquiryById,
  assignEnquiry,
  listAssignmentHistory,
} from '../src/modules/phase2'
import { UserContext, PermissionDeniedError, RecordNotFoundError } from '../src/lib/rbac'
import { deactivateUser, createUser } from '../src/services/user.service'

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

async function runAssignmentTests() {
  console.log('🧪 Running Enquiry Reassignment & Assignment History Tests...\n')

  const adminCaller: UserContext = {
    userId: 'demo-user-admin',
    loginId: 'ADM-001',
    role: 'ADMIN',
    branchId: null,
  }

  const managerKkp: UserContext = {
    userId: 'usr-mgr-kkp',
    loginId: 'MGR-KKP-01',
    role: 'MANAGER',
    branchId: 'branch-kkp',
  }

  const managerHbn: UserContext = {
    userId: 'usr-mgr-hbn',
    loginId: 'MGR-HBN-01',
    role: 'MANAGER',
    branchId: 'branch-hbn',
  }

  // 1. Create a fresh website enquiry in branch-kkp without assigned owner
  const enq = await createEnquiry(null, {
    branchId: 'branch-kkp',
    childName: 'Aryan Khan',
    guardianName: 'Shah Rukh Khan',
    phone: '9811122233',
    source: 'WEBSITE',
  })

  assertStrictEqual(enq.assignedToUserId, null, 'Enquiry is initially unassigned')
  console.log('  ✓ Website enquiry created without owner')

  // 2. Initial assignment by Manager to staff in same branch (usr-cch-1 is in branch-kkp)
  const assign1 = await assignEnquiry(managerKkp, enq.id, 'usr-cch-1', 'Initial lead allocation')
  assertStrictEqual(assign1.enquiry.assignedToUserId, 'usr-cch-1', 'Assigned to usr-cch-1')
  assertStrictEqual(assign1.historyEntry.actionType, 'INITIAL_ASSIGNMENT', 'Action type is INITIAL_ASSIGNMENT')
  assertStrictEqual(assign1.historyEntry.previousUserId, null, 'Previous user ID is null')
  assertStrictEqual(assign1.historyEntry.newUserId, 'usr-cch-1', 'New user ID recorded')
  assertStrictEqual(assign1.historyEntry.note, 'Initial lead allocation', 'Note recorded')
  console.log('  ✓ Initial assignment records INITIAL_ASSIGNMENT in history')

  // 3. Verify history list contains the entry
  let history = await listAssignmentHistory(managerKkp, enq.id)
  assert(history.length >= 1, 'History contains at least 1 record')
  assertStrictEqual(history[0].actionType, 'INITIAL_ASSIGNMENT')
  console.log('  ✓ listAssignmentHistory returns initial assignment event')

  // 4. Reassignment by Manager to another staff in same branch (usr-mgr-kkp)
  const assign2 = await assignEnquiry(managerKkp, enq.id, 'usr-mgr-kkp', 'Handover to manager')
  assertStrictEqual(assign2.enquiry.assignedToUserId, 'usr-mgr-kkp')
  assertStrictEqual(assign2.historyEntry.actionType, 'REASSIGNMENT')
  assertStrictEqual(assign2.historyEntry.previousUserId, 'usr-cch-1')
  assertStrictEqual(assign2.historyEntry.newUserId, 'usr-mgr-kkp')
  console.log('  ✓ Reassignment records previous user -> new user transition')

  // 5. Manager cannot reassign to staff in another branch
  let crossBranchStaffBlocked = false
  try {
    // usr-mgr-hbn is in branch-hbn
    await assignEnquiry(managerKkp, enq.id, 'usr-mgr-hbn', 'Cross branch attempt')
  } catch (err: any) {
    if (err instanceof PermissionDeniedError) {
      crossBranchStaffBlocked = true
    }
  }
  assertStrictEqual(crossBranchStaffBlocked, true, 'Manager cannot assign to staff outside their branch')
  console.log('  ✓ Manager blocked from assigning cross-branch staff')

  // 6. Manager cannot access or reassign enquiries belonging to another branch
  let otherBranchEnquiryBlocked = false
  try {
    await assignEnquiry(managerHbn, enq.id, 'usr-mgr-hbn', 'Wrong branch enquiry')
  } catch (err: any) {
    if (err instanceof RecordNotFoundError || err instanceof PermissionDeniedError) {
      otherBranchEnquiryBlocked = true
    }
  }
  assertStrictEqual(otherBranchEnquiryBlocked, true, 'Manager cannot reassign another branch enquiry')
  console.log('  ✓ Manager blocked from accessing another branch enquiry')

  // 7. Manager cannot view history for another branch enquiry
  let otherBranchHistoryBlocked = false
  try {
    await listAssignmentHistory(managerHbn, enq.id)
  } catch (err: any) {
    if (err instanceof RecordNotFoundError || err instanceof PermissionDeniedError) {
      otherBranchHistoryBlocked = true
    }
  }
  assertStrictEqual(otherBranchHistoryBlocked, true, 'Manager cannot view history of another branch')
  console.log('  ✓ Manager blocked from viewing assignment history of another branch')

  // 8. Admin can reassign enquiries cross-branch to any staff member
  const assignAdmin = await assignEnquiry(adminCaller, enq.id, 'usr-mgr-hbn', 'Admin escalation')
  assertStrictEqual(assignAdmin.enquiry.assignedToUserId, 'usr-mgr-hbn')
  console.log('  ✓ Admin can assign enquiry across branches')

  // 9. Assigning an inactive staff member is rejected
  const coachRes = await createUser(adminCaller, {
    name: 'Temporary Ex-Coach',
    email: `inactive-coach-${Date.now()}@cpa.local`,
    role: 'COACH',
    branchId: 'branch-kkp',
  })
  await deactivateUser(adminCaller, coachRes.user.id, 'Testing inactive assignment guardrail')

  let inactiveStaffBlocked = false
  try {
    await assignEnquiry(adminCaller, enq.id, coachRes.user.id, 'Assigning inactive user')
  } catch (err: any) {
    if (err.message && err.message.includes('inactive')) {
      inactiveStaffBlocked = true
    }
  }
  assertStrictEqual(inactiveStaffBlocked, true, 'Assigning inactive staff is blocked')
  console.log('  ✓ Assigning inactive staff is blocked with appropriate error')

  // 10. Verify history order: latest events first (descending)
  const fullHistory = await listAssignmentHistory(adminCaller, enq.id)
  assert(fullHistory.length >= 3, 'At least 3 history events recorded')
  // Top entry should be the latest (Admin escalation)
  assertStrictEqual(fullHistory[0].newUserId, 'usr-mgr-hbn')
  assertStrictEqual(fullHistory[0].note, 'Admin escalation')
  // All entries retain immutable audit data
  assert(fullHistory.every((h) => h.enquiryId === enq.id && h.performedByUserId && h.createdAt), 'All entries have immutable data')
  console.log('  ✓ History order verified: newest events first with full immutable details')

  // 11. Verify enquiry data on reload/fresh fetch retains assignment
  const reloaded = await getEnquiryById(adminCaller, enq.id)
  assertStrictEqual(reloaded.assignedToUserId, 'usr-mgr-hbn')
  console.log('  ✓ Reassigned owner persists upon retrieval')

  console.log('\n==================================================')
  console.log('All Enquiry Reassignment & History Tests Passed! 🎯\n')
}

runAssignmentTests().catch((err) => {
  console.error('❌ Test failed:', err)
  const proc = (globalThis as any).process
  if (proc?.exit) {
    proc.exit(1)
  } else {
    throw err
  }
})
