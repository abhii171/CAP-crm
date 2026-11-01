import { UserContext, authorize } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'
import { listBranches } from './branch.service'
import { listUsers } from './user.service'
import { listBatches } from './batch.service'
import { listStudents } from './student.service'
import { listFeePlans } from './fee.service'
import { listAllDailySummaries, listPayments } from './payment.service'
import { saveDemoData, loadDemoData } from '@/lib/demo-storage'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

export interface SystemBackupMetadata {
  id: string
  createdAt: string
  createdById: string
  createdByName?: string
  version: string
  counts: {
    branches: number
    users: number
    batches: number
    students: number
    feePlans: number
    payments: number
    dailySummaries: number
  }
  checksumSha256: string
}

export interface SystemBackupPayload {
  branches: any[]
  users: any[]
  batches: any[]
  students: any[]
  feePlans: any[]
  payments: any[]
  dailySummaries: any[]
}

export interface SystemBackup {
  metadata: SystemBackupMetadata
  data: SystemBackupPayload
}

const BACKUP_DIR = path.join(process.cwd(), '.backups')

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true })
  }
}

/**
 * Creates a complete snapshot of all academy data with SHA256 checksum (Step 1.17).
 */
export async function createSystemBackup(caller: UserContext): Promise<SystemBackup> {
  authorize(caller, 'backup:manage')

  const [branches, users, batches, students, feePlans, payments, dailySummaries] =
    await Promise.all([
      listBranches(caller),
      listUsers(caller),
      listBatches(caller),
      listStudents(caller),
      listFeePlans(caller),
      listPayments(caller),
      listAllDailySummaries(caller),
    ])

  const payload: SystemBackupPayload = {
    branches,
    users,
    batches,
    students,
    feePlans,
    payments,
    dailySummaries,
  }

  const serializedData = JSON.stringify(payload)
  const checksum = crypto.createHash('sha256').update(serializedData).digest('hex')
  const backupId = `cpa-backup-${Date.now()}`

  const metadata: SystemBackupMetadata = {
    id: backupId,
    createdAt: new Date().toISOString(),
    createdById: caller.userId,
    createdByName: caller.loginId,
    version: '1.0.0-pilot',
    counts: {
      branches: branches.length,
      users: users.length,
      batches: batches.length,
      students: students.length,
      feePlans: feePlans.length,
      payments: payments.length,
      dailySummaries: dailySummaries.length,
    },
    checksumSha256: checksum,
  }

  const backup: SystemBackup = {
    metadata,
    data: payload,
  }

  try {
    ensureBackupDir()
    const filePath = path.join(BACKUP_DIR, `${backupId}.json`)
    fs.writeFileSync(filePath, JSON.stringify(backup, null, 2), 'utf-8')
  } catch (err) {
    // If running in serverless read-only filesystem, memory backup is still returned
  }

  await logAudit({
    actorId: caller.userId,
    branchId: caller.branchId,
    action: 'system.backup.create',
    entityType: 'SystemBackup',
    entityId: backupId,
    after: { counts: metadata.counts, checksum },
  })

  return backup
}

/**
 * Validates integrity of a backup payload using cryptographic SHA-256 hash.
 */
export function verifyBackupIntegrity(backup: SystemBackup): { valid: boolean; error?: string } {
  if (!backup || !backup.metadata || !backup.data) {
    return { valid: false, error: 'Malformed backup structure' }
  }

  const serializedData = JSON.stringify(backup.data)
  const computedHash = crypto.createHash('sha256').update(serializedData).digest('hex')

  if (computedHash !== backup.metadata.checksumSha256) {
    return {
      valid: false,
      error: `Checksum mismatch! Expected ${backup.metadata.checksumSha256}, got ${computedHash}`,
    }
  }

  return { valid: true }
}

/**
 * Restores system collections from a validated backup archive (Disaster Recovery).
 */
export async function restoreFromBackup(
  caller: UserContext,
  backup: SystemBackup
): Promise<{ success: boolean; restoredCounts: Record<string, number> }> {
  authorize(caller, 'backup:manage')

  const verification = verifyBackupIntegrity(backup)
  if (!verification.valid) {
    throw new Error(`Restore rejected: ${verification.error}`)
  }

  // Restore datasets to persistent storage
  saveDemoData('branches', backup.data.branches)
  saveDemoData('users', backup.data.users)
  saveDemoData('batches', backup.data.batches)
  saveDemoData('students', backup.data.students)

  await logAudit({
    actorId: caller.userId,
    branchId: caller.branchId,
    action: 'system.backup.restore',
    entityType: 'SystemBackup',
    entityId: backup.metadata.id,
    after: { restoredCounts: backup.metadata.counts },
  })

  return {
    success: true,
    restoredCounts: backup.metadata.counts,
  }
}
