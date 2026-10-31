import { prisma, isDbAvailable, markDbOffline } from './prisma'
import { Prisma } from '@prisma/client'

export interface AuditEntry {
  actorId?: string | null
  branchId?: string | null
  action: string
  entityType: string
  entityId?: string | null
  before?: Record<string, any> | null
  after?: Record<string, any> | null
  reason?: string | null
  ip?: string | null
}

// In-memory ring buffer for demo resiliency
export interface DemoAuditLogItem extends AuditEntry {
  id: string
  createdAt: string
  actorName?: string
  actorLoginId?: string
}

const demoAuditBuffer: DemoAuditLogItem[] = [
  {
    id: '1',
    actorId: 'usr-admin-1',
    actorName: 'Super Admin',
    actorLoginId: 'ADM-001',
    branchId: null,
    action: 'system.seed',
    entityType: 'System',
    entityId: 'cpa-crm-v1',
    before: null,
    after: { status: 'INITIALIZED', branchesCount: 2, studentsCount: 20 },
    reason: 'Initial database seeding with owned and franchise branches',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
]

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'password_hash',
  'token',
  'tokenhash',
  'secret',
  'twofactorsecret',
  'cardnumber',
  'cvv',
])

/**
 * Strips secrets, plain passwords, and sensitive keys from audit diffs.
 */
function sanitizeAuditPayload(data: any): any {
  if (!data || typeof data !== 'object') return data

  if (Array.isArray(data)) {
    return data.map(sanitizeAuditPayload)
  }

  const cleaned: Record<string, any> = {}
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase()
    if (SENSITIVE_KEYS.has(lowerKey)) {
      cleaned[key] = '[REDACTED]'
    } else if (typeof value === 'object' && value !== null) {
      cleaned[key] = sanitizeAuditPayload(value)
    } else {
      cleaned[key] = value
    }
  }
  return cleaned
}

/**
 * Appends a new immutable entry to the Audit Log.
 * Can execute inside a Prisma interactive transaction `tx`.
 */
export async function logAudit(
  entry: AuditEntry,
  tx?: Prisma.TransactionClient
): Promise<void> {
  const sanitizedBefore = entry.before ? sanitizeAuditPayload(entry.before) : undefined
  const sanitizedAfter = entry.after ? sanitizeAuditPayload(entry.after) : undefined

  if (isDbAvailable()) {
    try {
      const client = tx || prisma
      await client.auditLog.create({
        data: {
          actorId: entry.actorId ?? null,
          branchId: entry.branchId ?? null,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId ?? null,
          before: sanitizedBefore ? (sanitizedBefore as Prisma.InputJsonValue) : Prisma.JsonNull,
          after: sanitizedAfter ? (sanitizedAfter as Prisma.InputJsonValue) : Prisma.JsonNull,
          reason: entry.reason ?? null,
          ip: entry.ip ?? null,
        },
      })
    } catch {
      markDbOffline()
    }
  }

  // Always keep in-memory copy for rapid demo review
  demoAuditBuffer.unshift({
    ...entry,
    id: String(Date.now()),
    createdAt: new Date().toISOString(),
    before: sanitizedBefore ?? null,
    after: sanitizedAfter ?? null,
  })

  // Keep latest 100 entries in buffer
  if (demoAuditBuffer.length > 100) {
    demoAuditBuffer.pop()
  }
}

/**
 * Retrieves audit log entries filtered by caller scope.
 */
export async function getAuditLogs(options: {
  branchId?: string | null
  action?: string | null
  limit?: number
}) {
  const limit = options.limit || 50

  if (isDbAvailable()) {
    try {
      const where: Prisma.AuditLogWhereInput = {}
      if (options.branchId) {
        where.branchId = options.branchId
      }
      if (options.action) {
        where.action = options.action
      }

      const logs = await prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          actor: {
            select: { id: true, name: true, loginId: true, role: true },
          },
          branch: {
            select: { id: true, code: true, name: true },
          },
        },
      })

      if (logs.length > 0) {
        return logs.map((l) => ({
          id: l.id.toString(),
          action: l.action,
          entityType: l.entityType,
          entityId: l.entityId,
          actorId: l.actorId,
          actorName: l.actor?.name || 'System',
          actorLoginId: l.actor?.loginId || null,
          branchId: l.branchId,
          branchName: l.branch?.name || (l.branchId ? l.branchId : 'All Branches'),
          before: l.before,
          after: l.after,
          reason: l.reason,
          ip: l.ip,
          createdAt: l.createdAt.toISOString(),
        }))
      }
    } catch {
      markDbOffline()
    }
  }

  return demoAuditBuffer
    .filter((l) => {
      if (options.branchId && l.branchId !== options.branchId) return false
      if (options.action && l.action !== options.action) return false
      return true
    })
    .slice(0, limit)
}

