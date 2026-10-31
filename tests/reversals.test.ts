import {
  recordCashPayment,
  reversePayment,
  approveReversal,
  listPendingReversals,
} from '../src/services/payment.service'
import { assignStudentFeePlan, listStudentDues, createFeePlan } from '../src/services/fee.service'
import { admitStudent, getStudentById } from '../src/services/student.service'
import { UserContext, PermissionDeniedError, RecordNotFoundError } from '../src/lib/rbac'

console.log('🧪 Running Step 1.12 Payment Reversals Automated Tests...')

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

const managerHBN: UserContext = {
  userId: 'usr-mgr-hbn',
  loginId: 'MGR-HBN-001',
  role: 'MANAGER',
  branchId: 'branch-hbn',
  branchType: 'FRANCHISE',
}

const coachArjun: UserContext = {
  userId: 'usr-cch-1',
  loginId: 'CCH-KKP-001',
  role: 'COACH',
  branchId: 'branch-kkp',
  branchType: 'OWNED',
}

async function runTests() {
  const testDate = '2026-11-20'

  // Step 1: Admit cadet and assign fee plan
  const cadet = await admitStudent(managerKKP, {
    branchId: 'branch-kkp',
    name: 'Kabir Mehta',
    dob: '2011-09-12',
    guardianName: 'Rishi Mehta',
    whatsappNumber: '919876543999',
    relationship: 'Father',
    whatsappOptIn: true,
    batchId: 'batch-1',
  })

  const plan = await createFeePlan(adminUser, {
    name: 'Quarterly Advanced Camp Nov 2026',
    amountPaise: 400000, // ₹4,000 (within manager ₹5,000 limit)
    frequency: 'QUARTERLY',
  })

  await assignStudentFeePlan(managerKKP, {
    studentId: cadet.id,
    feePlanId: plan.id,
    startDate: '2026-11-01',
  })

  // Record payment of ₹4,000
  const paymentResult = await recordCashPayment(managerKKP, {
    branchId: 'branch-kkp',
    studentId: cadet.id,
    amountPaise: 400000,
    businessDate: testDate,
    note: 'Initial full fee cash payment',
  })

  const paymentId = paymentResult.payment.id

  // Verify due is PAID
  const duesPaid = await listStudentDues(managerKKP, cadet.id)
  const due = duesPaid[0]
  assert(due.status === 'PAID', 'Fee due successfully reached PAID status upon payment')

  // Test 1: Coach cannot reverse payments (PermissionDeniedError)
  let coachBlocked = false
  try {
    await reversePayment(coachArjun, {
      paymentId,
      reason: 'Coach attempting refund',
    })
  } catch (err: any) {
    if (err instanceof PermissionDeniedError) {
      coachBlocked = true
    }
  }
  assert(coachBlocked, 'Coach is strictly blocked from reversing payments (fee:reverse)')

  // Test 2: Manager from another branch cannot reverse KKP payment
  let crossBranchBlocked = false
  try {
    await reversePayment(managerHBN, {
      paymentId,
      reason: 'Cross branch reversal attempt',
    })
  } catch (err: any) {
    if (err instanceof RecordNotFoundError || err instanceof PermissionDeniedError) {
      crossBranchBlocked = true
    }
  }
  assert(crossBranchBlocked, 'Manager from different branch blocked by branch scoping')

  // Test 3: Reversal without minimum 5-character reason is rejected
  let invalidReasonBlocked = false
  try {
    await reversePayment(managerKKP, {
      paymentId,
      reason: 'bad', // < 5 chars
    })
  } catch (err: any) {
    if (err.message && err.message.includes('minimum 5 characters')) {
      invalidReasonBlocked = true
    }
  }
  assert(invalidReasonBlocked, 'Payment reversal strictly enforces min 5-character justification note')

  // Test 4: Manager successfully reverses payment within ₹5,000 limit
  const reversalResult = await reversePayment(managerKKP, {
    paymentId,
    reason: 'Parent paid cash in error, will pay via bank transfer instead',
  })

  assert(
    reversalResult.status === 'REVERSED' &&
      reversalResult.requiresAdminApproval === false &&
      Boolean(reversalResult.reversalPayment),
    'Manager successfully executed reversal within threshold without admin approval'
  )

  // Test 5: Fee due status is restored from PAID back to UNPAID
  const duesRestored = await listStudentDues(managerKKP, cadet.id)
  const restoredDue = duesRestored.find((d) => d.id === due.id)
  assert(
    restoredDue?.status === 'UNPAID' && restoredDue.paidPaise === 0,
    'Fee due status was restored from PAID back to UNPAID'
  )

  // Test 6: Cadet outstanding balance restored
  const studentAfter = await getStudentById(managerKKP, cadet.id)
  assert(
    (studentAfter.outstandingDuesPaise || 0) >= 400000,
    'Cadet outstanding balance restored by reversed amount'
  )

  // Test 7: Double-reversal of same payment is rejected
  let doubleReversalBlocked = false
  try {
    await reversePayment(managerKKP, {
      paymentId,
      reason: 'Trying to reverse again',
    })
  } catch (err: any) {
    if (err.message && err.message.includes('already been reversed')) {
      doubleReversalBlocked = true
    }
  }
  assert(doubleReversalBlocked, 'Double-reversal of already reversed payment is strictly prevented')

  // Test 8: Reversing a reversal entry is rejected
  let reverseReversalBlocked = false
  try {
    await reversePayment(managerKKP, {
      paymentId: reversalResult.reversalPayment!.id,
      reason: 'Trying to reverse the reversal',
    })
  } catch (err: any) {
    if (err.message && err.message.includes('Cannot reverse an existing reversal')) {
      reverseReversalBlocked = true
    }
  }
  assert(reverseReversalBlocked, 'Reversing a reversal entry is strictly forbidden')

  // Test 9: Manager reversal above ₹5,000 threshold triggers PENDING_APPROVAL
  const highPlan = await createFeePlan(adminUser, {
    name: 'Annual Elite Academy Nov 2026',
    amountPaise: 800000, // ₹8,000 (> ₹5,000 manager limit)
    frequency: 'YEARLY',
  })

  await assignStudentFeePlan(managerKKP, {
    studentId: cadet.id,
    feePlanId: highPlan.id,
    startDate: '2026-11-01',
  })

  const highPayment = await recordCashPayment(managerKKP, {
    branchId: 'branch-kkp',
    studentId: cadet.id,
    amountPaise: 800000,
    businessDate: testDate,
    note: 'Annual high-value fee payment',
  })

  const highReversalResult = await reversePayment(managerKKP, {
    paymentId: highPayment.payment.id,
    reason: 'Cadet relocating to another city, requested annual fee refund',
  })

  assert(
    highReversalResult.status === 'PENDING_APPROVAL' &&
      highReversalResult.requiresAdminApproval === true,
    'Reversal above ₹5,000 requires Admin approval (PENDING_APPROVAL)'
  )

  // Verify pending reversals list contains this request
  const pendingList = await listPendingReversals(adminUser)
  const pendingItem = pendingList.find((p) => p.reversalOfPaymentId === highPayment.payment.id)
  assert(Boolean(pendingItem), 'Pending reversal visible in Admin queue')

  // Test 10: Non-admin cannot approve high-value reversal
  let managerApproveBlocked = false
  try {
    await approveReversal(managerKKP, pendingItem!.id, true)
  } catch (err: any) {
    if (err instanceof PermissionDeniedError) {
      managerApproveBlocked = true
    }
  }
  assert(managerApproveBlocked, 'Branch manager cannot self-approve high-value reversal')

  // Test 11: Admin approves high-value reversal
  const adminApprovalResult = await approveReversal(
    adminUser,
    pendingItem!.id,
    true,
    'Admin verified relocation documents and approved refund'
  )
  assert(
    adminApprovalResult.success && adminApprovalResult.status === 'COMPLETED',
    'Admin successfully approved high-value reversal'
  )

  // Summary
  console.log(`\nResults: ${passed} passed, ${failed} failed`)
  if (failed > 0) {
    process.exit(1)
  }
}

runTests().catch((err) => {
  console.error('Unhandled test failure:', err)
  process.exit(1)
})

