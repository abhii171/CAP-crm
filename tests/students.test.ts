import {
  admitStudent,
  checkDuplicateStudent,
  transferStudentBatch,
  deactivateStudent,
  reactivateStudent,
  listStudents,
  getStudentById,
} from '../src/services/student.service'
import { UserContext, PermissionDeniedError } from '../src/lib/rbac'

console.log('🧪 Running Step 1.7 Students & Consent Automated Tests...')

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

const coachUser: UserContext = {
  userId: 'usr-cch-kkp-1',
  loginId: 'CCH-KKP-001',
  role: 'COACH',
  branchId: 'branch-kkp',
  branchType: 'OWNED',
}

async function runTests() {
  // Test 1: Admit new student creates sequential studentCode
  const newStudent = await admitStudent(ownedManager, {
    branchId: 'branch-kkp',
    name: 'Siddharth Rao',
    dob: '2013-05-10',
    gender: 'Male',
    guardianName: 'Venkatesh Rao',
    whatsappNumber: '+919988776655',
    whatsappOptIn: true,
    batchId: 'batch-1',
  })
  assert(
    newStudent.name === 'Siddharth Rao' &&
      newStudent.studentCode.startsWith('KKP-') &&
      newStudent.currentBatch?.id === 'batch-1',
    'Admit student generates correct sequential studentCode and batch enrollment'
  )

  // Test 2: Duplicate check detects matching parent phone and similar name
  const dupCheck1 = await checkDuplicateStudent(ownedManager, {
    branchId: 'branch-kkp',
    name: 'Siddharth Rao',
    whatsappNumber: '+919988776655',
  })
  assert(
    dupCheck1.hasDuplicate === true && dupCheck1.duplicate?.studentCode === newStudent.studentCode,
    'Duplicate check identifies existing cadet with same phone and name'
  )

  // Test 3: Sibling admission with same parent phone links guardian
  const siblingStudent = await admitStudent(ownedManager, {
    branchId: 'branch-kkp',
    name: 'Aanya Rao',
    dob: '2016-08-20',
    gender: 'Female',
    guardianName: 'Venkatesh Rao',
    whatsappNumber: '+919988776655',
    whatsappOptIn: true,
    batchId: 'batch-1',
  })
  assert(
    siblingStudent.name === 'Aanya Rao' &&
      siblingStudent.guardianPhone === '+919988776655' &&
      siblingStudent.studentCode !== newStudent.studentCode,
    'Sibling admission reuses guardian phone and generates distinct studentCode'
  )

  // Test 4: Transfer student batch updates active batch
  await transferStudentBatch(ownedManager, newStudent.id, 'batch-2', '2026-11-01')
  const updatedStudent = await getStudentById(ownedManager, newStudent.id)
  assert(
    updatedStudent.currentBatch?.id === 'batch-2',
    'Transfer student batch updates active batch'
  )

  // Test 5: Deactivate student marks INACTIVE
  const deactRes = await deactivateStudent(ownedManager, newStudent.id, 'Family relocating')
  const deactStudent = await getStudentById(ownedManager, newStudent.id)
  assert(
    deactStudent.status === 'INACTIVE' && typeof deactRes.outstandingDuesPaise === 'number',
    'Deactivate student marks status as INACTIVE and reports dues'
  )

  // Test 6: Reactivate student restores ACTIVE status
  await reactivateStudent(ownedManager, newStudent.id, 'batch-1')
  const reactStudent = await getStudentById(ownedManager, newStudent.id)
  assert(
    reactStudent.status === 'ACTIVE' && reactStudent.currentBatch?.id === 'batch-1',
    'Reactivate student restores ACTIVE status and enrole into batch'
  )

  // Test 7: Coach cannot admit student (PermissionDeniedError)
  let coachAdmitBlocked = false
  try {
    await admitStudent(coachUser, {
      branchId: 'branch-kkp',
      name: 'Unauthorized Cadet',
      dob: '2012-01-01',
      guardianName: 'Parent',
      whatsappNumber: '+919111111111',
      whatsappOptIn: true,
      batchId: 'batch-1',
    })
  } catch (err) {
    if (err instanceof PermissionDeniedError) {
      coachAdmitBlocked = true
    }
  }
  assert(coachAdmitBlocked, 'Coach is blocked from admitting students (PermissionDeniedError)')

  // Test 8: Coach viewing student list has guardian phone redacted for privacy
  const coachStudents = await listStudents(coachUser)
  const allPhonesRedacted = coachStudents.every((s) => s.guardianPhone === undefined)
  assert(allPhonesRedacted, 'Coach viewing students has guardian phones redacted (Privacy & Anti-Poaching)')

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exit(1)
}

runTests().catch((err) => {
  console.error('Unexpected test error:', err)
  process.exit(1)
})

