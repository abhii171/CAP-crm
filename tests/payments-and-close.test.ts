import {
  recordCashPayment,
  getDailySummary,
  closeDay,
  isDayClosed,
} from '../src/services/payment.service'
import { assignStudentFeePlan, listStudentDues, createFeePlan } from '../src/services/fee.service'
import { admitStudent } from '../src/services/student.service'
import { UserContext, PermissionDeniedError, RecordNotFoundError } from '../src/lib/rbac'
import { listMessages } from '../src/services/whatsapp.service'

console.log('🧪 Running Step 1.11 Cash Payments, Receipts & Daily Close Tests...')

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
  const testDate = '2026-11-15'

  // Step 1: Create a student with a fee plan to produce dues
  const cadet = await admitStudent(managerKKP, {
    branchId: 'branch-kkp',
    name: 'Siddharth Rao',
    dob: '2012-05-18',
    guardianName: 'Vikram Rao',
    whatsappNumber: '919876543210',
    relationship: 'Father',
    whatsappOptIn: true,
    batchId: 'batch-1',
  })

  // Assign fee plan to generate dues
  const plan = await createFeePlan(adminUser, {
    name: 'Standard Coaching Nov 2026',
    amountPaise: 300000, // ₹3,000
    frequency: 'MONTHLY',
  })

  await assignStudentFeePlan(managerKKP, {
    studentId: cadet.id,
    feePlanId: plan.id,
    startDate: '2026-11-01',
  })

  const duesBefore = await listStudentDues(managerKKP, cadet.id)
  assert(duesBefore.length > 0, 'Student has pending fee due generated')
  const initialDue = duesBefore[0]
  assert(initialDue.status === 'UNPAID', 'Initial due status is UNPAID')

  // Test 1: Coach is strictly forbidden from recording payments
  let coachBlocked = false
  try {
    await recordCashPayment(coachArjun, {
      branchId: 'branch-kkp',
      studentId: cadet.id,
      amountPaise: 300000,
      businessDate: testDate,
    })
  } catch (err: any) {
    if (err instanceof PermissionDeniedError) {
      coachBlocked = true
    }
  }
  assert(coachBlocked, 'Coach is forbidden from recording payments (fee:record_payment)')

  // Test 2: Manager from another branch cannot record payment for KKP student
  let crossBranchBlocked = false
  try {
    await recordCashPayment(managerHBN, {
      branchId: 'branch-kkp',
      studentId: cadet.id,
      amountPaise: 300000,
      businessDate: testDate,
    })
  } catch (err: any) {
    if (err instanceof PermissionDeniedError || err instanceof RecordNotFoundError) {
      crossBranchBlocked = true
    }
  }
  assert(crossBranchBlocked, 'Manager from different branch blocked by branch scoping')

  // Test 3: Manager records partial cash payment (₹1,000 out of ₹3,000)
  const partialResult = await recordCashPayment(managerKKP, {
    branchId: 'branch-kkp',
    studentId: cadet.id,
    amountPaise: 100000, // ₹1,000
    businessDate: testDate,
    note: 'Partial fee payment paid at desk',
  })

  assert(
    partialResult.payment.amountPaise === 100000 &&
      partialResult.payment.method === 'CASH' &&
      typeof partialResult.receiptNumber === 'number',
    'Manager successfully recorded partial cash payment with receipt number'
  )
  const firstReceiptNo = partialResult.receiptNumber

  // Verify due status is now PARTIAL
  const duesAfterPartial = await listStudentDues(managerKKP, cadet.id)
  const dueAfterPartial = duesAfterPartial.find((d) => d.id === initialDue.id)
  assert(
    dueAfterPartial?.status === 'PARTIAL' && dueAfterPartial.paidPaise === 100000,
    'Fee due status transitioned to PARTIAL with allocated amount'
  )

  // Test 4: Automatic WhatsApp payment receipt dispatched
  const msgs = await listMessages(managerKKP, { branchId: 'branch-kkp', direction: 'OUTBOUND' })
  const receiptMsg = msgs.find(
    (m: any) => m.templateName === 'payment_receipt' && m.studentId === cadet.id
  )
  assert(Boolean(receiptMsg), 'Automatic WhatsApp payment receipt queued for parent')
  assert(
    Boolean(receiptMsg?.body && receiptMsg.body.includes('1,000') && receiptMsg.body.includes('Siddharth Rao')),
    'WhatsApp receipt template populated with cadet name and formatted amount'
  )

  // Test 5: Gapless sequential receipt numbering
  const fullPaymentResult = await recordCashPayment(managerKKP, {
    branchId: 'branch-kkp',
    studentId: cadet.id,
    amountPaise: 200000, // ₹2,000 to clear the remaining balance
    businessDate: testDate,
  })

  assert(
    fullPaymentResult.receiptNumber === firstReceiptNo + 1,
    `Gapless sequential receipt numbering preserved (${firstReceiptNo} -> ${fullPaymentResult.receiptNumber})`
  )

  // Verify due status is now PAID
  const duesAfterFull = await listStudentDues(managerKKP, cadet.id)
  const dueAfterFull = duesAfterFull.find((d) => d.id === initialDue.id)
  assert(
    dueAfterFull?.status === 'PAID' && dueAfterFull.paidPaise === 300000,
    'Fee due status transitioned to PAID after balance fully cleared'
  )

  // Test 6: Get Daily Summary
  const summary = await getDailySummary(managerKKP, 'branch-kkp', testDate)
  assert(
    summary.expectedCashPaise === 300000 &&
      summary.receiptCount === 2 &&
      summary.isClosed === false,
    'Daily summary accurately tallies expected cash (₹3,000) and 2 receipts'
  )

  // Test 7: Discrepancy requires mandatory explanation note (min 5 chars)
  let discrepancyRejected = false
  try {
    // Expected is ₹3,000, counted is ₹2,800 (-₹200 discrepancy) without note
    await closeDay(managerKKP, {
      branchId: 'branch-kkp',
      businessDate: testDate,
      countedCashPaise: 280000,
      note: 'bad', // < 5 chars
    })
  } catch (err: any) {
    if (err.message && err.message.includes('explanation note')) {
      discrepancyRejected = true
    }
  }
  assert(
    discrepancyRejected,
    'Daily close with cash discrepancy strictly enforces explanation note (min 5 chars)'
  )

  // Test 8: Close day with valid counted cash and note
  const closeResult = await closeDay(managerKKP, {
    branchId: 'branch-kkp',
    businessDate: testDate,
    countedCashPaise: 300000, // Exact cash
    note: 'Desk cash drawer counted and reconciled perfectly with receipts.',
  })
  assert(closeResult.success && closeResult.discrepancyPaise === 0, 'Daily close successfully submitted')

  // Verify isDayClosed returns true
  const isClosed = await isDayClosed('branch-kkp', testDate)
  assert(isClosed === true, 'isDayClosed confirms day is locked')

  // Test 9: Subsequent payments on closed date are strictly rejected
  let paymentOnClosedDayBlocked = false
  try {
    await recordCashPayment(managerKKP, {
      branchId: 'branch-kkp',
      studentId: cadet.id,
      amountPaise: 50000,
      businessDate: testDate,
    })
  } catch (err: any) {
    if (err instanceof PermissionDeniedError) {
      paymentOnClosedDayBlocked = true
    }
  }
  assert(
    paymentOnClosedDayBlocked,
    'Financial lock prevents backdated payments on closed business date'
  )

  // Test 10: Re-closing an already closed day is rejected
  let duplicateCloseBlocked = false
  try {
    await closeDay(managerKKP, {
      branchId: 'branch-kkp',
      businessDate: testDate,
      countedCashPaise: 300000,
    })
  } catch (err: any) {
    duplicateCloseBlocked = true
  }
  assert(duplicateCloseBlocked, 'Duplicate daily close request rejected')

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
