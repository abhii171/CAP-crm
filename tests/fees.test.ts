import {
  listFeePlans,
  createFeePlan,
  assignStudentFeePlan,
  listStudentDues,
  pauseDueReminders,
  waiveDue,
} from '../src/services/fee.service'
import { UserContext, PermissionDeniedError, RecordNotFoundError } from '../src/lib/rbac'

console.log('🧪 Running Step 1.10 Fee Plans & Dues Automated Tests...')

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
  // Test 1: Admin can create global fee plan
  const newPlan = await createFeePlan(adminUser, {
    name: 'Weekend Masterclass Clinic',
    amountPaise: 400000, // ₹4,000
    frequency: 'MONTHLY',
  })
  assert(
    newPlan.name === 'Weekend Masterclass Clinic' &&
      newPlan.amountPaise === 400000 &&
      newPlan.branchId === null,
    'Admin successfully created global fee plan'
  )

  // Test 2: Manager cannot create fee plans (Admin only)
  let managerCreateBlocked = false
  try {
    await createFeePlan(managerKKP, {
      name: 'Unauthorized Plan',
      amountPaise: 100000,
      frequency: 'MONTHLY',
    })
  } catch (err) {
    if (err instanceof PermissionDeniedError) {
      managerCreateBlocked = true
    }
  }
  assert(managerCreateBlocked, 'Manager is blocked from creating fee plans (PermissionDeniedError)')

  // Test 3: Assign fee plan to student generates scheduled FeeDue
  const assignResult = await assignStudentFeePlan(managerKKP, {
    studentId: 'std-1',
    feePlanId: 'plan-1',
    startDate: '2026-12-01',
  })
  assert(
    assignResult.due.amountPaise === 250000 &&
      assignResult.due.periodStart === '2026-12-01' &&
      assignResult.due.status === 'UNPAID',
    'Assigning fee plan generates scheduled due with correct amount and period'
  )

  // Test 4: Duplicate period assignment does not duplicate due record
  const dupAssignResult = await assignStudentFeePlan(managerKKP, {
    studentId: 'std-1',
    feePlanId: 'plan-1',
    startDate: '2026-12-01',
  })
  assert(
    dupAssignResult.due.id === assignResult.due.id,
    'Duplicate assignment for same period returns existing due without duplicating'
  )

  // Test 5: Dynamic due status resolution (OVERDUE for past unpaid, UNPAID for future)
  const dues = await listStudentDues(managerKKP, 'std-2')
  const overdueDue = dues.find((d) => d.id === 'due-2')
  assert(
    overdueDue !== undefined && overdueDue.status === 'OVERDUE',
    'Past due date with unpaid balance is resolved as OVERDUE'
  )

  // Test 6: Pausing automated fee reminders requires mandatory justification reason
  let emptyPauseBlocked = false
  try {
    await pauseDueReminders(managerKKP, assignResult.due.id, '2026-12-15', 'No')
  } catch {
    emptyPauseBlocked = true
  }
  assert(emptyPauseBlocked, 'Pausing reminders requires detailed justification reason (min 5 chars)')

  const pausedDue = await pauseDueReminders(
    managerKKP,
    assignResult.due.id,
    '2026-12-15',
    'Parent requested 10-day extension due to family emergency'
  )
  assert(
    Boolean(
      pausedDue.remindersPausedUntil === '2026-12-15' &&
        pausedDue.pauseReason?.includes('extension')
    ),
    'Reminders successfully paused until specified date with logged reason'
  )

  // Test 7: Waiving due marks status as WAIVED with audit note
  const waived = await waiveDue(
    managerKKP,
    assignResult.due.id,
    'Annual merit scholarship waiver approved by academy committee'
  )
  assert(
    Boolean(waived.status === 'WAIVED' && waived.waiveNote?.includes('scholarship')),
    'Waived due marks status WAIVED with mandatory justification note'
  )

  // Test 8: Coach is strictly forbidden from viewing student fees (AUTH-AND-PERMISSIONS.md § 8.3)
  let coachFeeViewBlocked = false
  try {
    await listStudentDues(coachArjun, 'std-1')
  } catch (err) {
    if (err instanceof PermissionDeniedError) {
      coachFeeViewBlocked = true
    }
  }
  assert(coachFeeViewBlocked, 'Coach is strictly forbidden from viewing student dues (PermissionDeniedError)')

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exit(1)
}

runTests().catch((err) => {
  console.error('Unexpected test error:', err)
  process.exit(1)
})
