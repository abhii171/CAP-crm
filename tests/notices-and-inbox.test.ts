import {
  previewNoticeRecipients,
  dispatchNotice,
  listInboxMessages,
  updateInboxMessageStatus,
  replyToInboxMessage,
} from '../src/services/notice.service'
import { handleInboundReply } from '../src/services/whatsapp.service'
import { admitStudent } from '../src/services/student.service'
import { getSessionsForDate } from '../src/services/attendance.service'
import { UserContext, PermissionDeniedError, RecordNotFoundError } from '../src/lib/rbac'

console.log('🧪 Running Step 1.15 Reply Inbox & Notices Automated Tests...')

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
  const noticeDate = '2026-11-25'

  // Step 1: Admit cadets for notice testing (one opted-in, one opted-out)
  const cadetOptIn = await admitStudent(managerKKP, {
    branchId: 'branch-kkp',
    name: 'Ananya Deshmukh',
    dob: '2013-03-22',
    guardianName: 'Prakash Deshmukh',
    whatsappNumber: '919876500111',
    relationship: 'Father',
    whatsappOptIn: true,
    batchId: 'batch-1',
  })

  const cadetOptOut = await admitStudent(managerKKP, {
    branchId: 'branch-kkp',
    name: 'Rohan Nambiar',
    dob: '2012-11-05',
    guardianName: 'Suresh Nambiar',
    whatsappNumber: '919876500222',
    relationship: 'Father',
    whatsappOptIn: false, // Opted out!
    batchId: 'batch-1',
  })

  // Test 1: Coach cannot preview or dispatch notices
  let coachBlocked = false
  try {
    await previewNoticeRecipients(coachArjun, { branchId: 'branch-kkp' })
  } catch (err: any) {
    if (err instanceof PermissionDeniedError) {
      coachBlocked = true
    }
  }
  assert(coachBlocked, 'Coach is strictly forbidden from previewing or dispatching notices (message:send)')

  // Test 2: Manager from different branch is blocked
  let crossBranchBlocked = false
  try {
    await previewNoticeRecipients(managerHBN, { branchId: 'branch-kkp' })
  } catch (err: any) {
    if (err instanceof RecordNotFoundError || err instanceof PermissionDeniedError) {
      crossBranchBlocked = true
    }
  }
  assert(crossBranchBlocked, 'Manager from different branch blocked by branch scoping')

  // Test 3: Notice Recipient Preview accurately counts opted-in vs opted-out
  const preview = await previewNoticeRecipients(managerKKP, {
    branchId: 'branch-kkp',
    batchIds: ['batch-1'],
  })

  assert(
    preview.optedInCount >= 1 && preview.optedOutCount >= 1,
    'Notice recipient preview accurately tallies opted-in vs opted-out counts'
  )
  const optInPreview = preview.recipients.find((r) => r.studentId === cadetOptIn.id)
  const optOutPreview = preview.recipients.find((r) => r.studentId === cadetOptOut.id)
  assert(
    Boolean(optInPreview?.optedIn === true && optOutPreview?.optedIn === false),
    'Preview flags each cadet guardian opt-in compliance state'
  )

  // Test 4: Dispatch Rain Cancellation Notice with automated session cancellation
  const dispatchResult = await dispatchNotice(managerKKP, {
    branchId: 'branch-kkp',
    batchIds: ['batch-1'],
    headline: 'Pitch Waterlogged - Morning Practice Cancelled',
    details: 'Heavy overnight rain has rendered the pitch unplayable. All outdoor nets cancelled.',
    cancelSessions: true,
    sessionDate: noticeDate,
  })

  assert(
    dispatchResult.success &&
      dispatchResult.dispatchedCount >= 1 &&
      dispatchResult.cancelledSessionsCount >= 1,
    'Dispatched broadcast notice to opted-in guardians and cancelled batch sessions'
  )

  // Verify the batch session on that date is now CANCELLED
  const sessions = await getSessionsForDate(managerKKP, noticeDate, 'branch-kkp')
  const cancelledSession = sessions.find((s) => s.batchId === 'batch-1')
  assert(
    Boolean(cancelledSession && cancelledSession.status === 'CANCELLED'),
    'Batch training session automatically marked CANCELLED on notice date'
  )

  // Test 5: Shared Reply Inbox receives inbound message from parent
  const parentInbound = await handleInboundReply({
    fromPhone: '919876500111',
    body: 'Good morning coach, will the afternoon nets be open if rain stops?',
    branchId: 'branch-kkp',
  })

  assert(
    parentInbound.action === 'INBOX' && parentInbound.message.inboxStatus === 'UNREAD',
    'General inbound message placed into shared branch inbox with UNREAD status'
  )

  // Test 6: List Inbox messages with matched cadet name and 24h service window
  const inboxItems = await listInboxMessages(managerKKP, { branchId: 'branch-kkp' })
  const thread = inboxItems.find((i) => i.id === parentInbound.message.id)
  assert(
    Boolean(thread && thread.cadetName === 'Ananya Deshmukh'),
    'Shared inbox accurately matches parent phone to cadet name'
  )
  assert(
    Boolean(thread && thread.canFreeFormReply === true),
    'Recent message (<24 hours) permits free-form reply'
  )

  // Test 7: Update inbox message triage status to IN_PROGRESS
  const statusUpdate = await updateInboxMessageStatus(managerKKP, {
    messageId: thread!.id,
    newStatus: 'IN_PROGRESS',
  })
  assert(statusUpdate.success && statusUpdate.status === 'IN_PROGRESS', 'Inbox message triaged to IN_PROGRESS')

  // Test 8: Free-form reply within 24-hour customer service window
  const replyResult = await replyToInboxMessage(managerKKP, {
    messageId: thread!.id,
    replyText: 'Hello Mr. Deshmukh, pitch inspection will take place at 2 PM. We will notify you.',
  })

  assert(
    replyResult.success && Boolean(replyResult.replyMessageId),
    'Manager successfully sent free-form reply within 24-hour window'
  )

  // Verify thread status transitioned to RESOLVED
  const inboxAfterReply = await listInboxMessages(managerKKP, { branchId: 'branch-kkp' })
  const threadAfter = inboxAfterReply.find((i) => i.id === thread!.id)
  assert(threadAfter?.inboxStatus === 'RESOLVED', 'Thread automatically transitioned to RESOLVED after reply')

  // Test 9: Outside 24-hour window enforces approved Meta template
  // Create simulated aged message received 30 hours ago
  const agedMessage = await handleInboundReply({
    fromPhone: '919876500111',
    body: 'Inquiring about weekend tournament schedule from last month',
    branchId: 'branch-kkp',
  })
  // Artificially age the message to 30 hours ago
  agedMessage.message.createdAt = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString()
  agedMessage.message.inboxStatus = 'UNREAD'

  // Attempt free-form reply outside 24h window
  let windowExpiredBlocked = false
  try {
    await replyToInboxMessage(managerKKP, {
      messageId: agedMessage.message.id,
      replyText: 'Free form response to an old message',
    })
  } catch (err: any) {
    if (err.message && err.message.includes('24-hour customer service window has expired')) {
      windowExpiredBlocked = true
    }
  }
  assert(
    windowExpiredBlocked,
    'Reply outside 24-hour window strictly enforces approved Meta template requirement'
  )

  // Reply outside 24-hour window with approved template succeeds
  const templateReply = await replyToInboxMessage(managerKKP, {
    messageId: agedMessage.message.id,
    replyText: 'Please see updated weekend fixture on our academy notice board.',
    templateName: 'notice_broadcast',
  })
  assert(templateReply.success, 'Template-based reply outside 24-hour window succeeds')

  // Test 10: Escalation levels (24h -> MANAGER, 48h -> ADMIN)
  const unread26hMsg = await handleInboundReply({
    fromPhone: '919876500111',
    body: 'Urgent query unread for over a day',
    branchId: 'branch-kkp',
  })
  unread26hMsg.message.createdAt = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString()
  unread26hMsg.message.inboxStatus = 'UNREAD'

  const unread50hMsg = await handleInboundReply({
    fromPhone: '919876500111',
    body: 'Critical grievance unread for over 2 days',
    branchId: 'branch-kkp',
  })
  unread50hMsg.message.createdAt = new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString()
  unread50hMsg.message.inboxStatus = 'UNREAD'

  const escalatedInbox = await listInboxMessages(managerKKP, { branchId: 'branch-kkp' })
  const item26h = escalatedInbox.find((i) => i.id === unread26hMsg.message.id)
  const item50h = escalatedInbox.find((i) => i.id === unread50hMsg.message.id)

  assert(item26h?.escalationLevel === 'MANAGER', 'Message unread for >24h escalated to MANAGER')
  assert(item50h?.escalationLevel === 'ADMIN', 'Message unread for >48h escalated to ADMIN')

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
