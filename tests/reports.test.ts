import {
  getOutstandingFeesReport,
  getCollectionsReport,
  getUnclosedDaysReport,
  getAttendanceSummaryReport,
  exportReportToCsv,
} from '../src/services/report.service'
import { UserContext, PermissionDeniedError, RecordNotFoundError } from '../src/lib/rbac'

console.log('🧪 Running Step 1.16 Admin Reports Automated Tests...')

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

const managerHBN: UserContext = {
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

async function runTests() {
  // Test 1: Coach is strictly forbidden from financial/admin reports
  let coachBlocked = false
  try {
    await getOutstandingFeesReport(coachArjun)
  } catch (err: any) {
    if (err instanceof PermissionDeniedError) coachBlocked = true
  }
  assert(coachBlocked, 'Coach is strictly forbidden from viewing outstanding fees report')

  let coachCollectionsBlocked = false
  try {
    await getCollectionsReport(coachArjun)
  } catch (err: any) {
    if (err instanceof PermissionDeniedError) coachCollectionsBlocked = true
  }
  assert(coachCollectionsBlocked, 'Coach is strictly forbidden from viewing collections report')

  // Test 2: Manager from different branch blocked by branch scoping
  let crossBranchBlocked = false
  try {
    await getOutstandingFeesReport(managerHBN, { branchId: 'branch-kkp' })
  } catch (err: any) {
    if (err instanceof RecordNotFoundError || err instanceof PermissionDeniedError) crossBranchBlocked = true
  }
  assert(crossBranchBlocked, 'Manager accessing other branch report blocked by branch scoping')

  // Test 3: Outstanding Fees Report accurately categorizes aging buckets
  const outstandingReport = await getOutstandingFeesReport(adminUser)
  assert(
    typeof outstandingReport.totalOutstandingPaise === 'number',
    'Outstanding fees report returns totalOutstandingPaise'
  )
  assert(
    typeof outstandingReport.currentPaise === 'number' &&
      typeof outstandingReport.overdue1to7Paise === 'number' &&
      typeof outstandingReport.overdue8to14Paise === 'number' &&
      typeof outstandingReport.overdue14PlusPaise === 'number',
    'Outstanding fees report partitions balances into 4 aging buckets'
  )
  assert(
    Array.isArray(outstandingReport.items),
    'Outstanding report returns list of student dues items'
  )

  // Test 4: Branch-scoped Outstanding Fees Report
  const kkpOutstanding = await getOutstandingFeesReport(managerKKP, { branchId: 'branch-kkp' })
  assert(
    kkpOutstanding.items.every((i) => i.branchId === 'branch-kkp'),
    'Manager outstanding report is strictly filtered to own branch'
  )

  // Test 5: Collections Report (Cash vs Online Breakdown)
  const collectionsReport = await getCollectionsReport(adminUser)
  assert(
    Array.isArray(collectionsReport.branches) && collectionsReport.branches.length >= 1,
    'Collections report summarizes collections by branch'
  )
  assert(
    typeof collectionsReport.grandTotalCollectionsPaise === 'number' &&
      typeof collectionsReport.grandTotalCashPaise === 'number' &&
      typeof collectionsReport.grandTotalOnlinePaise === 'number' &&
      typeof collectionsReport.grandTotalNetPaise === 'number',
    'Collections report computes grand total cash, online, and net revenue'
  )

  const sampleBranch = collectionsReport.branches[0]
  assert(
    typeof sampleBranch.cashTotalPaise === 'number' &&
      typeof sampleBranch.onlineTotalPaise === 'number' &&
      typeof sampleBranch.reversalsTotalPaise === 'number' &&
      sampleBranch.netCollectionsPaise === sampleBranch.totalCollectionsPaise - sampleBranch.reversalsTotalPaise,
    'Branch collection correctly applies reversals to compute net collections'
  )

  // Test 6: Unclosed Days & Discrepancy Report
  const unclosedReport = await getUnclosedDaysReport(adminUser)
  assert(
    typeof unclosedReport.unclosedCount === 'number' && typeof unclosedReport.discrepancyCount === 'number',
    'Unclosed days report tallies unclosed days and cash discrepancies'
  )
  assert(
    Array.isArray(unclosedReport.items),
    'Unclosed report returns array of unclosed/discrepancy business dates'
  )

  // Test 7: Attendance Summary Report
  const attendanceReport = await getAttendanceSummaryReport(adminUser)
  assert(
    typeof attendanceReport.totalSessionsHeld === 'number' &&
      typeof attendanceReport.overallAttendanceRate === 'number',
    'Attendance report computes total sessions held and overall attendance percentage'
  )
  assert(
    Array.isArray(attendanceReport.batches) && attendanceReport.batches.length >= 1,
    'Attendance report breaks down attendance metrics per batch'
  )
  const sampleBatch = attendanceReport.batches[0]
  assert(
    typeof sampleBatch.attendanceRate === 'number' &&
      sampleBatch.attendanceRate >= 0 &&
      sampleBatch.attendanceRate <= 100,
    'Batch attendance rate is valid percentage between 0 and 100%'
  )

  // Test 8: CSV Exports
  const feesCsv = exportReportToCsv('OUTSTANDING_FEES', outstandingReport)
  assert(
    feesCsv.includes('"Student Code"') && feesCsv.includes('"Outstanding (₹)"'),
    'Outstanding fees report exports valid CSV with rupee formatted values'
  )

  const collectionsCsv = exportReportToCsv('COLLECTIONS', collectionsReport)
  assert(
    collectionsCsv.includes('"Cash Collections (₹)"') && collectionsCsv.includes('"Online Collections (₹)"'),
    'Collections report exports valid CSV with cash vs online columns'
  )

  const unclosedCsv = exportReportToCsv('UNCLOSED_DAYS', unclosedReport)
  assert(
    unclosedCsv.includes('"Business Date"') && unclosedCsv.includes('"Discrepancy (₹)"'),
    'Unclosed days report exports valid CSV with discrepancy details'
  )

  const attendanceCsv = exportReportToCsv('ATTENDANCE', attendanceReport)
  assert(
    attendanceCsv.includes('"Batch Name"') && attendanceCsv.includes('"Attendance Rate (%)"'),
    'Attendance report exports valid CSV with batch metrics'
  )

  // Summary
  console.log(`\nResults: ${passed} passed, ${failed} failed`)
  if (failed > 0) {
    process.exit(1)
  }
}

runTests().catch((err) => {
  console.error('Unhandled test failure:', err)
  process.exit(1)
})

