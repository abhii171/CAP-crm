import { listUsers } from '../src/services/user.service'
import { exportReportToCsv } from '../src/services/report.service'
import { getSessionSecret } from '../src/lib/session'
import { loadDemoData, saveDemoData } from '../src/lib/demo-storage'
import { UserContext } from '../src/lib/rbac'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`)
  }
}

function assertStrictEqual<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)} but got ${String(actual)}. ${message || ''}`)
  }
}

async function runSecurityRemediationTests() {
  console.log('🧪 Running Comprehensive Security Remediation Verification Tests...\n')

  const adminCaller: UserContext = {
    userId: 'usr-admin-1',
    loginId: 'ADM-001',
    role: 'ADMIN',
    branchId: null,
  }

  const coachCaller: UserContext = {
    userId: 'usr-cch-1',
    loginId: 'CCH-KKP-001',
    role: 'COACH',
    branchId: 'branch-kkp',
  }

  // ── TEST 1: Password Hash Disclosure Mitigation (High) ──────────────
  console.log('1. Testing Password Hash Masking in User Listing API...')
  const adminUsers = await listUsers(adminCaller)
  assert(adminUsers.length > 0, 'Admin can list users')
  for (const u of adminUsers as any[]) {
    assertStrictEqual(u.passwordHash, undefined, `Admin view: User ${u.loginId} must NOT leak passwordHash`)
    assertStrictEqual(u.passwordPlain, undefined, `Admin view: User ${u.loginId} must NOT leak passwordPlain`)
  }
  console.log('  ✓ Admin view: 0 password hashes or plaintext credentials exposed')

  const coachUsers = await listUsers(coachCaller)
  assert(coachUsers.length > 0, 'Coach can list branch users')
  for (const u of coachUsers as any[]) {
    assertStrictEqual(u.passwordHash, undefined, `Coach view: User ${u.loginId} must NOT leak passwordHash`)
    assertStrictEqual(u.passwordPlain, undefined, `Coach view: User ${u.loginId} must NOT leak passwordPlain`)
  }
  console.log('  ✓ Coach view: 0 password hashes or plaintext credentials exposed')

  // ── TEST 2: CSV Formula Injection Mitigation (Medium) ──────────────
  console.log('\n2. Testing CSV Formula Injection Sanitization...')
  const dummyReportData = {
    branchId: 'branch-kkp',
    totalOutstandingPaise: 50000,
    currentPaise: 50000,
    overdue1to7Paise: 0,
    overdue8to14Paise: 0,
    overdue14PlusPaise: 0,
    totalCadetsWithDues: 1,
    items: [
      {
        studentId: 'std-test-1',
        studentCode: 'KKP-001',
        studentName: '=cmd|\' /C calc\'!A0',
        branchId: 'branch-kkp',
        branchName: 'CPA Kukatpally',
        dueId: 'due-1',
        description: '+SUM(1+1)',
        dueDate: '2026-11-01',
        amountPaise: 50000,
        paidPaise: 0,
        outstandingPaise: 50000,
        daysOverdue: 2,
        agingBucket: '1-7_DAYS' as const,
        isPaused: false,
        flaggedForManager: false,
      },
      {
        studentId: 'std-test-2',
        studentCode: 'KKP-002',
        studentName: '@SUM(A1:A10)',
        branchId: 'branch-kkp',
        branchName: 'CPA Kukatpally',
        dueId: 'due-2',
        description: '-MINUS(5,2)',
        dueDate: '2026-11-01',
        amountPaise: 30000,
        paidPaise: 0,
        outstandingPaise: 30000,
        daysOverdue: 0,
        agingBucket: 'CURRENT' as const,
        isPaused: false,
        flaggedForManager: false,
      },
    ],
  }

  const csv = exportReportToCsv('OUTSTANDING_FEES', dummyReportData)
  // Check that leading '=', '+', '-', '@' are neutralized with single quotes
  assert(csv.includes("\"'=cmd|' /C calc'!A0\""), "Student name with '=' must be prefixed with a single quote")
  assert(csv.includes("\"'+SUM(1+1)\""), "Description with '+' must be prefixed with a single quote")
  assert(csv.includes("\"'@SUM(A1:A10)\""), "Student name with '@' must be prefixed with a single quote")
  assert(csv.includes("\"'-MINUS(5,2)\""), "Description with '-' must be prefixed with a single quote")
  console.log('  ✓ Formula injection characters (=, +, -, @) are properly neutralized in CSV export')

  // ── TEST 3: Insecure Production Secret Detection (Critical) ────────
  console.log('\n3. Testing Insecure Secret Detection in Production Mode...')
  const originalEnv = process.env.NODE_ENV
  const originalDemo = process.env.DEMO_MODE
  const originalSecret = process.env.SESSION_SECRET

  try {
    process.env.NODE_ENV = 'production'
    process.env.DEMO_MODE = 'false'
    process.env.SESSION_SECRET = 'cpa_production_demo_secret_key_at_least_32_chars_long'

    let blockedInsecureSecret = false
    try {
      getSessionSecret()
    } catch (err: any) {
      if (err.message && err.message.includes('Insecure default SESSION_SECRET detected')) {
        blockedInsecureSecret = true
      }
    }
    assert(blockedInsecureSecret, 'Known placeholder secret must be strictly blocked in true production')
    console.log('  ✓ Known insecure placeholder SESSION_SECRET is blocked in production')

    // Valid secret passes
    process.env.SESSION_SECRET = 'a_very_secure_randomly_generated_secret_string_here_32chars'
    const validSecret = getSessionSecret()
    assertStrictEqual(validSecret, 'a_very_secure_randomly_generated_secret_string_here_32chars')
    console.log('  ✓ Strong, unique production SESSION_SECRET is accepted')
  } finally {
    process.env.NODE_ENV = originalEnv
    process.env.DEMO_MODE = originalDemo
    process.env.SESSION_SECRET = originalSecret
  }

  // ── TEST 4: Persistent Lockout Tracker (Medium) ────────────────────
  console.log('\n4. Testing Persistent Demo Lockout State Across Invocations...')
  const testId = `test-user-${Date.now()}`
  saveDemoData('login-lockouts', {
    [testId]: { count: 5, lockedUntil: Date.now() + 15 * 60 * 1000 },
  })

  // Read back fresh from disk simulating new lambda invocation
  const freshLockouts = loadDemoData<Record<string, { count: number; lockedUntil: number }>>('login-lockouts', {})
  assert(Boolean(freshLockouts[testId]), 'Lockout entry must persist to disk')
  assertStrictEqual(freshLockouts[testId].count, 5, 'Failure count preserved')
  assert(freshLockouts[testId].lockedUntil > Date.now(), 'Lockout expiration preserved')
  console.log('  ✓ Lockout state persists to disk across serverless invocations and reboots')

  // Clean up test entry
  delete freshLockouts[testId]
  saveDemoData('login-lockouts', freshLockouts)

  console.log('\n==================================================')
  console.log('All Security Remediation Verification Tests Passed! 🛡️\n')
}

runSecurityRemediationTests().catch((err) => {
  console.error('❌ Remediation test failed:', err)
  const proc = (globalThis as any).process
  if (proc?.exit) {
    proc.exit(1)
  } else {
    throw err
  }
})
