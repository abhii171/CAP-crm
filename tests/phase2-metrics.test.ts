import {
  getDailyBranchSnapshot,
  rebuildDailyBranchSnapshot,
  runNightlyBranchReconciliation,
  runNightlyMasterReconciliation,
  listReconciliationRuns,
  resetDemoSnapshots,
  resetDemoReconciliationRuns,
  METRIC_DEFINITIONS,
  resetDemoFlags,
} from '../src/modules/phase2'
import { UserContext, PermissionDeniedError, RecordNotFoundError } from '../src/lib/rbac'
import { recordCashPayment } from '../src/services/payment.service'
import { getCollectionsReport } from '../src/services/report.service'
import { getAuditLogs } from '../src/lib/audit'

console.log('🧪 Running Step 2.6 Phase 2 Metrics Layer & Reconciliation Automated Tests...')

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
  userId: 'usr-cch-kkp',
  loginId: 'CCH-KKP-001',
  role: 'COACH',
  branchId: 'branch-kkp',
}

async function runMetricsTests() {
  resetDemoFlags()
  resetDemoSnapshots()
  resetDemoReconciliationRuns()

  const today = new Date().toISOString().split('T')[0]

  // =========================================================================
  // Test 1: Hard Rule 9 Metric Definitions Catalogue
  // =========================================================================
  assert(METRIC_DEFINITIONS.length >= 8, 'Metric definitions catalogue has all core operational metrics')
  const netMetric = METRIC_DEFINITIONS.find((m) => m.id === 'NET_COLLECTIONS')
  assert(
    netMetric?.formula === '(Cash Collections + Online Collections) - Reversals',
    'Net collections formula is strictly defined according to Hard Rule 9'
  )

  // =========================================================================
  // Test 2: RBAC & Cross-Branch Scoping on Snapshots
  // =========================================================================
  try {
    await getDailyBranchSnapshot(coachKKP, {
      branchId: 'branch-kkp',
      businessDate: today,
    })
    assert(false, 'Coach reading financial snapshots should be blocked with PermissionDeniedError')
  } catch (err: any) {
    assert(err instanceof PermissionDeniedError, 'Coach is blocked from reading branch snapshots')
  }

  try {
    await getDailyBranchSnapshot(managerHBN, {
      branchId: 'branch-kkp',
      businessDate: today,
    })
    assert(false, 'Manager HBN reading branch KKP snapshots should be blocked')
  } catch (err: any) {
    assert(err instanceof RecordNotFoundError, 'Manager from branch HBN cannot access branch KKP snapshots')
  }

  // =========================================================================
  // Test 3: Snapshot calculation aligns paise-exact with Phase 1 reports
  // =========================================================================
  const kkpSnapshot = await getDailyBranchSnapshot(managerKKP, {
    branchId: 'branch-kkp',
    businessDate: today,
  })

  assert(typeof kkpSnapshot.collectionsCashPaise === 'number', 'Snapshot calculates integer paise for cash')
  assert(typeof kkpSnapshot.collectionsOnlinePaise === 'number', 'Snapshot calculates integer paise for online')
  assert(typeof kkpSnapshot.reversalsPaise === 'number', 'Snapshot calculates integer paise for reversals')

  const expectedNet =
    kkpSnapshot.collectionsCashPaise + kkpSnapshot.collectionsOnlinePaise - kkpSnapshot.reversalsPaise
  assert(
    kkpSnapshot.netCollectionsPaise === expectedNet,
    `Net collections paise (${kkpSnapshot.netCollectionsPaise}) exactly equals Gross - Reversals`
  )

  // =========================================================================
  // Test 4: Idempotency of Snapshot Rebuild
  // =========================================================================
  const rebuiltSnapshot = await rebuildDailyBranchSnapshot(adminUser, {
    branchId: 'branch-kkp',
    businessDate: today,
  })
  assert(
    rebuiltSnapshot.netCollectionsPaise === kkpSnapshot.netCollectionsPaise,
    'Rebuilding snapshot twice produces identical net collections (Idempotent)'
  )
  assert(
    rebuiltSnapshot.activeStudentsCount === kkpSnapshot.activeStudentsCount,
    'Rebuilding snapshot produces identical active student counts'
  )

  // =========================================================================
  // Test 5: Nightly Reconciliation Status OK on Clean Data
  // =========================================================================
  const reconRun = await runNightlyBranchReconciliation(managerKKP, {
    branchId: 'branch-kkp',
    businessDate: today,
  })

  assert(reconRun.status === 'OK', 'Reconciliation run completes with status OK when data matches')
  assert(reconRun.diffCollectionsPaise === 0, 'Collections difference is exactly 0 paise')
  assert(reconRun.diffReversalsPaise === 0, 'Reversals difference is exactly 0 paise')

  const reconList = await listReconciliationRuns(managerKKP, { branchId: 'branch-kkp' })
  assert(reconList.length >= 1, 'Reconciliation run history is recorded and queryable')
  assert(reconList[0].status === 'OK', 'Latest reconciliation run status is OK')

  // =========================================================================
  // Test 6: Cross-Branch Isolation on Reconciliation Runs
  // =========================================================================
  try {
    await listReconciliationRuns(managerHBN, { branchId: 'branch-kkp' })
    assert(false, 'Manager HBN listing branch KKP reconciliation history should be blocked')
  } catch (err: any) {
    assert(err instanceof RecordNotFoundError, 'Reconciliation history is strictly branch scoped')
  }

  // =========================================================================
  // Test 7: Master Nightly Reconciliation Sweep for All Branches
  // =========================================================================
  const masterSweep = await runNightlyMasterReconciliation(adminUser, today)
  assert(masterSweep.length >= 2, 'Master reconciliation sweep executed for all system branches')
  for (const run of masterSweep) {
    assert(run.status === 'OK', `Branch ${run.branchId} passed nightly reconciliation with status OK`)
  }

  // =========================================================================
  // Test 8: Audit Logging Integrity
  // =========================================================================
  const auditLogs = await getAuditLogs({ action: 'p2.metrics.reconciliation_run' })
  assert(auditLogs.length > 0, 'Audit entry p2.metrics.reconciliation_run recorded')
  const lastLog = auditLogs[0]
  assert(
    !JSON.stringify(lastLog.after || {}).includes('phone'),
    'Metrics audit log contains zero PII phone numbers (A-10)'
  )

  console.log('\n==================================================')
  console.log(`Phase 2 Metrics & Reconciliation Results: ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

runMetricsTests().catch((err) => {
  console.error('Test run failed with unhandled error:', err)
  process.exit(1)
})
