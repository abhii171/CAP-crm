import {
  runFeeReminderScheduler,
  isDueFlaggedForManager,
  resetReminderMilestonesForTest,
} from '../src/services/reminder.service'
import {
  createFeePlan,
  assignStudentFeePlan,
  pauseDueReminders,
  listStudentDues,
  demoFeeDues,
} from '../src/services/fee.service'
import { admitStudent } from '../src/services/student.service'
import { recordCashPayment } from '../src/services/payment.service'
import { handleInboundReply, listMessages } from '../src/services/whatsapp.service'
import { UserContext, PermissionDeniedError } from '../src/lib/rbac'

console.log('🧪 Running Step 1.14 Fee Reminders & Balance Queries Tests...')

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

async function runTests() {
  resetReminderMilestonesForTest()

  // 1. Setup Cadets
  const cadetA = await admitStudent(managerKKP, {
    branchId: 'branch-kkp',
    name: 'Vihaan Joshi',
    dob: '2012-08-20',
    guardianName: 'Amit Joshi',
    whatsappNumber: '919876599001',
    relationship: 'Father',
    whatsappOptIn: true,
    batchId: 'batch-1',
  })

  const cadetB = await admitStudent(managerKKP, {
    branchId: 'branch-kkp',
    name: 'Tanvi Joshi', // Sibling with same phone number
    dob: '2014-02-14',
    guardianName: 'Amit Joshi',
    whatsappNumber: '919876599001',
    relationship: 'Father',
    whatsappOptIn: true,
    batchId: 'batch-1',
  })

  const plan = await createFeePlan(adminUser, {
    name: 'Standard Cricket Coaching Plan',
    amountPaise: 300000, // ₹3,000
    frequency: 'MONTHLY',
  })

  // Assign plans
  await assignStudentFeePlan(managerKKP, {
    studentId: cadetA.id,
    feePlanId: plan.id,
    startDate: '2026-11-01',
  })

  await assignStudentFeePlan(managerKKP, {
    studentId: cadetB.id,
    feePlanId: plan.id,
    startDate: '2026-11-01',
  })

  const duesA = await listStudentDues(managerKKP, cadetA.id)
  const dueA = demoFeeDues.find((d) => d.studentId === cadetA.id)!

  // Set due dates for specific milestone testing
  // Today reference = 2026-11-10
  const refDate = '2026-11-10'

  // Test 1: T_MINUS_3 milestone (Due on 2026-11-13, ref date is 2026-11-10 -> 3 days before)
  dueA.dueDate = '2026-11-13'
  dueA.status = 'UNPAID'
  dueA.paidPaise = 0

  const resTMinus3 = await runFeeReminderScheduler(managerKKP, refDate)
  const reminderA = resTMinus3.remindersSent.find((r) => r.dueId === dueA.id)
  assert(
    Boolean(reminderA && reminderA.milestone === 'T_MINUS_3'),
    '3 days before due date triggers T_MINUS_3 friendly reminder'
  )
  assert(
    Boolean(reminderA && reminderA.paymentLink && reminderA.paymentLink.includes('http')),
    'Reminder includes unique online payment link'
  )

  // Test 2: Idempotency - running again on same date does not send duplicate reminder
  const resDup = await runFeeReminderScheduler(managerKKP, refDate)
  const dupReminder = resDup.remindersSent.find((r) => r.dueId === dueA.id)
  assert(dupReminder === undefined, 'Running scheduler again on same day suppresses duplicate reminder')

  // Test 3: T_ZERO milestone (Due today: 2026-11-10)
  resetReminderMilestonesForTest()
  dueA.dueDate = '2026-11-10'

  const resTZero = await runFeeReminderScheduler(managerKKP, refDate)
  const reminderZero = resTZero.remindersSent.find((r) => r.dueId === dueA.id)
  assert(
    Boolean(reminderZero && reminderZero.milestone === 'T_ZERO'),
    'On due date triggers T_ZERO due today reminder'
  )

  // Test 4: Overdue milestones: T_PLUS_3, T_PLUS_7, T_PLUS_14
  resetReminderMilestonesForTest()
  dueA.dueDate = '2026-11-07' // 3 days ago
  const resPlus3 = await runFeeReminderScheduler(managerKKP, refDate)
  assert(
    resPlus3.remindersSent.some((r) => r.dueId === dueA.id && r.milestone === 'T_PLUS_3'),
    '3 days overdue triggers T_PLUS_3 reminder'
  )

  resetReminderMilestonesForTest()
  dueA.dueDate = '2026-11-03' // 7 days ago
  const resPlus7 = await runFeeReminderScheduler(managerKKP, refDate)
  assert(
    resPlus7.remindersSent.some((r) => r.dueId === dueA.id && r.milestone === 'T_PLUS_7'),
    '7 days overdue triggers T_PLUS_7 reminder'
  )

  resetReminderMilestonesForTest()
  dueA.dueDate = '2026-10-27' // 14 days ago
  const resPlus14 = await runFeeReminderScheduler(managerKKP, refDate)
  assert(
    resPlus14.remindersSent.some((r) => r.dueId === dueA.id && r.milestone === 'T_PLUS_14'),
    '14 days overdue triggers T_PLUS_14 reminder'
  )

  // Test 5: Overdue > 14 days: reminders STOP and due is flagged for manager follow-up
  resetReminderMilestonesForTest()
  dueA.dueDate = '2026-10-20' // 21 days ago (> 14 days)
  const resOver14 = await runFeeReminderScheduler(managerKKP, refDate)
  assert(
    !resOver14.remindersSent.some((r) => r.dueId === dueA.id),
    'Reminders stop automatically after 14 days overdue'
  )
  assert(
    isDueFlaggedForManager(dueA.id) === true,
    'Due > 14 days overdue is flagged for manual manager follow-up'
  )

  // Test 6: Fully paid due is strictly skipped
  resetReminderMilestonesForTest()
  dueA.dueDate = '2026-11-13' // T_MINUS_3 milestone
  dueA.status = 'PAID'
  dueA.paidPaise = 300000

  const resPaid = await runFeeReminderScheduler(managerKKP, refDate)
  assert(
    !resPaid.remindersSent.some((r) => r.dueId === dueA.id),
    'Fully paid due is never sent fee reminders'
  )

  // Test 7: Paused reminders by manager are strictly suppressed
  resetReminderMilestonesForTest()
  dueA.status = 'UNPAID'
  dueA.paidPaise = 0
  await pauseDueReminders(managerKKP, dueA.id, '2026-11-20', 'Parent traveling abroad until 20th')

  const resPaused = await runFeeReminderScheduler(managerKKP, refDate)
  assert(
    !resPaused.remindersSent.some((r) => r.dueId === dueA.id),
    'Reminders paused by manager are strictly suppressed until paused date'
  )

  // Test 8: Dynamic parent balance query auto-reply
  // Parent sends "balance" via WhatsApp from phone 919876599001
  const balanceReply = await handleInboundReply({
    fromPhone: '919876599001',
    body: 'Can you please tell me my outstanding balance and dues?',
    branchId: 'branch-kkp',
  })

  assert(
    balanceReply.action === 'BALANCE_REPLY',
    'Inbound "balance" message triggers automated BALANCE_REPLY'
  )
  assert(
    Boolean(
      balanceReply.replyText &&
        (balanceReply.replyText.includes('Vihaan') || balanceReply.replyText.includes('Tanvi'))
    ),
    'Balance auto-reply accurately looks up cadet name'
  )
  assert(
    Boolean(balanceReply.replyText && balanceReply.replyText.includes('http')),
    'Balance auto-reply includes active payment link'
  )

  // Test 9: Coach cannot trigger reminder scheduler (fee:view permission denied)
  let coachBlocked = false
  try {
    await runFeeReminderScheduler(coachArjun, refDate)
  } catch (err: any) {
    if (err instanceof PermissionDeniedError) {
      coachBlocked = true
    }
  }
  assert(coachBlocked, 'Coach is forbidden from running fee reminder scheduler')

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

