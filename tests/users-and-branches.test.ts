import { createBranch, listBranches } from '../src/services/branch.service'
import { createUser, deactivateUser, reactivateUser, resetUserPassword, listUsers } from '../src/services/user.service'
import { UserContext, PermissionDeniedError } from '../src/lib/rbac'

console.log('🧪 Running Step 1.5 Users & Branch Administration Automated Tests...')

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

async function runTests() {
  // Test 1: Admin creates new branch
  const newBranch = await createBranch(adminUser, {
    code: 'GCH',
    name: 'CPA Gachibowli',
    type: 'OWNED',
    city: 'Hyderabad',
  })
  assert(newBranch.code === 'GCH' && newBranch.name === 'CPA Gachibowli', 'Admin successfully created branch GCH')

  // Test 2: Manager cannot create branch
  try {
    await createBranch(ownedManager, {
      code: 'SEC',
      name: 'CPA Secunderabad',
      type: 'OWNED',
    })
    assert(false, 'Manager MUST NOT be allowed to create a branch')
  } catch (err) {
    assert(err instanceof PermissionDeniedError, 'Manager creating branch throws PermissionDeniedError')
  }

  // Test 3: Admin creates a Manager with unique sequential Login ID and temporary password
  const managerResult = await createUser(adminUser, {
    name: 'Virender Sehwag',
    role: 'MANAGER',
    branchId: newBranch.id,
  })
  assert(
    managerResult.user.loginId.startsWith('MGR-GCH-'),
    `Manager issued sequential login ID (${managerResult.user.loginId})`
  )
  assert(
    managerResult.temporaryPassword.length >= 10,
    'Manager issued secure temporary password with min 10 characters'
  )
  assert(
    managerResult.user.mustChangePassword === true,
    'mustChangePassword is true for new user'
  )

  // Test 4: Owned branch manager creates a Coach in own branch
  const coachResult = await createUser(ownedManager, {
    name: 'Harbhajan Singh',
    role: 'COACH',
    branchId: 'branch-kkp',
  })
  assert(
    coachResult.user.loginId.startsWith('CCH-KKP-'),
    `Coach issued sequential login ID for branch (${coachResult.user.loginId})`
  )

  // Test 5: Franchise manager CANNOT create a coach
  try {
    await createUser(franchiseManager, {
      name: 'Zaheer Khan',
      role: 'COACH',
      branchId: 'branch-hbn',
    })
    assert(false, 'Franchise manager MUST NOT create a coach')
  } catch (err) {
    assert(err instanceof PermissionDeniedError, 'Franchise manager creating coach throws PermissionDeniedError')
  }

  // Test 6: Deactivate user
  await deactivateUser(ownedManager, coachResult.user.id, 'Coach moved abroad')
  const userListAfterDeactivate = await listUsers(ownedManager)
  const deactivatedCoach = userListAfterDeactivate.find((u) => u.id === coachResult.user.id)
  assert(
    deactivatedCoach?.isActive === false,
    'User status set to isActive: false upon deactivation (never deleted)'
  )

  // Test 7: Reset password issues new temporary password
  const resetResult = await resetUserPassword(ownedManager, coachResult.user.id)
  assert(
    resetResult.temporaryPassword.length >= 10,
    'Reset password generates new temporary password'
  )

  console.log('\n' + '='.repeat(50))
  console.log(`Step 1.5 Test Results: ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

runTests().catch((err) => {
  console.error(err)
  process.exit(1)
})

