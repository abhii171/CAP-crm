import { logAudit, getAuditLogs } from '../src/lib/audit'

console.log('🧪 Running Audit Log Automated Test Suite...')

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

async function runTests() {
  // Test 1: Log an entry with sensitive credentials -> verifies automatic redaction
  await logAudit({
    actorId: 'usr-admin-1',
    branchId: 'branch-kkp',
    action: 'user.password_reset',
    entityType: 'User',
    entityId: 'usr-mgr-1',
    before: { passwordHash: '$2a$12$someSecretHash', loginId: 'MGR-KKP-001' },
    after: { passwordHash: '$2a$12$newSecretHash', token: 'temp-reset-token-xyz' },
    reason: 'Admin issued new temporary credentials',
    ip: '192.168.1.100',
  })

  const logs = await getAuditLogs({ limit: 10 })
  const resetLog = logs.find((l) => l.action === 'user.password_reset')

  assert(!!resetLog, 'Audit entry user.password_reset successfully recorded')
  assert(
    (resetLog?.before as any)?.passwordHash === '[REDACTED]',
    'Sensitive passwordHash in before state is strictly redacted'
  )
  assert(
    (resetLog?.after as any)?.token === '[REDACTED]',
    'Sensitive token in after state is strictly redacted'
  )
  assert(
    (resetLog?.before as any)?.loginId === 'MGR-KKP-001',
    'Non-sensitive fields (loginId) are retained'
  )

  // Test 2: Branch filtering in getAuditLogs
  const kkpLogs = await getAuditLogs({ branchId: 'branch-kkp' })
  assert(
    kkpLogs.every((l) => l.branchId === 'branch-kkp'),
    'Branch filter in getAuditLogs returns records strictly for requested branch'
  )

  // Test 3: Action filter
  const loginLogs = await getAuditLogs({ action: 'user.login' })
  assert(
    loginLogs.every((l) => l.action === 'user.login'),
    'Action filter in getAuditLogs returns records strictly for requested action'
  )

  console.log('\n' + '='.repeat(50))
  console.log(`Audit Test Results: ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

runTests().catch((err) => {
  console.error(err)
  process.exit(1)
})
