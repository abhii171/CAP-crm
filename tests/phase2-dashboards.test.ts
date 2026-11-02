import {
  getCoachDashboard,
  getManagerDashboard,
  getAdminDashboard,
  createEnquiry,
  bookTrialSession,
  resetDemoEnquiries,
  resetDemoTrials,
  resetDemoFlags,
} from '../src/modules/phase2'
import { UserContext, PermissionDeniedError, RecordNotFoundError } from '../src/lib/rbac'
import { GET as coachRouteGet } from '../src/app/api/dashboard/coach/route'
import { GET as managerRouteGet } from '../src/app/api/dashboard/manager/route'
import { GET as adminRouteGet } from '../src/app/api/dashboard/admin/route'
import { NextRequest } from 'next/server'

console.log('🧪 Running Step 2.7 Phase 2 Role Dashboards Automated Tests...')

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
}

async function runDashboardTests() {
  resetDemoFlags()
  resetDemoEnquiries()
  resetDemoTrials()

  const today = new Date().toISOString().split('T')[0]

  // =========================================================================
  // Test 1: Coach Dashboard Scoping & Anti-Poaching
  // =========================================================================
  // Coach viewing coach dashboard succeeds
  const coachDash = await getCoachDashboard(coachKKP)
  assert(Array.isArray(coachDash.sessions), 'Coach dashboard returns sessions list')
  assert(Array.isArray(coachDash.todayTrialGuests), 'Coach dashboard returns trial guests list')

  // Verify anti-poaching: trial guests in coach dashboard have no phone property
  for (const guest of coachDash.todayTrialGuests) {
    assert((guest as any).phone === undefined, 'Trial guest parent phone is stripped for coach view')
    assert((guest as any).guardianPhone === undefined, 'Trial guest guardian phone is stripped for coach view')
  }

  // Coach trying to access Manager or Admin dashboard is blocked
  try {
    await getManagerDashboard(coachKKP, 'branch-kkp')
    assert(false, 'Coach accessing manager dashboard should be blocked')
  } catch (err: any) {
    assert(err instanceof PermissionDeniedError, 'Coach is blocked from manager dashboard with 403')
  }

  try {
    await getAdminDashboard(coachKKP)
    assert(false, 'Coach accessing admin dashboard should be blocked')
  } catch (err: any) {
    assert(err instanceof PermissionDeniedError, 'Coach is blocked from admin dashboard with 403')
  }

  // =========================================================================
  // Test 2: Manager Dashboard Branch Scoping & Pipeline Tiles
  // =========================================================================
  const managerDash = await getManagerDashboard(managerKKP, 'branch-kkp')
  assert(managerDash.branch.id === 'branch-kkp', 'Manager dashboard reflects branch KKP')
  assert(typeof managerDash.financials.netCollectionsPaise === 'number', 'Financials tile reports net collections paise')
  assert(typeof managerDash.pipeline.unassignedCount === 'number', 'Pipeline tile reports unassigned enquiries count')
  assert(typeof managerDash.pipeline.overdueFollowUpsCount === 'number', 'Pipeline tile reports overdue follow-ups count')
  assert(typeof managerDash.notifications.unreadCount === 'number', 'Notifications tile reports unread count')

  // Cross-branch isolation: manager from HBN cannot load KKP dashboard
  try {
    await getManagerDashboard(managerHBN, 'branch-kkp')
    assert(false, 'Manager HBN accessing KKP dashboard should be blocked')
  } catch (err: any) {
    assert(err instanceof RecordNotFoundError, 'Manager from HBN is blocked from KKP dashboard with 404')
  }

  // =========================================================================
  // Test 3: Admin Dashboard Multi-Branch Overview & Reconciliation Status
  // =========================================================================
  const adminDash = await getAdminDashboard(adminUser)
  assert(adminDash.branchesCount >= 2, 'Admin dashboard returns multi-branch governance overview')
  assert(Array.isArray(adminDash.branches), 'Admin dashboard returns list of branch overviews')
  assert(typeof adminDash.financials.totalNetCollectionsPaise === 'number', 'Admin dashboard aggregates net collections')
  assert(typeof adminDash.operations.unclosedDaysCount === 'number', 'Admin dashboard reports academy unclosed days count')

  for (const b of adminDash.branches) {
    assert(['OK', 'MISMATCH'].includes(b.reconStatus), `Branch ${b.name} has valid reconciliation status`)
  }

  // =========================================================================
  // Test 4: Dashboard API Endpoints Reject Unauthenticated Access (401)
  // =========================================================================
  const unauthReq = new NextRequest('http://localhost:3000/api/dashboard/coach')
  const unauthRes = await coachRouteGet(unauthReq)
  assert(unauthRes.status === 401, 'Coach dashboard route returns 401 when unauthenticated')

  const unauthMgrRes = await managerRouteGet(new NextRequest('http://localhost:3000/api/dashboard/manager'))
  assert(unauthMgrRes.status === 401, 'Manager dashboard route returns 401 when unauthenticated')

  const unauthAdminRes = await adminRouteGet(new NextRequest('http://localhost:3000/api/dashboard/admin'))
  assert(unauthAdminRes.status === 401, 'Admin dashboard route returns 401 when unauthenticated')

  console.log('\n==================================================')
  console.log(`Phase 2 Role Dashboards Results: ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

runDashboardTests().catch((err) => {
  console.error('Test run failed with unhandled error:', err)
  process.exit(1)
})

