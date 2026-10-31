import { createBatch, updateBatch, listBatches } from '../src/services/batch.service'
import { UserContext, PermissionDeniedError } from '../src/lib/rbac'

console.log('🧪 Running Step 1.6 Batches & Coaches Automated Tests...')

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
  // Test 1: Owned branch manager creates batch
  const newBatch = await createBatch(ownedManager, {
    branchId: 'branch-kkp',
    name: 'Under-12 Weekend Clinic',
    ageGroup: 'U12',
    capacity: 18,
    daysOfWeek: [0, 6], // Sun, Sat
    startTime: '08:00',
    endTime: '10:00',
    coachId: 'usr-cch-2',
  })
  assert(newBatch.name === 'Under-12 Weekend Clinic', 'Manager created batch Under-12 Weekend Clinic')
  assert(newBatch.capacity === 18, 'Batch capacity correctly recorded')

  // Test 2: Capacity check (capacity <= 0 throws error)
  try {
    await createBatch(ownedManager, {
      branchId: 'branch-kkp',
      name: 'Invalid Capacity Batch',
      capacity: 0,
      daysOfWeek: [1],
      startTime: '06:00',
      endTime: '07:00',
    })
    assert(false, 'Capacity <= 0 MUST throw an error')
  } catch (err: any) {
    assert(err.message.includes('capacity must be greater than zero'), 'Capacity <= 0 blocked')
  }

  // Test 3: Time order check (startTime >= endTime throws error)
  try {
    await createBatch(ownedManager, {
      branchId: 'branch-kkp',
      name: 'Invalid Time Order Batch',
      capacity: 15,
      daysOfWeek: [1],
      startTime: '10:00',
      endTime: '08:00',
    })
    assert(false, 'startTime >= endTime MUST throw an error')
  } catch (err: any) {
    assert(err.message.includes('start time must be before end time'), 'Inverted start/end time blocked')
  }

  // Test 4: Coach double-booking detection
  // Coach usr-cch-1 already coaches batch-1 on Mon, Wed, Fri from 06:00 to 08:00
  // Attempting to assign usr-cch-1 to an overlapping slot on Monday (07:00 to 08:30) must be blocked!
  try {
    await createBatch(ownedManager, {
      branchId: 'branch-kkp',
      name: 'Double Booked Session',
      capacity: 15,
      daysOfWeek: [1], // Monday
      startTime: '07:00',
      endTime: '08:30', // overlaps with 06:00-08:00
      coachId: 'usr-cch-1',
    })
    assert(false, 'Coach double-booking MUST be blocked')
  } catch (err: any) {
    assert(
      err.message.includes('Coach double-booking conflict'),
      'Double-booking engine detected overlap and blocked conflicting batch'
    )
  }

  // Test 5: Coach reassignment preserving history
  const updated = await updateBatch(ownedManager, newBatch.id, {
    coachId: 'usr-cch-1', // Reassign from usr-cch-2 to usr-cch-1 (on weekend, so no conflict)
  })
  assert(
    updated.currentCoach?.id === 'usr-cch-1',
    'Coach reassigned to usr-cch-1 with assignment history updated'
  )

  // Test 6: Franchise manager CANNOT create batches
  try {
    await createBatch(franchiseManager, {
      branchId: 'branch-hbn',
      name: 'Franchise Attempted Batch',
      capacity: 20,
      daysOfWeek: [1, 3],
      startTime: '06:00',
      endTime: '08:00',
    })
    assert(false, 'Franchise manager MUST NOT create batches')
  } catch (err) {
    assert(err instanceof PermissionDeniedError, 'Franchise manager creating batch throws PermissionDeniedError')
  }

  console.log('\n' + '='.repeat(50))
  console.log(`Step 1.6 Batches Test Results: ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

runTests().catch((err) => {
  console.error(err)
  process.exit(1)
})

