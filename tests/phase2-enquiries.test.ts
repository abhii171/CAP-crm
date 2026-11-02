import {
  createEnquiry,
  listEnquiries,
  getEnquiryById,
  checkEnquiryDuplicates,
  resetDemoEnquiries,
  setFeatureFlag,
  resetDemoFlags,
  normalizePhone,
  isValidE164Phone,
} from '../src/modules/phase2'
import { UserContext, PermissionDeniedError, RecordNotFoundError } from '../src/lib/rbac'
import { getAuditLogs } from '../src/lib/audit'
import { POST as publicEnquiriesPost } from '../src/app/api/public/v1/enquiries/route'
import { NextRequest } from 'next/server'

console.log('🧪 Running Step 2.1 Phase 2 Enquiry Model & Capture Automated Tests...')

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

const ownedManagerKKP: UserContext = {
  userId: 'usr-mgr-kkp',
  loginId: 'MGR-KKP-001',
  role: 'MANAGER',
  branchId: 'branch-kkp',
  branchType: 'OWNED',
}

const franchiseManagerHBN: UserContext = {
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

async function runEnquiryTests() {
  resetDemoFlags()
  resetDemoEnquiries()

  // ── Test Suite 1: Phone Normalisation & Validation ────────────────────────
  assert(normalizePhone('9876543210') === '+919876543210', 'Normalises 10-digit number to +919876543210')
  assert(normalizePhone('09876543210') === '+919876543210', 'Normalises leading 0 to +919876543210')
  assert(normalizePhone('+91 98765 43210') === '+919876543210', 'Strips spaces and formats E.164')
  assert(normalizePhone('919876543210') === '+919876543210', 'Prepends plus to 12-digit 91 number')
  assert(isValidE164Phone('+919876543210') === true, 'Validates true for standard E.164 format')
  assert(isValidE164Phone('12345') === false, 'Rejects invalid short phone numbers')

  // ── Test Suite 2: Feature Flag Guard (A-12) ───────────────────────────────
  let flagBlocked = false
  try {
    await createEnquiry(ownedManagerKKP, {
      branchId: 'branch-kkp',
      childName: 'Aarav Kumar',
      phone: '9876543201',
      source: 'WALK_IN',
    })
  } catch (err: any) {
    if (err instanceof PermissionDeniedError) {
      flagBlocked = true
    }
  }
  assert(flagBlocked, 'Enquiry creation blocked when p2.enquiries flag is disabled')

  // Enable feature flag for branch-kkp and branch-hbn
  await setFeatureFlag('p2.enquiries', 'branch-kkp', true)
  await setFeatureFlag('p2.enquiries', 'branch-hbn', true)

  // ── Test Suite 3: Manual Staff Enquiry Capture (E-1, W2-1) ─────────────────
  const enq1 = await createEnquiry(ownedManagerKKP, {
    branchId: 'branch-kkp',
    childName: 'Aarav Kumar',
    guardianName: 'Ramesh Kumar',
    phone: '9876543201',
    childAgeYears: 11,
    source: 'WALK_IN',
    whatsappConsent: true,
  })

  assert(enq1.id.startsWith('enq-'), 'Created enquiry has generated ID')
  assert(enq1.childName === 'Aarav Kumar', 'Child name correctly stored')
  assert(enq1.phoneNormalized === '+919876543201', 'Normalised phone correctly stored in E.164')
  assert(enq1.status === 'NEW', 'Status defaults to NEW')
  assert(enq1.version === 1, 'Initial version set to 1 for optimistic locking')
  assert(enq1.possibleDuplicate === false, 'Clean enquiry has possibleDuplicate = false')

  // ── Test Suite 4: Duplicate Detection (E-3, W2-1) ─────────────────────────
  // Duplicate against existing enquiry
  const dupCheck1 = await checkEnquiryDuplicates('09876543201')
  assert(dupCheck1.hasDuplicate === true, 'Identifies duplicate enquiry matching normalised phone')

  // Creating duplicate enquiry flags possibleDuplicate = true
  const enqDup = await createEnquiry(ownedManagerKKP, {
    branchId: 'branch-kkp',
    childName: 'Aarav K.',
    phone: '09876543201',
    source: 'PHONE',
  })
  assert(enqDup.possibleDuplicate === true, 'Duplicate phone automatically sets possibleDuplicate = true')

  // Duplicate against existing student guardian
  const dupStudent = await checkEnquiryDuplicates('+919876543210')
  assert(dupStudent.hasDuplicate === true, 'Identifies duplicate against Phase 1 Student Guardian phone')

  // ── Test Suite 5: Cross-Branch & Role RBAC (D-02, AUTH-PHASE-2 § 2.1) ──────
  // Manager of branch-kkp cannot create enquiry for branch-hbn
  let crossBranchBlocked = false
  try {
    await createEnquiry(ownedManagerKKP, {
      branchId: 'branch-hbn',
      childName: 'Rohit Sharma',
      phone: '9876543209',
      source: 'WALK_IN',
    })
  } catch (err: any) {
    if (err instanceof RecordNotFoundError) {
      crossBranchBlocked = true
    }
  }
  assert(crossBranchBlocked, 'Manager cannot create enquiry for another branch (RecordNotFoundError 404)')

  // Franchise manager CAN create enquiry for their own branch (Decision D-02)
  const franchiseEnq = await createEnquiry(franchiseManagerHBN, {
    branchId: 'branch-hbn',
    childName: 'Kunal Verma',
    phone: '9876543288',
    source: 'WALK_IN',
  })
  assert(franchiseEnq.branchId === 'branch-hbn', 'Franchise manager successfully creates enquiry for own branch (D-02)')

  // Coach CANNOT create or read enquiries
  let coachBlocked = false
  try {
    await createEnquiry(coachArjun, {
      branchId: 'branch-kkp',
      childName: 'Suresh Raina',
      phone: '9876543299',
      source: 'WALK_IN',
    })
  } catch (err: any) {
    if (err instanceof PermissionDeniedError) {
      coachBlocked = true
    }
  }
  assert(coachBlocked, 'Coach is blocked from creating enquiries (PermissionDeniedError 403)')

  let coachReadBlocked = false
  try {
    await listEnquiries(coachArjun)
  } catch (err: any) {
    if (err instanceof PermissionDeniedError) {
      coachReadBlocked = true
    }
  }
  assert(coachReadBlocked, 'Coach is blocked from reading enquiries (PermissionDeniedError 403)')

  // Manager only sees own branch enquiries
  const kkpList = await listEnquiries(ownedManagerKKP)
  assert(kkpList.every((e) => e.branchId === 'branch-kkp'), 'Manager query results are strictly isolated to own branch')

  // ── Test Suite 6: Public Website Intake Form (W2-2, A-10) ──────────────────
  const publicEnq = await createEnquiry(null, {
    branchId: 'branch-kkp',
    childName: 'Web Cadet',
    guardianName: 'Web Guardian',
    phone: '9876543999',
    source: 'WEBSITE',
    whatsappConsent: true,
    createdVia: 'WEBSITE_FORM',
  })

  assert(publicEnq.createdVia === 'WEBSITE_FORM', 'Public form sets createdVia = WEBSITE_FORM')
  assert(publicEnq.assignedToUserId === null, 'Public enquiry starts unassigned in branch queue')

  // Verify Audit Log entry exists with no PII (A-10)
  const auditLogs = await getAuditLogs(adminUser, { action: 'p2.enquiry.create_public' })
  assert(auditLogs.length > 0, 'Audit entry p2.enquiry.create_public successfully recorded')
  const lastLog = auditLogs[0]
  assert(
    !JSON.stringify(lastLog.after).includes('Web Cadet') && !JSON.stringify(lastLog.after).includes('9876543999'),
    'Audit log contains zero personal data (PII) in payload (A-10)'
  )

  // ── Test Suite 7: Public Route Handler Abuse & Security Checks (A-10) ─────
  // 1. Honeypot traps bot
  const hpReq = new NextRequest('http://localhost:3000/api/public/v1/enquiries', {
    method: 'POST',
    body: JSON.stringify({
      branchId: 'branch-kkp',
      childName: 'Spam Bot',
      phone: '9876543201',
      website_hp: 'http://spam.org',
    }),
  })
  const hpRes = await publicEnquiriesPost(hpReq)
  const hpData = await hpRes.json()
  assert(hpRes.status === 200 && hpData.success === true, 'Honeypot field triggers silent success discard')

  // 2. Disabled branch flag returns 404
  await setFeatureFlag('p2.enquiries', 'branch-gch', false)
  const disabledReq = new NextRequest('http://localhost:3000/api/public/v1/enquiries', {
    method: 'POST',
    body: JSON.stringify({
      branchId: 'branch-gch',
      childName: 'Child',
      phone: '9876543201',
    }),
  })
  const disabledRes = await publicEnquiriesPost(disabledReq)
  assert(disabledRes.status === 404, 'Public endpoint returns 404 when p2.enquiries flag is disabled for branch')

  // 3. Invalid phone returns 400
  const badPhoneReq = new NextRequest('http://localhost:3000/api/public/v1/enquiries', {
    method: 'POST',
    body: JSON.stringify({
      branchId: 'branch-kkp',
      childName: 'Child',
      phone: '123',
    }),
  })
  const badPhoneRes = await publicEnquiriesPost(badPhoneReq)
  assert(badPhoneRes.status === 400, 'Public endpoint rejects invalid phone format with 400')

  // 4. Successful public post returns generic message without leaking IDs
  const validReq = new NextRequest('http://localhost:3000/api/public/v1/enquiries', {
    method: 'POST',
    body: JSON.stringify({
      branchId: 'branch-kkp',
      childName: 'Ananya Sharma',
      guardianName: 'Priya Sharma',
      phone: '9876511223',
      whatsappConsent: true,
    }),
  })
  const validRes = await publicEnquiriesPost(validReq)
  const validData = await validRes.json()
  assert(
    validRes.status === 200 &&
      validData.success === true &&
      !('id' in validData) &&
      !('enquiry' in validData),
    'Public endpoint response contains strictly generic message with zero leaked IDs (A-10)'
  )

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n==================================================')
  console.log(`Phase 2 Enquiry Test Results: ${passed} passed, ${failed} failed`)
  if (failed > 0) {
    process.exit(1)
  }
}

runEnquiryTests().catch((err) => {
  console.error('Test execution error:', err)
  process.exit(1)
})
