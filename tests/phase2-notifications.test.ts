import {
  createNotificationEvent,
  listNotificationsForUser,
  markNotificationRead,
  markAllNotificationsRead,
  dismissNotification,
  updateNotificationPreference,
  getNotificationSummary,
  resetDemoNotifications,
  evaluateUnassignedEnquiries,
  evaluateOverdueFollowUps,
  runAllEvaluators,
  createEnquiry,
  createFollowUp,
  resetDemoEnquiries,
  resetDemoFollowUps,
  setFeatureFlag,
  resetDemoFlags,
} from '../src/modules/phase2'
import { UserContext, PermissionDeniedError } from '../src/lib/rbac'
import { getAuditLogs } from '../src/lib/audit'

console.log('🧪 Running Step 2.5 Phase 2 Notification Framework Automated Tests...')

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

// ── Test Personas ──────────────────────────────────────────────
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

async function runNotificationTests() {
  resetDemoFlags()
  resetDemoNotifications()
  resetDemoEnquiries()
  resetDemoFollowUps()

  await setFeatureFlag('p2.enquiries', 'global', true)
  await setFeatureFlag('p2.notifications', 'global', true)

  // ── Test Suite 1: Idempotent Event Dispatch (W2-10) ────────────────────────
  const dedupeKey1 = 'unassigned_enquiry:enq-test-101'
  const firstDispatch = await createNotificationEvent(adminUser, {
    type: 'NEW_ENQUIRY_UNASSIGNED',
    branchId: 'branch-kkp',
    dedupeKey: dedupeKey1,
    payload: { enquiryId: 'enq-test-101', childName: 'Ayaan K.' },
  })
  assert(firstDispatch.createdNotificationsCount > 0, 'First dispatch creates notifications')

  // Second dispatch with same dedupeKey must create 0 new notifications
  const secondDispatch = await createNotificationEvent(adminUser, {
    type: 'NEW_ENQUIRY_UNASSIGNED',
    branchId: 'branch-kkp',
    dedupeKey: dedupeKey1,
    payload: { enquiryId: 'enq-test-101', childName: 'Ayaan K.' },
  })
  assert(secondDispatch.createdNotificationsCount === 0, 'Second dispatch with same dedupeKey creates zero duplicate notifications (Idempotent)')
  assert(firstDispatch.event.id === secondDispatch.event.id, 'Returns existing event record')

  // ── Test Suite 2: Branch Scoping & Recipient Resolution ────────────────────
  // The event for branch-kkp should be delivered to managerKKP
  const kkpNotifs = await listNotificationsForUser(managerKKP)
  assert(kkpNotifs.length > 0, 'Notification delivered to target branch manager')
  assert(kkpNotifs[0].title === 'New Unassigned Website Enquiry', 'Notification title formatted correctly from catalogue')
  assert(kkpNotifs[0].message.includes('Ayaan K.'), 'Notification message correctly populated with payload data')

  // Cross-branch isolation check: managerHBN must see 0 notifications from branch-kkp
  const hbnNotifs = await listNotificationsForUser(managerHBN)
  const leakedFromKKP = hbnNotifs.some((n) => n.branchId === 'branch-kkp')
  assert(!leakedFromKKP, 'Cross-branch isolation preserved: manager from Branch HBN sees zero Branch KKP notifications')

  // ── Test Suite 3: Notification Centre Lifecycle ────────────────────────────
  const targetNotifId = kkpNotifs[0].id

  // 1. Mark single notification as read
  await markNotificationRead(managerKKP, targetNotifId)
  const afterReadList = await listNotificationsForUser(managerKKP)
  const readNotif = afterReadList.find((n) => n.id === targetNotifId)
  assert(readNotif?.isRead === true, 'Notification marked as read')
  assert(Boolean(readNotif?.readAt), 'readAt timestamp recorded')

  // Filter unread only returns 0
  const unreadOnlyList = await listNotificationsForUser(managerKKP, { unreadOnly: true })
  assert(unreadOnlyList.every((n) => n.id !== targetNotifId), 'Unread filter excludes read notification')

  // 2. Dismiss notification
  await dismissNotification(managerKKP, targetNotifId)
  const afterDismissList = await listNotificationsForUser(managerKKP)
  assert(!afterDismissList.some((n) => n.id === targetNotifId), 'Dismissed notification hidden from active list')

  // ── Test Suite 4: Critical Events Immutability (W2-10) ──────────────────────
  // Create critical reconciliation discrepancy event
  const reconEvent = await createNotificationEvent(adminUser, {
    type: 'RECON_MISMATCH',
    dedupeKey: 'recon_mismatch:kkp:2026-11-01',
    branchId: 'branch-kkp',
    severity: 'CRITICAL',
    payload: { diffPaise: 50000, branchId: 'branch-kkp' },
    recipientUserIds: [managerKKP.userId],
  })

  const kkpWithCritical = await listNotificationsForUser(managerKKP)
  const criticalNotif = kkpWithCritical.find((n) => n.type === 'RECON_MISMATCH')
  assert(Boolean(criticalNotif), 'Critical reconciliation notification delivered')
  assert(criticalNotif?.severity === 'CRITICAL', 'Severity is CRITICAL')

  // Attempting to dismiss critical notification should be BLOCKED
  let criticalDismissBlocked = false
  try {
    await dismissNotification(managerKKP, criticalNotif!.id)
  } catch (err: any) {
    if (err.message.includes('Critical')) {
      criticalDismissBlocked = true
    }
  }
  assert(criticalDismissBlocked, 'Critical severity notification CANNOT be dismissed without resolution')

  // Attempting to disable preferences for critical event should be BLOCKED
  let criticalPreferenceBlock = false
  try {
    await updateNotificationPreference(managerKKP, {
      eventType: 'RECON_MISMATCH',
      inApp: false,
    })
  } catch (err: any) {
    if (err.message.includes('Critical')) {
      criticalPreferenceBlock = true
    }
  }
  assert(criticalPreferenceBlock, 'Preferences for critical notification types CANNOT be disabled')

  // ── Test Suite 5: User Notification Preferences (W2-10) ────────────────────
  // Manager disables inApp notifications for FOLLOWUP_OVERDUE
  await updateNotificationPreference(managerKKP, {
    eventType: 'FOLLOWUP_OVERDUE',
    inApp: false,
  })

  // Create overdue follow-up event
  await createNotificationEvent(adminUser, {
    type: 'FOLLOWUP_OVERDUE',
    branchId: 'branch-kkp',
    dedupeKey: 'fu_test_suppressed:999',
    payload: { enquiryId: 'enq-999', dueDate: '2026-11-01' },
    recipientUserIds: [managerKKP.userId],
  })

  const afterMuteNotifs = await listNotificationsForUser(managerKKP)
  assert(!afterMuteNotifs.some((n) => n.type === 'FOLLOWUP_OVERDUE'), 'Notification was muted according to user preference')

  // ── Test Suite 6: Scheduled Evaluators Engine (W2-10) ──────────────────────
  // Create an unassigned public website enquiry to be discovered by evaluator
  await createEnquiry(null, { // null caller = public website
    branchId: 'branch-kkp',
    childName: 'Reyansh Public',
    phone: '9876541199',
    source: 'WEBSITE',
  })

  // Run unassigned enquiry evaluator
  const eval1Count = await evaluateUnassignedEnquiries()
  assert(eval1Count > 0, 'Unassigned enquiry evaluator discovered public enquiry and created notification')

  // Run master evaluator suite twice to prove end-to-end idempotency
  const run1 = await runAllEvaluators()
  const run2 = await runAllEvaluators()
  assert(run2.totalNotificationsCreated === 0, 'Consecutive run of master evaluator creates ZERO duplicate notifications (Idempotent)')

  // ── Test Suite 7: Header Summary Badge & Audit Trail (T4) ──────────────────
  const summary = await getNotificationSummary(managerKKP)
  assert(summary.unreadCount > 0, 'Notification summary returns accurate unread count')
  assert(summary.criticalCount >= 1, 'Notification summary returns accurate critical alerts count')

  // Audit log contains zero personal phone data
  const notifAudits = await getAuditLogs({ action: 'p2.notification.event_created' })
  assert(notifAudits.length > 0, 'Audit entry p2.notification.event_created recorded')
  const rawAuditJson = JSON.stringify(notifAudits)
  assert(!rawAuditJson.includes('9876541199'), 'Notification audit log contains zero plain phone numbers (A-10)')

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n==================================================')
  console.log(`Phase 2 Notification Results: ${passed} passed, ${failed} failed`)
  if (failed > 0) {
    process.exit(1)
  }
}

runNotificationTests().catch((err) => {
  console.error('Test execution error:', err)
  process.exit(1)
})

