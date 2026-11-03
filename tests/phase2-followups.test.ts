import {
  createEnquiry,
  getEnquiryById,
  createFollowUp,
  markFollowUpDone,
  listFollowUps,
  reassignEnquiries,
  listNeedsOwnerEnquiries,
  resetDemoEnquiries,
  resetDemoFollowUps,
  setFeatureFlag,
  resetDemoFlags,
} from '../src/modules/phase2'
import { UserContext, PermissionDeniedError } from '../src/lib/rbac'
import { getAuditLogs } from '../src/lib/audit'
import { handleInboundReply } from '../src/services/whatsapp.service'
import { listUsers, createUser, deactivateUser } from '../src/services/user.service'

console.log('🧪 Running Step 2.3 Phase 2 Follow-ups & Assignment Automated Tests...')

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

async function runFollowUpTests() {
  resetDemoFlags()
  resetDemoEnquiries()
  resetDemoFollowUps()

  await setFeatureFlag('p2.enquiries', 'global', true)

  // ── Test Suite 1: Follow-up Creation & Derived nextFollowUpAt (A-06, W2-5) ─
  const enq = await createEnquiry(managerKKP, {
    branchId: 'branch-kkp',
    childName: 'Aryan Patel',
    phone: '9876543111',
    source: 'WALK_IN',
  })

  assert(enq.status === 'NEW', 'Enquiry initially at stage NEW')
  assert(enq.nextFollowUpAt === null, 'Enquiry has nextFollowUpAt = null initially')

  const tomorrow = new Date(Date.now() + 86400000).toISOString()
  const fuRes = await createFollowUp(managerKKP, {
    enquiryId: enq.id,
    dueAt: tomorrow,
    channel: 'CALL',
    note: 'Initial call to discuss batch schedules',
  })

  assert(fuRes.followUp.id.startsWith('fu-'), 'Follow-up created with ID')
  assert(fuRes.followUp.channel === 'CALL', 'Follow-up channel stored as CALL')
  assert(fuRes.followUp.doneAt === null, 'Follow-up is initially pending')

  // Check derived nextFollowUpAt
  const updatedEnq = await getEnquiryById(managerKKP, enq.id)
  assert(
    Boolean(updatedEnq.nextFollowUpAt) && new Date(updatedEnq.nextFollowUpAt!).toISOString() === new Date(tomorrow).toISOString(),
    'Enquiry derived nextFollowUpAt automatically updated to earliest due follow-up'
  )

  // ── Test Suite 2: Mark Follow-Up Done & Stage Advance (W2-5) ───────────────
  const dayAfterTomorrow = new Date(Date.now() + 86400000 * 2).toISOString()
  const doneRes = await markFollowUpDone(managerKKP, {
    followUpId: fuRes.followUp.id,
    outcome: 'Spoke with mother; interested in weekend trial',
    scheduleNext: {
      dueAt: dayAfterTomorrow,
      channel: 'WHATSAPP',
      note: 'Send trial details on WhatsApp',
    },
  })

  assert(doneRes.followUp.doneAt !== null, 'Follow-up marked done with timestamp')
  assert(doneRes.followUp.outcome === 'Spoke with mother; interested in weekend trial', 'Follow-up outcome recorded')

  // Enquiry status automatically moved from NEW to CONTACTED
  const contactedEnq = await getEnquiryById(managerKKP, enq.id)
  assert(contactedEnq.status === 'CONTACTED', 'Marking first follow-up done advances enquiry from NEW to CONTACTED (W2-5)')

  // Next follow-up was scheduled and nextFollowUpAt updated
  assert(doneRes.nextFollowUp !== undefined, 'Next follow-up was scheduled')
  assert(
    new Date(contactedEnq.nextFollowUpAt!).toISOString() === new Date(dayAfterTomorrow).toISOString(),
    'nextFollowUpAt updated to second follow-up date'
  )

  // ── Test Suite 3: Overdue Marking (E-7) ───────────────────────────────────
  const pastDueTime = new Date(Date.now() - 3600000 * 5).toISOString() // 5 hours ago
  const overdueFu = await createFollowUp(managerKKP, {
    enquiryId: enq.id,
    dueAt: pastDueTime,
    channel: 'CALL',
    note: 'Urgent callback requested',
  })

  const overdueList = await listFollowUps(managerKKP, { overdueOnly: true })
  assert(overdueList.some((f) => f.id === overdueFu.followUp.id), 'Past due follow-up is correctly flagged as overdue')

  // ── Test Suite 4: WhatsApp Follow-up & STOP Suppression (A-11, W2-5) ──────
  // 1. Simulate inbound STOP to suppress phone number
  const stopPhone = '+919988771122'
  await handleInboundReply({
    fromPhone: stopPhone,
    body: 'STOP',
    branchId: 'branch-kkp',
  })

  const stopEnquiry = await createEnquiry(managerKKP, {
    branchId: 'branch-kkp',
    childName: 'Suppressed Child',
    phone: stopPhone,
    source: 'PHONE',
    whatsappConsent: true,
  })

  // Attempting to send WhatsApp follow-up to STOP number is suppressed
  const suppressedFu = await createFollowUp(managerKKP, {
    enquiryId: stopEnquiry.id,
    dueAt: tomorrow,
    channel: 'WHATSAPP',
    sendWhatsAppNow: true,
    branchName: 'CPA Kukatpally',
  })

  assert(suppressedFu.whatsappSent === false, 'WhatsApp follow-up is suppressed for phone that sent STOP (A-11)')
  assert(
    suppressedFu.whatsappSkippedReason?.includes('Phase 1 opt-out store') === true,
    'Suppression reason recorded accurately'
  )

  // 2. Normal opted-in phone dispatches WhatsApp message
  const allowedEnq = await createEnquiry(managerKKP, {
    branchId: 'branch-kkp',
    childName: 'Active Child',
    phone: '+919876543210',
    source: 'WALK_IN',
    whatsappConsent: true,
  })

  const sentFu = await createFollowUp(managerKKP, {
    enquiryId: allowedEnq.id,
    dueAt: tomorrow,
    channel: 'WHATSAPP',
    sendWhatsAppNow: true,
    branchName: 'CPA Kukatpally',
  })

  assert(sentFu.whatsappSent === true, 'WhatsApp follow-up successfully sent to opted-in number using template')

  // ── Test Suite 5: Single & Bulk Lead Reassignment (E-6, W2-6) ─────────────
  // Reassign to active staff in same branch (usr-cch-1)
  const reassignRes = await reassignEnquiries(managerKKP, {
    enquiryIds: [enq.id, allowedEnq.id],
    targetUserId: 'usr-cch-1',
    note: 'Reassigned for trial scheduling',
  })

  assert(reassignRes.updatedCount === 2, 'Bulk reassigned 2 enquiries')
  const reassignedEnq = await getEnquiryById(managerKKP, enq.id)
  assert(reassignedEnq.assignedToUserId === 'usr-cch-1', 'Owner updated on enquiry')

  // Cannot reassign to user in another branch (for manager)
  let crossBranchReassignBlocked = false
  try {
    await reassignEnquiries(managerKKP, {
      enquiryIds: [enq.id],
      targetUserId: 'usr-mgr-hbn', // Different branch
    })
  } catch (err: any) {
    if (err instanceof PermissionDeniedError) {
      crossBranchReassignBlocked = true
    }
  }
  assert(crossBranchReassignBlocked, 'Cross-branch staff reassignment blocked for branch manager')

  // Cannot reassign to inactive staff member
  const allUsers = await listUsers(adminUser)
  let inactiveUser = allUsers.find((u) => u.isActive === false)
  if (!inactiveUser) {
    const coachRes = await createUser(adminUser, {
      name: 'Deactivated Coach',
      role: 'COACH',
      branchId: 'branch-kkp',
    })
    await deactivateUser(adminUser, coachRes.user.id, 'Testing inactive assignment guardrail')
    inactiveUser = { ...coachRes.user, isActive: false }
  }

  let inactiveReassignBlocked = false
  try {
    await reassignEnquiries(managerKKP, {
      enquiryIds: [enq.id],
      targetUserId: inactiveUser.id,
    })
  } catch (err: any) {
    if (err.message && err.message.includes('inactive')) {
      inactiveReassignBlocked = true
    }
  }
  assert(inactiveReassignBlocked, 'Reassigning enquiries to an inactive user is strictly blocked')

  // ── Test Suite 6: Needs Owner Query (E-11, W2-6) ──────────────────────────
  // Create unassigned enquiry
  const unassigned = await createEnquiry(null, {
    branchId: 'branch-kkp',
    childName: 'Unassigned Cadet',
    phone: '9876549876',
    source: 'WEBSITE',
  })

  const needsOwnerList = await listNeedsOwnerEnquiries(managerKKP, 'branch-kkp')
  assert(needsOwnerList.some((e) => e.id === unassigned.id), 'Unassigned website enquiry appears in Needs Owner list')

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n==================================================')
  console.log(`Phase 2 Follow-ups Test Results: ${passed} passed, ${failed} failed`)
  if (failed > 0) {
    process.exit(1)
  }
}

runFollowUpTests().catch((err) => {
  console.error('Test execution error:', err)
  process.exit(1)
})

