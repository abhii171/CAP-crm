import { can, authorize, UserContext, RecordNotFoundError, PermissionDeniedError } from '../src/lib/rbac'
import { scopeBranchWhere, assertBranchAccess, sanitizeStudentForRole } from '../src/lib/branch-query'

console.log('🧪 Running RBAC & Branch Scoping Automated Test Suite...')

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

const ownedManager: UserContext = {
  userId: 'usr-mgr-kkp',
  loginId: 'MGR-KKP-001',
  role: 'MANAGER',
  branchId: 'branch-kkp',
  branchType: 'OWNED',
}

const franchiseManager: UserContext = {
  userId: 'usr-mgr-hbn',
  loginId: 'MGR-HBN-001',
  role: 'MANAGER',
  branchId: 'branch-hbn',
  branchType: 'FRANCHISE',
}

const coachUser: UserContext = {
  userId: 'usr-cch-1',
  loginId: 'CCH-KKP-001',
  role: 'COACH',
  branchId: 'branch-kkp',
}

// ── Test 1: Cross-Branch Access Denial ────────────────────────
console.log('\n[Test Suite 1: Cross-Branch Scoping & Isolation]')

// Owned manager accessing their own branch -> OK
try {
  assertBranchAccess(ownedManager, 'branch-kkp', 'Student')
  assert(true, 'Manager allowed access to own branch (branch-kkp)')
} catch {
  assert(false, 'Manager allowed access to own branch (branch-kkp)')
}

// Manager accessing another branch -> Throws 404 RecordNotFoundError (never 403 to prevent leakage)
try {
  assertBranchAccess(ownedManager, 'branch-hbn', 'Student')
  assert(false, 'Manager MUST NOT access another branch (branch-hbn)')
} catch (e: any) {
  assert(
    e instanceof RecordNotFoundError && e.statusCode === 404,
    'Manager accessing another branch throws RecordNotFoundError with 404'
  )
}

// Admin accessing any branch -> Allowed
try {
  assertBranchAccess(adminUser, 'branch-kkp')
  assertBranchAccess(adminUser, 'branch-hbn')
  assert(true, 'Admin can access all branches')
} catch {
  assert(false, 'Admin can access all branches')
}

// ── Test 2: Query Scoping Helper (scopeBranchWhere) ────────────
console.log('\n[Test Suite 2: Automated Query Scoping]')

const managerQuery = scopeBranchWhere(ownedManager, { status: 'ACTIVE' })
assert(
  managerQuery.branchId === 'branch-kkp' && managerQuery.status === 'ACTIVE',
  'scopeBranchWhere forces branchId = branch-kkp for manager'
)

const coachQuery = scopeBranchWhere(coachUser, { date: '2026-10-30' })
assert(
  coachQuery.branchId === 'branch-kkp',
  'scopeBranchWhere forces branchId for coach'
)

const adminQuery = scopeBranchWhere(adminUser, { status: 'ACTIVE' })
assert(
  adminQuery.branchId === undefined,
  'scopeBranchWhere leaves branchId unscoped for Admin by default'
)

const adminFilteredQuery = scopeBranchWhere(adminUser, { status: 'ACTIVE' }, 'branch-hbn')
assert(
  adminFilteredQuery.branchId === 'branch-hbn',
  'scopeBranchWhere applies explicit filter when Admin chooses a branch'
)

// ── Test 3: Owned vs Franchise Rules ──────────────────────────
console.log('\n[Test Suite 3: Owned vs Franchise Branch Permissions]')

// Owned manager CAN create/edit batches & coaches
assert(can(ownedManager, 'batch:create'), 'Owned branch manager can create batches')
assert(can(ownedManager, 'coach:create'), 'Owned branch manager can create coaches')
assert(can(ownedManager, 'batch:edit'), 'Owned branch manager can edit batches')

// Franchise manager CANNOT create/edit batches & coaches (view-only)
assert(!can(franchiseManager, 'batch:create'), 'Franchise manager CANNOT create batches (view only)')
assert(!can(franchiseManager, 'coach:create'), 'Franchise manager CANNOT create coaches (view only)')
assert(!can(franchiseManager, 'batch:edit'), 'Franchise manager CANNOT edit batches')
assert(can(franchiseManager, 'batch:view'), 'Franchise manager CAN view batches')
assert(can(franchiseManager, 'coach:view'), 'Franchise manager CAN view coaches')

// ── Test 4: Coach Fee & Contact Isolation ──────────────────────
console.log('\n[Test Suite 4: Coach Privacy & Fee Isolation]')

// Coach never sees fees
assert(!can(coachUser, 'fee:view'), 'Coach CANNOT view fees')
assert(!can(coachUser, 'fee:record_payment'), 'Coach CANNOT record payments')
assert(!can(coachUser, 'fee:reverse'), 'Coach CANNOT reverse fees')
assert(!can(coachUser, 'daily_close:perform'), 'Coach CANNOT close daily cash')

// Coach can mark attendance for their own sessions
assert(can(coachUser, 'attendance:mark'), 'Coach CAN mark session attendance')

// Student Sanitization for Coach:
const rawStudent = {
  id: 'std-1',
  name: 'Aditya Sharma',
  emergencyPhone: '+919876543210',
  guardian: {
    name: 'Rakesh Sharma',
    whatsappNumber: '+919876543210',
    altNumber: '+919876543299',
  },
  dues: [{ id: 'due-1', amountPaise: 250000 }],
}

const forCoach = sanitizeStudentForRole(rawStudent, 'COACH', false)
assert(
  forCoach.guardian.whatsappNumber === undefined && forCoach.guardian.altNumber === undefined,
  'Parent phone numbers are completely stripped for coach'
)
assert(
  forCoach.emergencyPhone === undefined,
  'Emergency phone is hidden when not in live session'
)
assert(
  (forCoach as any).dues === undefined,
  'Fee dues history is stripped for coach'
)

const forCoachLive = sanitizeStudentForRole(rawStudent, 'COACH', true)
assert(
  forCoachLive.emergencyPhone === '+919876543210',
  'Emergency phone is visible to coach strictly during live session'
)

// ── Final Test Summary ────────────────────────────────────────
console.log('\n' + '='.repeat(50))
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  process.exit(1)
} else {
  console.log('🎉 All RBAC and Branch Scoping test cases passed cleanly!')
}

