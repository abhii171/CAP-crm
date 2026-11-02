import {
  createEnquiry,
  transitionEnquiryStage,
  bookTrialSession,
  markTrialOutcome,
  listTrialGuestsForBatch,
  listTrialsForEnquiry,
  convertEnquiryToStudent,
  repairHalfCompletedConversion,
  resetDemoEnquiries,
  resetDemoTrialSessions,
  setFeatureFlag,
  resetDemoFlags,
} from '../src/modules/phase2'
import { UserContext, PermissionDeniedError, RecordNotFoundError } from '../src/lib/rbac'
import { getAuditLogs } from '../src/lib/audit'
import { getBatchById, listBatches } from '../src/services/batch.service'
import { listStudents } from '../src/services/student.service'

console.log('🧪 Running Step 2.4 Phase 2 Trials & Conversion Automated Tests...')

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

const coachKKP: UserContext = {
  userId: 'usr-cch-1',
  loginId: 'CCH-KKP-001',
  role: 'COACH',
  branchId: 'branch-kkp',
  branchType: 'OWNED',
}

async function runTrialAndConversionTests() {
  resetDemoFlags()
  resetDemoEnquiries()
  resetDemoTrialSessions()

  await setFeatureFlag('p2.enquiries', 'global', true)

  // Fetch an active batch from KKP branch
  const kkpBatches = await listBatches(managerKKP, 'branch-kkp')
  const batch = kkpBatches[0]
  assert(Boolean(batch), 'Found active batch in KKP branch for testing')

  // Find a matching date for this batch schedule (matching batch.daysOfWeek)
  // Let's create an upcoming date that matches batch.daysOfWeek[0]
  const targetDayOfWeek = batch.daysOfWeek[0] // e.g. 1 for Monday
  const testDate = new Date('2026-11-02T10:00:00Z') // 2026-11-02 is Monday (UTC day 1)
  // Adjust to match batch.daysOfWeek[0]
  while (testDate.getUTCDay() !== targetDayOfWeek) {
    testDate.setUTCDate(testDate.getUTCDate() + 1)
  }
  const validSessionDate = testDate.toISOString().split('T')[0]

  // Create an enquiry for trial booking
  const enq1 = await createEnquiry(managerKKP, {
    branchId: 'branch-kkp',
    childName: 'Aarav Sharma',
    guardianName: 'Vikram Sharma',
    phone: '9876543301',
    source: 'WALK_IN',
    childAgeYears: 10,
  })
  assert(enq1.status === 'NEW', 'Enquiry initially at stage NEW')

  // ── Test Suite 1: Trial Booking & Validation (W2-7) ────────────────────────
  // 1. Booking with invalid schedule day should be rejected
  const invalidDayDate = new Date(testDate)
  invalidDayDate.setUTCDate(invalidDayDate.getUTCDate() + 1) // next day (not in daysOfWeek if single day)
  if (!batch.daysOfWeek.includes(invalidDayDate.getUTCDay())) {
    let invalidDayBlocked = false
    try {
      await bookTrialSession(managerKKP, {
        enquiryId: enq1.id,
        batchId: batch.id,
        sessionDate: invalidDayDate.toISOString().split('T')[0],
      })
    } catch {
      invalidDayBlocked = true
    }
    assert(invalidDayBlocked, 'Booking trial on non-operating day is rejected')
  }

  // 2. Successful trial booking
  const trial1 = await bookTrialSession(managerKKP, {
    enquiryId: enq1.id,
    batchId: batch.id,
    sessionDate: validSessionDate,
    note: 'Right-hand batsman trial slot',
  })
  assert(trial1.status === 'SCHEDULED', 'Trial status is SCHEDULED')
  assert(trial1.batchId === batch.id, 'Trial linked to correct batch')
  assert(trial1.sessionDate === validSessionDate, 'Trial scheduled for correct session date')

  // 3. Enquiry stage automatically advances to TRIAL_SCHEDULED
  const { getEnquiryById } = await import('../src/modules/phase2')
  const enq1Updated = await getEnquiryById(managerKKP, enq1.id)
  assert(enq1Updated.status === 'TRIAL_SCHEDULED', 'Enquiry stage advanced to TRIAL_SCHEDULED')

  // 4. Duplicate active trial for same enquiry is rejected
  let duplicateTrialBlocked = false
  try {
    await bookTrialSession(managerKKP, {
      enquiryId: enq1.id,
      batchId: batch.id,
      sessionDate: validSessionDate,
    })
  } catch {
    duplicateTrialBlocked = true
  }
  assert(duplicateTrialBlocked, 'Duplicate active trial for same enquiry is rejected')

  // 5. Cross-branch trial booking is rejected
  let crossBranchBlocked = false
  try {
    await bookTrialSession(managerHBN, {
      enquiryId: enq1.id,
      batchId: batch.id,
      sessionDate: validSessionDate,
    })
  } catch (err: any) {
    if (err instanceof RecordNotFoundError || err instanceof PermissionDeniedError) {
      crossBranchBlocked = true
    }
  }
  assert(crossBranchBlocked, 'Cross-branch trial booking blocked for franchise manager')

  // ── Test Suite 2: Guest Soft Limit Check (W2-7 default 3) ──────────────────
  // Create 2 more enquiries and book into same session date
  const enq2 = await createEnquiry(managerKKP, {
    branchId: 'branch-kkp',
    childName: 'Vivaan Gupta',
    phone: '9876543302',
    source: 'PHONE',
    childAgeYears: 9,
  })
  const enq3 = await createEnquiry(managerKKP, {
    branchId: 'branch-kkp',
    childName: 'Kabir Mehta',
    phone: '9876543303',
    source: 'WEBSITE',
    childAgeYears: 11,
  })

  await bookTrialSession(managerKKP, {
    enquiryId: enq2.id,
    batchId: batch.id,
    sessionDate: validSessionDate,
  })
  await bookTrialSession(managerKKP, {
    enquiryId: enq3.id,
    batchId: batch.id,
    sessionDate: validSessionDate,
  })

  // 4th enquiry attempting to book into same batch session should hit soft limit (3)
  const enq4 = await createEnquiry(managerKKP, {
    branchId: 'branch-kkp',
    childName: 'Anay Verma',
    phone: '9876543304',
    source: 'WALK_IN',
  })

  let guestLimitExceeded = false
  try {
    await bookTrialSession(managerKKP, {
      enquiryId: enq4.id,
      batchId: batch.id,
      sessionDate: validSessionDate,
    })
  } catch (err: any) {
    if (err.message.includes('limit') || err.message.includes('3')) {
      guestLimitExceeded = true
    }
  }
  assert(guestLimitExceeded, 'Exceeding trial guest soft limit (3) is rejected')

  // ── Test Suite 3: Coach Guest View & Privacy Redaction (A-10) ──────────────
  // Coach views trial guests for the session
  const coachGuests = await listTrialGuestsForBatch(coachKKP, batch.id, validSessionDate)
  assert(coachGuests.length === 3, 'Coach can view trial guests for assigned batch')
  
  // Anti-Poaching check: parent phone numbers and guardian names must be STRIPPED for coaches
  const anyPhoneExposed = coachGuests.some((g) => g.guardianPhone !== undefined)
  const anyGuardianExposed = coachGuests.some((g) => g.guardianName !== undefined)
  assert(!anyPhoneExposed, 'Parent phone numbers are strictly redacted for coaches')
  assert(!anyGuardianExposed, 'Guardian names are strictly redacted for coaches')
  const enq1Guest = coachGuests.find((g) => g.enquiryId === enq1.id)
  assert(Boolean(enq1Guest?.childName), 'Child name is visible to coach')
  assert(enq1Guest?.childAgeYears === 10, 'Child age is visible to coach')

  // Manager views trial guests (sees full guardian details)
  const managerGuests = await listTrialGuestsForBatch(managerKKP, batch.id, validSessionDate)
  const enq1ManagerGuest = managerGuests.find((g) => g.enquiryId === enq1.id)
  assert(enq1ManagerGuest?.guardianPhone !== undefined, 'Parent phone is visible to manager')
  assert(enq1ManagerGuest?.guardianName !== undefined, 'Guardian name is visible to manager')

  // ── Test Suite 4: Outcome Marking & Stage Movement (W2-4, W2-7) ────────────
  // 1. Mark ATTENDED on trial1
  const attendedTrial = await markTrialOutcome(managerKKP, {
    trialId: trial1.id,
    status: 'ATTENDED',
    note: 'Good batting stance and hand-eye coordination',
  })
  assert(attendedTrial.status === 'ATTENDED', 'Trial marked as ATTENDED')
  assert(attendedTrial.outcomeMarkedAt !== null, 'Outcome timestamp recorded')

  // Verify enquiry stage advanced from TRIAL_SCHEDULED -> TRIAL_DONE
  const enq1AfterAttendance = await getEnquiryById(managerKKP, enq1.id)
  assert(enq1AfterAttendance.status === 'TRIAL_DONE', 'Enquiry moved to TRIAL_DONE upon attended trial')

  // 2. Mark CANCELLED on trial2
  const trial2List = await listTrialsForEnquiry(managerKKP, enq2.id)
  const cancelledTrial = await markTrialOutcome(managerKKP, {
    trialId: trial2List[0].id,
    status: 'CANCELLED',
    note: 'Parent cancelled due to fever',
  })
  assert(cancelledTrial.status === 'CANCELLED', 'Trial marked as CANCELLED')

  // Verify enquiry stage reverted from TRIAL_SCHEDULED -> CONTACTED
  const enq2AfterCancel = await getEnquiryById(managerKKP, enq2.id)
  assert(enq2AfterCancel.status === 'CONTACTED', 'Enquiry moved back to CONTACTED upon cancelled trial')

  // Hard Rule 8 Verification: Ensure batch capacity was NEVER altered by trials
  const batchAfterTrials = await getBatchById(managerKKP, batch.id)
  assert(batchAfterTrials.enrolledCount === batch.enrolledCount, 'Trials did not touch Phase 1 batch enrolled count (Hard Rule 8)')

  // ── Test Suite 5: Enquiry Conversion to Student (W2-8, Touchpoint T3) ───────
  // 1. Coach attempting conversion should be blocked
  let coachConversionBlocked = false
  try {
    await convertEnquiryToStudent(coachKKP, {
      enquiryId: enq1.id,
      batchId: batch.id,
      dob: '2016-04-12',
    })
  } catch (err: any) {
    if (err instanceof PermissionDeniedError) {
      coachConversionBlocked = true
    }
  }
  assert(coachConversionBlocked, 'Coach is strictly blocked from converting enquiries')

  // 2. Conversion fails if admission validation fails (e.g. invalid batch ID)
  let invalidAdmissionBlocked = false
  try {
    await convertEnquiryToStudent(managerKKP, {
      enquiryId: enq1.id,
      batchId: 'non-existent-batch-999',
      dob: '2016-04-12',
    })
  } catch (err: any) {
    if (err instanceof RecordNotFoundError) {
      invalidAdmissionBlocked = true
    }
  }
  assert(invalidAdmissionBlocked, 'Invalid admission payload rejected by Phase 1 service')

  // Verify enquiry remained untouched in TRIAL_DONE
  const enq1Untouched = await getEnquiryById(managerKKP, enq1.id)
  assert(enq1Untouched.status === 'TRIAL_DONE', 'Enquiry state untouched after failed admission attempt')
  assert(enq1Untouched.convertedStudentId === null, 'No student ID linked after failed admission')

  // 3. Successful conversion of enq1 from TRIAL_DONE
  const convResult = await convertEnquiryToStudent(managerKKP, {
    enquiryId: enq1.id,
    batchId: batch.id,
    dob: '2016-05-15',
    gender: 'Male',
    guardianName: 'Vikram Sharma',
    guardianRelation: 'Father',
    whatsappOptIn: true,
    emergencyName: 'Vikram Sharma',
    emergencyPhone: '9876543301',
    notes: 'Admitted from trial session',
  })

  assert(Boolean(convResult.student.id), 'Phase 1 admission created student with ID')
  assert(Boolean(convResult.student.studentCode), 'Phase 1 generated gapless student code')
  assert(convResult.enquiry.status === 'CONVERTED', 'Enquiry stage updated to CONVERTED')
  assert(convResult.enquiry.convertedStudentId === convResult.student.id, 'Enquiry links convertedStudentId')
  assert(Boolean(convResult.enquiry.convertedAt), 'Conversion timestamp recorded')

  // 4. Converting an already converted enquiry fails (Idempotency)
  let doubleConversionBlocked = false
  try {
    await convertEnquiryToStudent(managerKKP, {
      enquiryId: enq1.id,
      batchId: batch.id,
      dob: '2016-05-15',
    })
  } catch (err: any) {
    if (err.message.includes('already been converted')) {
      doubleConversionBlocked = true
    }
  }
  assert(doubleConversionBlocked, 'Converting already converted enquiry is rejected cleanly')

  // 5. Manager direct conversion from CONTACTED stage
  // Direct conversion from CONTACTED requires an override reason
  let overrideReasonRequired = false
  try {
    await convertEnquiryToStudent(managerKKP, {
      enquiryId: enq2.id, // currently at CONTACTED
      batchId: batch.id,
      dob: '2017-02-10',
    })
  } catch (err: any) {
    if (err.message.includes('reason is required')) {
      overrideReasonRequired = true
    }
  }
  assert(overrideReasonRequired, 'Direct conversion from CONTACTED requires manager override reason')

  // Succeeds when reason is provided
  const directConv = await convertEnquiryToStudent(managerKKP, {
    enquiryId: enq2.id,
    batchId: batch.id,
    dob: '2017-02-10',
    gender: 'Male',
    managerOverrideReason: 'Student played in school team; coach evaluated directly',
    whatsappOptIn: true,
  })
  assert(directConv.enquiry.status === 'CONVERTED', 'Direct conversion with reason succeeds')

  // ── Test Suite 6: Half-completed conversion repair job ─────────────────────
  const fakeStudentId = 'std-repaired-999'
  const repairedEnquiry = await repairHalfCompletedConversion(managerKKP, enq3.id, fakeStudentId)
  assert(repairedEnquiry.status === 'CONVERTED', 'Repair job marks enquiry CONVERTED')
  assert(repairedEnquiry.convertedStudentId === fakeStudentId, 'Repair job links student ID')

  // ── Test Suite 7: Audit Log Verification (p2.trial.* & p2.enquiry.convert) ──
  const bookAudits = await getAuditLogs({ action: 'p2.trial.book' })
  const outcomeAudits = await getAuditLogs({ action: 'p2.trial.outcome' })
  const convertAudits = await getAuditLogs({ action: 'p2.enquiry.convert' })

  assert(bookAudits.length > 0, 'Audit entry p2.trial.book recorded')
  assert(outcomeAudits.length > 0, 'Audit entry p2.trial.outcome recorded')
  assert(convertAudits.length > 0, 'Audit entry p2.enquiry.convert recorded')

  // Zero PII check in conversion audit
  const lastConvertAudit = convertAudits[0]
  assert(!JSON.stringify(lastConvertAudit).includes('9876543301'), 'Audit log contains zero personal phone data (A-10)')

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n==================================================')
  console.log(`Phase 2 Trials & Conversion Results: ${passed} passed, ${failed} failed`)
  if (failed > 0) {
    process.exit(1)
  }
}

runTrialAndConversionTests().catch((err) => {
  console.error('Test execution error:', err)
  process.exit(1)
})
