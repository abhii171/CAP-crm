import {
  queueOutboundMessage,
  retryFailedMessage,
  handleInboundReply,
  listMessages,
  listTemplates,
  renderTemplate,
  isOptedIn,
} from '../src/services/whatsapp.service'
import { UserContext, RecordNotFoundError } from '../src/lib/rbac'

console.log('🧪 Running Step 1.8 WhatsApp Platform Automated Tests...')

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

async function runTests() {
  // Test 1: Template rendering correctly substitutes variables
  const rendered = renderTemplate('admission_welcome', {
    cadetName: 'Virat',
    studentCode: 'KKP-000099',
    branchName: 'CPA Kukatpally',
  })
  assert(
    rendered.includes('Virat') && rendered.includes('KKP-000099') && rendered.includes('CPA Kukatpally'),
    'Template registry renders text with variables correctly'
  )

  // Test 2: Message to opted-in recipient dispatches and delivers
  const msg1 = await queueOutboundMessage(managerKKP, {
    branchId: 'branch-kkp',
    recipientPhone: '+919876543210',
    templateName: 'admission_welcome',
    variables: {
      cadetName: 'Aditya Sharma',
      studentCode: 'KKP-000001',
      branchName: 'CPA Kukatpally',
    },
  })
  assert(
    msg1.status === 'DELIVERED' && msg1.attempts === 1 && !msg1.skipReason,
    'Message to opted-in recipient dispatches with DELIVERED status'
  )

  // Test 3: Message to opted-out recipient is SKIPPED with reason
  const msg2 = await queueOutboundMessage(managerKKP, {
    branchId: 'branch-kkp',
    recipientPhone: '+919123456789', // Opted-out in demo map
    templateName: 'fee_reminder',
    variables: {
      amount: '2500',
      cadetName: 'Test Cadet',
      dueDate: '2026-11-10',
      paymentLink: 'https://cpa.in/pay',
    },
  })
  assert(
    msg2.status === 'SKIPPED' &&
      typeof msg2.skipReason === 'string' &&
      msg2.skipReason.includes('Opt-out enforced'),
    'Message to non-opted-in recipient is SKIPPED with opt-out reason'
  )

  // Test 4: Simulated network gateway failure sets FAILED status
  const failedMsg = await queueOutboundMessage(managerKKP, {
    branchId: 'branch-kkp',
    recipientPhone: '+919999900000', // Ends in 0000 simulates failure
    templateName: 'notice_broadcast',
    variables: {
      branchName: 'CPA Kukatpally',
      headline: 'Rain Stoppage',
      details: 'Ground wet, sessions delayed.',
    },
  })
  assert(
    failedMsg.status === 'FAILED' && failedMsg.attempts === 1 && failedMsg.error !== null,
    'Gateway delivery failure records FAILED status with error details'
  )

  // Test 5: Manual retry succeeds and increments attempt counter
  const retriedMsg = await retryFailedMessage(managerKKP, failedMsg.id)
  assert(
    retriedMsg.status === 'DELIVERED' && retriedMsg.attempts === 2 && retriedMsg.error === null,
    'Retrying failed message delivers and increments attempt counter to 2'
  )

  // Test 6: Inbound 'STOP' immediately opts out the parent and records opt-out
  const testPhone = '+919888877777'
  const stopReply = await handleInboundReply({
    fromPhone: testPhone,
    body: 'STOP please',
    branchId: 'branch-kkp',
  })
  assert(
    stopReply.action === 'OPT_OUT' && stopReply.message.inboxStatus === 'RESOLVED',
    "Inbound 'STOP' triggers immediate OPT_OUT action and marks message RESOLVED"
  )

  // Verify subsequent outbound to that phone is now SKIPPED
  const msgAfterStop = await queueOutboundMessage(managerKKP, {
    branchId: 'branch-kkp',
    recipientPhone: testPhone,
    templateName: 'absence_alert',
    variables: { cadetName: 'Cadet', batchName: 'Morning', sessionDate: '2026-10-30' },
  })
  assert(
    msgAfterStop.status === 'SKIPPED',
    'Outbound message after parent STOP reply is automatically SKIPPED'
  )

  // Test 7: Inbound 'BALANCE' keyword triggers automated balance reply
  const balanceReply = await handleInboundReply({
    fromPhone: '+919876543210',
    body: 'What is my current balance dues?',
    branchId: 'branch-kkp',
  })
  assert(
    balanceReply.action === 'BALANCE_REPLY' &&
      typeof balanceReply.replyText === 'string' &&
      balanceReply.replyText.includes('Outstanding dues'),
    "Inbound 'BALANCE' keyword auto-responds with outstanding balance"
  )

  // Test 8: General parent inquiry routes to shared branch inbox as UNREAD
  const generalReply = await handleInboundReply({
    fromPhone: '+919876543210',
    body: 'Can Rahul bring his own cricket kit tomorrow morning?',
    branchId: 'branch-kkp',
  })
  assert(
    generalReply.action === 'INBOX' && generalReply.message.inboxStatus === 'UNREAD',
    'General inbound parent message routes to shared branch inbox as UNREAD'
  )

  // Test 9: Manager cannot retry or access messages from another branch
  let crossBranchBlocked = false
  try {
    await retryFailedMessage(managerHBN, failedMsg.id) // failedMsg is in branch-kkp
  } catch (err) {
    if (err instanceof RecordNotFoundError) {
      crossBranchBlocked = true
    }
  }
  assert(crossBranchBlocked, 'Cross-branch message access is blocked with RecordNotFoundError')

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exit(1)
}

runTests().catch((err) => {
  console.error('Unexpected test error:', err)
  process.exit(1)
})

