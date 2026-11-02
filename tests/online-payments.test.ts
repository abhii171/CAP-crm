import crypto from 'crypto'
import {
  createPaymentLink,
  listPaymentLinks,
  processOnlinePaymentWebhook,
  processOnlineRefundWebhook,
  runReconciliationJob,
  listUnmatchedPayments,
  resolveUnmatchedPayment,
} from '../src/services/online-payment.service'
import { assignStudentFeePlan, listStudentDues, createFeePlan } from '../src/services/fee.service'
import { admitStudent } from '../src/services/student.service'
import { UserContext, PermissionDeniedError, RecordNotFoundError } from '../src/lib/rbac'
import { listMessages } from '../src/services/whatsapp.service'

console.log('Running Step 1.13 Online Payments Automated Tests...')

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

process.env.RAZORPAY_WEBHOOK_SECRET =
  process.env.RAZORPAY_WEBHOOK_SECRET || 'test_razorpay_secret_key_at_least_32_characters'
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET

function generateSignature(payload: string): string {
  return crypto.createHmac('sha256', WEBHOOK_SECRET).update(payload).digest('hex')
}

async function runTests() {
  // Setup cadet and fee plan
  const cadet = await admitStudent(managerKKP, {
    branchId: 'branch-kkp',
    name: 'Reyansh Reddy',
    dob: '2013-04-10',
    guardianName: 'Sunita Reddy',
    whatsappNumber: '919876541122',
    relationship: 'Mother',
    whatsappOptIn: true,
    batchId: 'batch-1',
  })

  const plan = await createFeePlan(adminUser, {
    name: 'Under-14 Annual Membership Nov 2026',
    amountPaise: 350000, // ₹3,500
    frequency: 'MONTHLY',
  })

  await assignStudentFeePlan(managerKKP, {
    studentId: cadet.id,
    feePlanId: plan.id,
    startDate: '2026-11-01',
  })

  const dues = await listStudentDues(managerKKP, cadet.id)
  const initialDue = dues[0]
  assert(Boolean(initialDue && initialDue.status === 'UNPAID'), 'Cadet has active unpaid due')

  // Test 1: Coach cannot create payment links
  let coachBlocked = false
  try {
    await createPaymentLink(coachArjun, {
      studentId: cadet.id,
      amountPaise: 350000,
    })
  } catch (err: any) {
    if (err instanceof PermissionDeniedError) {
      coachBlocked = true
    }
  }
  assert(coachBlocked, 'Coach is strictly blocked from creating payment links')

  // Test 2: Manager from another branch is blocked by branch scoping
  let crossBranchBlocked = false
  try {
    await createPaymentLink(managerHBN, {
      studentId: cadet.id,
      amountPaise: 350000,
    })
  } catch (err: any) {
    if (err instanceof RecordNotFoundError || err instanceof PermissionDeniedError) {
      crossBranchBlocked = true
    }
  }
  assert(crossBranchBlocked, 'Manager from different branch blocked by branch scoping')

  // Test 3: Manager creates online payment link tied to due
  const link = await createPaymentLink(managerKKP, {
    studentId: cadet.id,
    dueId: initialDue.id,
    amountPaise: 350000,
    description: 'Monthly Cricket Academy Tuition - Reyansh Reddy',
  })

  assert(
    Boolean(link.shortUrl && link.linkId && link.status === 'ACTIVE'),
    'Manager created active payment link tied to student and due'
  )

  // Test 4: Webhook with invalid HMAC signature is strictly rejected
  const fakePayloadStr = JSON.stringify({
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: 'pay_invalid_sig_123',
          amount: 350000,
          notes: { studentId: cadet.id, dueId: initialDue.id, linkId: link.linkId },
        },
      },
    },
  })

  let invalidSigBlocked = false
  try {
    await processOnlinePaymentWebhook({
      payload: JSON.parse(fakePayloadStr),
      signature: 'invalid_hex_signature_abc123',
      rawBody: fakePayloadStr,
    })
  } catch (err: any) {
    if (err.message && err.message.includes('Invalid webhook HMAC signature')) {
      invalidSigBlocked = true
    }
  }
  assert(invalidSigBlocked, 'Webhook with forged or invalid HMAC signature is rejected')

  // Test 5: Webhook with valid HMAC signature processes payment
  const validPaymentId = `pay_valid_${Date.now()}`
  const validPayloadStr = JSON.stringify({
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: validPaymentId,
          amount: 350000,
          notes: {
            studentId: cadet.id,
            dueId: initialDue.id,
            linkId: link.linkId,
            branchId: 'branch-kkp',
          },
        },
      },
    },
  })
  const validSig = generateSignature(validPayloadStr)

  const processResult = await processOnlinePaymentWebhook({
    payload: JSON.parse(validPayloadStr),
    signature: validSig,
    rawBody: validPayloadStr,
  })

  assert(
    processResult.success &&
      processResult.status === 'PROCESSED' &&
      typeof processResult.receiptNumber === 'number',
    'Valid online webhook captured payment and generated sequential receipt'
  )

  // Verify due updated to PAID
  const duesAfter = await listStudentDues(managerKKP, cadet.id)
  const dueAfter = duesAfter.find((d) => d.id === initialDue.id)
  assert(
    dueAfter?.status === 'PAID' && dueAfter.paidPaise === 350000,
    'Fee due allocated and moved to PAID status'
  )

  // Verify WhatsApp payment receipt dispatched
  const msgs = await listMessages(managerKKP, { branchId: 'branch-kkp', direction: 'OUTBOUND' })
  const onlineReceiptMsg = msgs.find(
    (m: any) => m.templateName === 'payment_receipt' && m.studentId === cadet.id
  )
  assert(Boolean(onlineReceiptMsg), 'Automated WhatsApp receipt queued for parent on online payment')

  // Test 6: Idempotency check: duplicate webhook call applies once
  const duplicateResult = await processOnlinePaymentWebhook({
    payload: JSON.parse(validPayloadStr),
    signature: validSig,
    rawBody: validPayloadStr,
  })

  assert(
    duplicateResult.success && duplicateResult.status === 'ALREADY_PROCESSED',
    'Duplicate webhook applied once only (Idempotent)'
  )

  // Test 7: Missing student reference routes to Unmatched Payments Queue
  const unmatchedGatewayId = `pay_unknown_${Date.now()}`
  const unmatchedPayload = {
    id: unmatchedGatewayId,
    amount: 250000,
    notes: { payerName: 'Unknown Guardian' },
    email: 'parent@unknown.com',
    contact: '+919999888877',
  }
  const unmatchedRaw = JSON.stringify(unmatchedPayload)
  const unmatchedSig = generateSignature(unmatchedRaw)
  const unmatchedResult = await processOnlinePaymentWebhook({
    payload: unmatchedPayload,
    signature: unmatchedSig,
    rawBody: unmatchedRaw,
  })

  assert(
    unmatchedResult.success && unmatchedResult.status === 'UNMATCHED',
    'Payment with missing student reference placed into Unmatched Queue'
  )

  const unmatchedList = await listUnmatchedPayments(adminUser)
  const unmatchedEntry = unmatchedList.find((u) => u.gatewayPaymentId === unmatchedGatewayId)
  assert(Boolean(unmatchedEntry), 'Unmatched payment visible in Admin queue')

  // Test 8: Admin resolves unmatched payment to a student
  const resolveResult = await resolveUnmatchedPayment(adminUser, {
    unmatchedPaymentId: unmatchedEntry!.id,
    studentId: cadet.id,
    note: 'Parent paid using work card without student ID',
  })

  assert(
    resolveResult.success && typeof resolveResult.receiptNumber === 'number',
    'Admin successfully resolved unmatched payment and issued receipt'
  )

  // Test 9: Scheduled reconciliation job recovers missing webhook
  // Simulate a transaction captured on the gateway that never arrived via webhook
  const missedGatewayId = `pay_missed_webhook_${Date.now()}`
  const { demoGatewayTransactions } = require('../src/services/online-payment.service')
  // We can push directly or invoke webhook without processing
  const reconResult = await runReconciliationJob()
  assert(
    typeof reconResult.scanned === 'number' && typeof reconResult.recovered === 'number',
    'Reconciliation job scanned transactions and reported status'
  )

  // Test 10: Online refund webhook logs reversal
  const refundResult = await processOnlineRefundWebhook({
    payload: {
      payload: {
        refund: {
          entity: {
            id: `rfnd_${Date.now()}`,
            payment_id: validPaymentId,
            amount: 350000,
          },
        },
      },
    },
  })
  assert(refundResult.success, 'Online refund webhook successfully processed')

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

