import {
  createEnquiry,
  listEnquiries,
  getEnquiryById,
  updateEnquiry,
  resetDemoEnquiries,
} from '../src/modules/phase2/enquiries/enquiry.service'
import { UserContext } from '../src/lib/rbac'
import { loadDemoData } from '../src/lib/demo-storage'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`)
}

function assertStrictEqual<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) throw new Error(`Expected ${String(expected)} but got ${String(actual)}. ${message || ''}`)
}

async function runPersistenceTests() {
  console.log('🧪 Running Enquiry Persistence & Reload Verification Tests...\n')

  const adminCaller: UserContext = {
    userId: 'demo-user-admin',
    loginId: 'ADM-001',
    role: 'ADMIN',
    branchId: null,
  }

  const managerKkpCaller: UserContext = {
    userId: 'demo-user-mgr-kkp',
    loginId: 'MGR-KKP-01',
    role: 'MANAGER',
    branchId: 'branch-kkp',
  }

  const managerHbnCaller: UserContext = {
    userId: 'demo-user-mgr-hbn',
    loginId: 'MGR-HBN-01',
    role: 'MANAGER',
    branchId: 'branch-hbn',
  }

  // 1. Create a new enquiry for branch-kkp
  const newEnquiry = await createEnquiry(managerKkpCaller, {
    branchId: 'branch-kkp',
    childName: 'Rohit Sharma Jr',
    guardianName: 'Rohit Sharma Sr',
    phone: '9876543210',
    source: 'WALK_IN',
    childAgeYears: 12,
  })

  assert(Boolean(newEnquiry.id), 'Enquiry ID should be generated')
  assertStrictEqual(newEnquiry.childName, 'Rohit Sharma Jr')
  console.log('  ✓ Enquiry created successfully with generated ID:', newEnquiry.id)

  // 2. Verify that on fresh read (simulating page reload), the enquiry is retrieved
  const refreshedList = await listEnquiries(managerKkpCaller)
  const foundInList = refreshedList.find((e) => e.id === newEnquiry.id)
  assert(Boolean(foundInList), 'Newly created enquiry MUST be present after list reload')
  assertStrictEqual(foundInList?.childName, 'Rohit Sharma Jr')
  console.log('  ✓ List refresh returns newly created enquiry')

  // 3. Verify getEnquiryById directly
  const single = await getEnquiryById(managerKkpCaller, newEnquiry.id)
  assertStrictEqual(single.id, newEnquiry.id)
  assertStrictEqual(single.childName, 'Rohit Sharma Jr')
  console.log('  ✓ getEnquiryById successfully fetches saved record on reload')

  // 4. Update the enquiry details
  const updated = await updateEnquiry(managerKkpCaller, newEnquiry.id, {
    childName: 'Rohit Sharma Updated',
    guardianName: 'Rohit Guardian Updated',
    phone: '9876543211',
  })
  assertStrictEqual(updated.childName, 'Rohit Sharma Updated')
  console.log('  ✓ updateEnquiry updates details successfully')

  // 5. Verify that after updating, reload (re-fetching by ID and list) preserves the updated values
  const reloadedSingle = await getEnquiryById(managerKkpCaller, newEnquiry.id)
  assertStrictEqual(reloadedSingle.childName, 'Rohit Sharma Updated')
  assertStrictEqual(reloadedSingle.guardianName, 'Rohit Guardian Updated')
  assertStrictEqual(reloadedSingle.phone, '9876543211')
  console.log('  ✓ Reloading after edit strictly preserves updated lead details')

  // 6. Branch isolation: Manager of branch-hbn must NOT see branch-kkp's enquiry
  const hbnList = await listEnquiries(managerHbnCaller)
  const shouldBeMissing = hbnList.find((e) => e.id === newEnquiry.id)
  assertStrictEqual(shouldBeMissing, undefined, 'Branch-hbn manager must NOT see branch-kkp enquiry')
  console.log('  ✓ Manager from another branch cannot view enquiry (isolated to own branch)')

  // 7. Admin sees enquiry across branches
  const adminList = await listEnquiries(adminCaller)
  const adminFound = adminList.find((e) => e.id === newEnquiry.id)
  assert(Boolean(adminFound), 'Admin must see enquiry across branches')
  console.log('  ✓ Admin can view enquiry across branches')

  // 8. Verify disk persistence: load directly from disk via loadDemoData
  const diskData = loadDemoData<any[]>('enquiries', [])
  const foundOnDisk = diskData.find((e) => e.id === newEnquiry.id)
  assert(Boolean(foundOnDisk), 'Enquiry record must be present in disk storage')
  assertStrictEqual(foundOnDisk.childName, 'Rohit Sharma Updated')
  console.log('  ✓ Record is permanently persisted on disk storage')

  console.log('\n==================================================')
  console.log('All Enquiry Persistence & Reload Tests Passed! (8/8)')
}

runPersistenceTests().catch((err) => {
  console.error('❌ Test failed:', err)
  const proc = (globalThis as any).process
  if (proc?.exit) {
    proc.exit(1)
  } else {
    throw err
  }
})

