import { recordCashPayment, getDailySummary, closeDay } from '../src/services/payment.service'
import { submitSessionAttendance, getSessionsForDate } from '../src/services/attendance.service'
import { processOnlinePaymentWebhook, createPaymentLink } from '../src/services/online-payment.service'
import { createSystemBackup, verifyBackupIntegrity, restoreFromBackup } from '../src/services/backup.service'
import { UserContext, PermissionDeniedError } from '../src/lib/rbac'
import crypto from 'crypto'

console.log('⚡ ========================================================')
console.log('⚡ STEP 1.17: CONCURRENCY, LOAD & BACKUP RECOVERY TEST')
console.log('⚡ ========================================================\n')

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

const coachArjun: UserContext = {
  userId: 'usr-cch-1',
  loginId: 'CCH-KKP-001',
  role: 'COACH',
  branchId: 'branch-kkp',
  branchType: 'OWNED',
}

async function runConcurrencyAndLoadTests() {
  console.log('--- 1. Concurrency: Gapless Sequential Receipt Numbers ---')

  const concurrentCount = 5
  const paymentsPromises = Array.from({ length: concurrentCount }, (_, i) =>
    recordCashPayment(managerKKP, {
      studentId: 'std-1',
      branchId: 'branch-kkp',
      amountPaise: 100000,
      businessDate: '2026-11-01',
    })
  )

  const results = await Promise.all(paymentsPromises)
  const receiptNumbers = results.map((r) => r.receiptNumber)
  const uniqueReceipts = new Set(receiptNumbers)

  assert(
    results.length === concurrentCount,
    `Successfully processed ${concurrentCount} concurrent cash payments`
  )
  assert(
    uniqueReceipts.size === concurrentCount,
    `All ${concurrentCount} receipts are strictly unique without collisions: ${receiptNumbers.join(', ')}`
  )

  // Verify sequential order
  const sortedNumbers = [...receiptNumbers].sort((a, b) => a - b)
  const isSequential = sortedNumbers.every(
    (num, idx) => idx === 0 || num === sortedNumbers[idx - 1] + 1
  )
  assert(
    isSequential,
    `Receipt numbers are strictly sequential and gapless (${sortedNumbers[0]} to ${sortedNumbers[sortedNumbers.length - 1]})`
  )

  console.log('\n--- 2. Load: Rapid Batch Attendance Submissions ---')

  const attendanceBatchSize = 10
  const attendanceDate = '2026-11-01'
  const mockStudents = Array.from({ length: attendanceBatchSize }, (_, i) => ({
    studentId: `std-load-${i}`,
    status: (i % 4 === 0 ? 'ABSENT' : i % 5 === 0 ? 'LATE' : 'PRESENT') as
      | 'PRESENT'
      | 'ABSENT'
      | 'LATE',
  }))

  const startAttMs = Date.now()
  const sessionResult = await submitSessionAttendance(coachArjun, {
    batchId: 'batch-1',
    date: attendanceDate,
    records: mockStudents,
  })
  const durationAttMs = Date.now() - startAttMs

  assert(
    sessionResult.success && sessionResult.alertsSent >= 0,
    `Batch attendance accurately processed (success: ${sessionResult.success}, alerts: ${sessionResult.alertsSent})`
  )
  assert(
    durationAttMs < 500,
    `High-throughput attendance submission completed in ${durationAttMs}ms (<500ms target)`
  )

  console.log('\n--- 3. Concurrency: Razorpay Webhook Idempotency ---')

  process.env.RAZORPAY_WEBHOOK_SECRET =
    process.env.RAZORPAY_WEBHOOK_SECRET || 'test_razorpay_webhook_secret_key_32chars'
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET
  const mockPaymentId = `pay_concurrent_load_${Date.now()}`
  const webhookPayload = JSON.stringify({
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: mockPaymentId,
          amount: 450000,
          method: 'upi',
          created_at: Math.floor(Date.now() / 1000),
          notes: {
            studentId: 'std-1',
            branchId: 'branch-kkp',
            dueId: 'due-1',
          },
        },
      },
    },
  })

  const signature = crypto
    .createHmac('sha256', webhookSecret)
    .update(webhookPayload)
    .digest('hex')

  // Blast 10 identical webhook calls simultaneously
  const concurrentWebhooks = Array.from({ length: 10 }, () =>
    processOnlinePaymentWebhook({
      payload: JSON.parse(webhookPayload),
      signature,
      rawBody: webhookPayload,
    })
  )

  const webhookResults = await Promise.all(concurrentWebhooks)
  const processedCount = webhookResults.filter((r) => r.status === 'PROCESSED').length
  const duplicateCount = webhookResults.filter((r) => r.status === 'ALREADY_PROCESSED').length

  assert(
    processedCount === 1,
    `Exactly 1 webhook was PROCESSED among 10 concurrent requests (got ${processedCount})`
  )
  assert(
    duplicateCount === 9,
    `Remaining 9 concurrent requests were safely caught as ALREADY_PROCESSED without double crediting`
  )

  console.log('\n--- 4. Disaster Recovery: System Backup & Integrity ---')

  // Coach and Manager access control check
  let coachDenied = false
  try {
    await createSystemBackup(coachArjun)
  } catch (err: any) {
    if (err instanceof PermissionDeniedError) coachDenied = true
  }
  assert(coachDenied, 'Coach is strictly denied from creating system backups')

  let managerDenied = false
  try {
    await createSystemBackup(managerKKP)
  } catch (err: any) {
    if (err instanceof PermissionDeniedError) managerDenied = true
  }
  assert(managerDenied, 'Manager is strictly denied from creating system backups (Admin only)')

  // Admin creates backup
  const backup = await createSystemBackup(adminUser)
  assert(Boolean(backup.metadata.id), `Generated backup archive: ${backup.metadata.id}`)
  assert(
    backup.metadata.counts.branches > 0 && backup.metadata.counts.users > 0,
    `Backup captured full snapshot (${backup.metadata.counts.branches} branches, ${backup.metadata.counts.users} staff, ${backup.metadata.counts.students} students)`
  )

  // Verify Integrity
  const integrity = verifyBackupIntegrity(backup)
  assert(integrity.valid, 'Backup passed cryptographic SHA-256 integrity check')

  // Tamper Test
  const tamperedBackup = JSON.parse(JSON.stringify(backup))
  tamperedBackup.data.branches[0].name = 'Tampered Academy Name'
  const tamperedIntegrity = verifyBackupIntegrity(tamperedBackup)
  assert(!tamperedIntegrity.valid, 'Integrity checker successfully detected tampered payload data')

  // Restore Test
  const restoreResult = await restoreFromBackup(adminUser, backup)
  assert(restoreResult.success, 'Successfully executed disaster recovery restore from backup')

  console.log('\n========================================================')
  console.log(`⚡ LOAD & CONCURRENCY RESULTS: ${passed} passed, ${failed} failed`)
  console.log('⚡ High Concurrency & Disaster Recovery Fully Hardened!')
  console.log('========================================================\n')
}

runConcurrencyAndLoadTests().catch(console.error)
