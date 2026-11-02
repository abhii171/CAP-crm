import {
  createEnquiry,
  transitionEnquiryStage,
  getEnquiryPipelineBoard,
  resetDemoEnquiries,
  setFeatureFlag,
  resetDemoFlags,
  isValidTransition,
  VersionConflictError,
  InvalidStageTransitionError,
  SEEDED_LOST_REASONS,
} from '../src/modules/phase2'
import { UserContext } from '../src/lib/rbac'
import { getAuditLogs } from '../src/lib/audit'
import { POST as stageRoutePost } from '../src/app/api/enquiries/[id]/stage/route'
import { NextRequest } from 'next/server'

console.log('🧪 Running Step 2.2 Phase 2 Pipeline Stages & Board Automated Tests...')

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

async function runPipelineTests() {
  resetDemoFlags()
  resetDemoEnquiries()

  await setFeatureFlag('p2.enquiries', 'global', true)

  // ── Test Suite 1: Pure State Machine Matrix (A-05, W2-4) ───────────────────
  assert(isValidTransition('NEW', 'CONTACTED') === true, 'NEW -> CONTACTED is allowed')
  assert(isValidTransition('NEW', 'TRIAL_SCHEDULED') === true, 'NEW -> TRIAL_SCHEDULED is allowed')
  assert(isValidTransition('NEW', 'LOST') === true, 'NEW -> LOST is allowed')
  assert(isValidTransition('NEW', 'TRIAL_DONE') === false, 'NEW -> TRIAL_DONE is rejected')
  assert(isValidTransition('NEW', 'CONVERTED') === false, 'NEW -> CONVERTED is rejected')

  assert(isValidTransition('CONTACTED', 'NEW') === true, 'CONTACTED -> NEW (undo) is allowed')
  assert(isValidTransition('TRIAL_SCHEDULED', 'CONTACTED') === true, 'TRIAL_SCHEDULED -> CONTACTED (cancelled) is allowed')
  assert(isValidTransition('TRIAL_DONE', 'CONVERTED') === true, 'TRIAL_DONE -> CONVERTED is allowed')
  assert(isValidTransition('LOST', 'NEW') === true, 'LOST -> NEW (reopen) is allowed')
  assert(isValidTransition('LOST', 'CONTACTED') === true, 'LOST -> CONTACTED (reopen) is allowed')
  assert(isValidTransition('LOST', 'CONVERTED') === false, 'LOST -> CONVERTED direct jump is rejected')
  assert(isValidTransition('CONVERTED', 'CONTACTED') === false, 'CONVERTED is terminal (no transitions allowed)')

  // ── Test Suite 2: Execution & Stage Transitions (W2-4) ────────────────────
  const enq = await createEnquiry(managerKKP, {
    branchId: 'branch-kkp',
    childName: 'Devansh K.',
    phone: '9876541234',
    source: 'WALK_IN',
  })

  assert(enq.status === 'NEW', 'Initial enquiry is at stage NEW')
  assert(enq.version === 1, 'Initial version is 1')

  // Transition to CONTACTED
  const res1 = await transitionEnquiryStage(managerKKP, {
    enquiryId: enq.id,
    toStatus: 'CONTACTED',
    note: 'Spoke with father on phone',
  })
  assert(res1.enquiry.status === 'CONTACTED', 'Enquiry moved to CONTACTED')
  assert(res1.enquiry.version === 2, 'Version incremented to 2')
  assert(res1.enquiry.lastContactedAt !== null, 'lastContactedAt timestamp recorded')

  // Reject invalid transition attempt
  let invalidTransitionBlocked = false
  try {
    await transitionEnquiryStage(managerKKP, {
      enquiryId: enq.id,
      toStatus: 'CONVERTED',
    })
  } catch (err: any) {
    if (err instanceof InvalidStageTransitionError) {
      invalidTransitionBlocked = true
    }
  }
  assert(invalidTransitionBlocked, 'Invalid jump CONTACTED -> CONVERTED rejected with InvalidStageTransitionError')

  // ── Test Suite 3: Optimistic Concurrency Control (A-15, W2-4) ─────────────
  // Client attempts update assuming version is still 1
  let conflictDetected = false
  try {
    await transitionEnquiryStage(managerKKP, {
      enquiryId: enq.id,
      toStatus: 'TRIAL_SCHEDULED',
      expectedVersion: 1, // Outdated version
    })
  } catch (err: any) {
    if (err instanceof VersionConflictError) {
      conflictDetected = true
    }
  }
  assert(conflictDetected, 'Outdated expectedVersion throws VersionConflictError (409 Conflict)')

  // Update succeeds when matching current version 2
  const res2 = await transitionEnquiryStage(managerKKP, {
    enquiryId: enq.id,
    toStatus: 'TRIAL_SCHEDULED',
    expectedVersion: 2,
    note: 'Booked trial slot for upcoming weekend',
  })
  assert(res2.enquiry.status === 'TRIAL_SCHEDULED', 'Update succeeds with correct expectedVersion')
  assert(res2.enquiry.version === 3, 'Version incremented to 3')

  // ── Test Suite 4: Lost & Reopen Workflows (E-5, W2-9) ──────────────────────
  // Attempt to mark LOST without reason is rejected
  let missingReasonBlocked = false
  try {
    await transitionEnquiryStage(managerKKP, {
      enquiryId: enq.id,
      toStatus: 'LOST',
    })
  } catch {
    missingReasonBlocked = true
  }
  assert(missingReasonBlocked, 'Marking enquiry LOST without lostReasonId is rejected')

  // Mark LOST with valid seeded reason
  const lostRes = await transitionEnquiryStage(managerKKP, {
    enquiryId: enq.id,
    toStatus: 'LOST',
    lostReasonId: 'TIMING_MISMATCH',
    lostNote: 'Clashes with tuition timings',
  })
  assert(lostRes.enquiry.status === 'LOST', 'Enquiry marked as LOST')
  assert(lostRes.enquiry.lostReasonId === 'TIMING_MISMATCH', 'Lost reason ID stored')
  assert(lostRes.enquiry.lostNote === 'Clashes with tuition timings', 'Lost note stored')

  // Reopen LOST enquiry requires a note
  let missingReopenNoteBlocked = false
  try {
    await transitionEnquiryStage(managerKKP, {
      enquiryId: enq.id,
      toStatus: 'CONTACTED',
      note: '   ',
    })
  } catch {
    missingReopenNoteBlocked = true
  }
  assert(missingReopenNoteBlocked, 'Reopening LOST enquiry without reason note is rejected')

  // Successfully reopen LOST enquiry
  const reopenRes = await transitionEnquiryStage(managerKKP, {
    enquiryId: enq.id,
    toStatus: 'CONTACTED',
    note: 'Parent called back; school timings changed',
  })
  assert(reopenRes.enquiry.status === 'CONTACTED', 'Enquiry reopened to CONTACTED')
  assert(reopenRes.enquiry.lostReasonId === null, 'Lost reason cleared upon reopening')
  assert(reopenRes.enquiry.lostNote === null, 'Lost note cleared upon reopening')

  // Verify Audit Log entries for lost and reopen
  const lostAudits = await getAuditLogs({ action: 'p2.enquiry.lost' })
  const reopenAudits = await getAuditLogs({ action: 'p2.enquiry.reopen' })
  assert(lostAudits.length > 0, 'Audit entry p2.enquiry.lost recorded')
  assert(reopenAudits.length > 0, 'Audit entry p2.enquiry.reopen recorded')

  // ── Test Suite 5: Kanban Pipeline Board Aggregation (UI-UX § 4.2) ──────────
  // Create another enquiry to test column distributions
  await createEnquiry(managerKKP, {
    branchId: 'branch-kkp',
    childName: 'Reyansh R.',
    phone: '9876549999',
    source: 'WEBSITE',
  })

  const board = await getEnquiryPipelineBoard(managerKKP)
  assert(board.totalCount >= 2, 'Board returns accurate total count')
  assert(board.columns.NEW.count >= 1, 'Column NEW has items')
  assert(board.columns.CONTACTED.count >= 1, 'Column CONTACTED has items')
  assert(board.columns.TRIAL_SCHEDULED.count === 0, 'Column TRIAL_SCHEDULED has 0 items')
  assert(board.columns.LOST.count === 0, 'Column LOST has 0 items')

  // ── Test Suite 6: Route Handler Security Checks (A-01, A-02) ─────────────
  // Route handler enforces authentication (silencing Next.js request scope warning in standalone CLI test)
  const unauthReq = new NextRequest(`http://localhost:3000/api/enquiries/${enq.id}/stage`, {
    method: 'POST',
    body: JSON.stringify({
      toStatus: 'LOST',
      expectedVersion: 1,
      lostReasonId: 'PRICE',
    }),
  })
  const originalConsoleError = console.error
  console.error = () => {}
  const unauthRes = await stageRoutePost(unauthReq, { params: { id: enq.id } })
  console.error = originalConsoleError
  assert(unauthRes.status === 401, 'Stage transition route rejects unauthenticated request with 401')

  // VersionConflictError maps to 409
  const conflictErr = new VersionConflictError()
  assert(conflictErr.statusCode === 409, 'VersionConflictError has HTTP statusCode = 409')

  // InvalidStageTransitionError maps to 400
  const invalidErr = new InvalidStageTransitionError('NEW', 'CONVERTED')
  assert(invalidErr.statusCode === 400, 'InvalidStageTransitionError has HTTP statusCode = 400')

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n==================================================')
  console.log(`Phase 2 Pipeline Test Results: ${passed} passed, ${failed} failed`)
  if (failed > 0) {
    process.exit(1)
  }
}

runPipelineTests().catch((err) => {
  console.error('Test execution error:', err)
  process.exit(1)
})
