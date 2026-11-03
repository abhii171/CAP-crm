/**
 * Enquiry Assignment & Assignment History Service
 *
 * Handles single-enquiry reassignment and a permanent, append-only
 * assignment history log (per-enquiry timeline).
 *
 * RBAC:
 *   ADMIN   → can assign to any active staff across all branches
 *   MANAGER → can assign only within their own branch
 */

import { prisma, isDbAvailable, markDbOffline } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { UserContext, authorize, RecordNotFoundError, PermissionDeniedError } from '@/lib/rbac'
import { assertBranchAccess } from '@/lib/branch-query'
import { loadDemoData, saveDemoData } from '@/lib/demo-storage'
import { getEnquiryById, updateDemoEnquiryStage } from './enquiry.service'
import { listUsers } from '@/services/user.service'

function newId(): string {
  return `asgn-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type AssignmentActionType = 'INITIAL_ASSIGNMENT' | 'REASSIGNMENT' | 'UNASSIGNMENT'

export interface AssignmentHistoryRecord {
  id: string
  enquiryId: string
  enquiryChildName: string
  branchId: string
  previousUserId: string | null
  previousUserName: string | null
  newUserId: string | null
  newUserName: string | null
  actionType: AssignmentActionType
  performedByUserId: string
  performedByName: string
  note: string | null
  createdAt: string
}

const DEMO_KEY = 'enquiry-assign-history'

// ─── Demo helpers ─────────────────────────────────────────────────────────────

function loadHistory(): AssignmentHistoryRecord[] {
  return loadDemoData<AssignmentHistoryRecord[]>(DEMO_KEY, [])
}

function saveHistory(records: AssignmentHistoryRecord[]): void {
  saveDemoData(DEMO_KEY, records)
}

// ─── assignEnquiry ────────────────────────────────────────────────────────────

/**
 * Assigns (or reassigns) a single enquiry to a new staff member.
 * Records an immutable history entry every time.
 */
export async function assignEnquiry(
  caller: UserContext,
  enquiryId: string,
  newUserId: string,
  note?: string
): Promise<{ enquiry: Awaited<ReturnType<typeof getEnquiryById>>; historyEntry: AssignmentHistoryRecord }> {
  authorize(caller, 'enquiry:assign')

  // Load enquiry (validates caller branch access internally)
  const enquiry = await getEnquiryById(caller, enquiryId)
  assertBranchAccess(caller, enquiry.branchId, 'Enquiry')

  // Resolve target user
  let targetUser: { id: string; name: string; branchId?: string | null; isActive?: boolean } | undefined

  if (isDbAvailable()) {
    try {
      const u = await prisma.user.findUnique({
        where: { id: newUserId },
        select: { id: true, name: true, branchId: true, isActive: true },
      })
      if (u) targetUser = u
    } catch {
      markDbOffline()
    }
  }

  if (!targetUser) {
    const allUsers = await listUsers({ ...caller, role: 'ADMIN' })
    targetUser = allUsers.find((u) => u.id === newUserId)
  }

  if (!targetUser) throw new RecordNotFoundError('User')
  if (targetUser.isActive === false) throw new Error('Cannot assign enquiry to an inactive staff member.')

  // Branch alignment: manager can only assign within own branch
  if (caller.role !== 'ADMIN' && targetUser.branchId !== caller.branchId) {
    throw new PermissionDeniedError('Cannot assign enquiry to a staff member outside your branch.')
  }

  // Resolve performer name
  let performerName = caller.userId
  if (isDbAvailable()) {
    try {
      const p = await prisma.user.findUnique({ where: { id: caller.userId }, select: { name: true } })
      if (p?.name) performerName = p.name
    } catch {
      markDbOffline()
    }
  }
  if (performerName === caller.userId) {
    const all = await listUsers({ ...caller, role: 'ADMIN' })
    const found = all.find((u) => u.id === caller.userId)
    if (found?.name) performerName = found.name
  }

  // Resolve previous user name
  let previousUserName: string | null = null
  const prevUserId = enquiry.assignedToUserId ?? null
  if (prevUserId) {
    if (isDbAvailable()) {
      try {
        const pu = await prisma.user.findUnique({ where: { id: prevUserId }, select: { name: true } })
        if (pu?.name) previousUserName = pu.name
      } catch {
        markDbOffline()
      }
    }
    if (!previousUserName) {
      const all = await listUsers({ ...caller, role: 'ADMIN' })
      previousUserName = all.find((u) => u.id === prevUserId)?.name ?? null
    }
  }

  const actionType: AssignmentActionType =
    prevUserId === null ? 'INITIAL_ASSIGNMENT' : 'REASSIGNMENT'

  const historyEntry: AssignmentHistoryRecord = {
    id: newId(),
    enquiryId: enquiry.id,
    enquiryChildName: enquiry.childName,
    branchId: enquiry.branchId,
    previousUserId: prevUserId,
    previousUserName,
    newUserId: targetUser.id,
    newUserName: targetUser.name,
    actionType,
    performedByUserId: caller.userId,
    performedByName: performerName,
    note: note ?? null,
    createdAt: new Date().toISOString(),
  }

  // ── Persist: DB ──────────────────────────────────────────────────────────
  if (isDbAvailable()) {
    try {
      await prisma.enquiry.update({
        where: { id: enquiryId },
        data: { assignedToUserId: targetUser.id, updatedAt: new Date() },
      })
      try {
        await prisma.$executeRaw`
          INSERT INTO enquiry_assignment_history
            (id, enquiry_id, enquiry_child_name, branch_id,
             previous_user_id, previous_user_name,
             new_user_id, new_user_name,
             action_type, performed_by_user_id, performed_by_name,
             note, created_at)
          VALUES (
            ${historyEntry.id}, ${historyEntry.enquiryId}, ${historyEntry.enquiryChildName},
            ${historyEntry.branchId}, ${historyEntry.previousUserId}, ${historyEntry.previousUserName},
            ${historyEntry.newUserId}, ${historyEntry.newUserName},
            ${historyEntry.actionType}, ${historyEntry.performedByUserId}, ${historyEntry.performedByName},
            ${historyEntry.note}, ${new Date(historyEntry.createdAt)}
          )
        `
      } catch {
        // Table may not exist yet in dev/demo mode
      }
    } catch {
      markDbOffline()
    }
  }

  // ── Persist: Demo disk ───────────────────────────────────────────────────
  updateDemoEnquiryStage(enquiryId, { assignedToUserId: targetUser.id, updatedAt: new Date().toISOString() })

  const history = loadHistory()
  history.unshift(historyEntry)
  saveHistory(history)

  // ── Audit log ────────────────────────────────────────────────────────────
  await logAudit({
    actorId: caller.userId,
    branchId: enquiry.branchId,
    action: 'p2.enquiry.assign',
    entityType: 'Enquiry',
    entityId: enquiry.id,
    before: { assignedToUserId: prevUserId, assignedToName: previousUserName },
    after: { assignedToUserId: targetUser.id, assignedToName: targetUser.name },
    reason: note || `${actionType === 'INITIAL_ASSIGNMENT' ? 'Initial assignment' : 'Reassigned'} to ${targetUser.name}`,
  })

  // Return refreshed enquiry
  const updated = await getEnquiryById(caller, enquiryId)
  return { enquiry: updated, historyEntry }
}

// ─── listAssignmentHistory ────────────────────────────────────────────────────

/**
 * Returns the full assignment history for a single enquiry, newest first.
 * Caller must have read access to the enquiry's branch.
 */
export async function listAssignmentHistory(
  caller: UserContext,
  enquiryId: string
): Promise<AssignmentHistoryRecord[]> {
  authorize(caller, 'enquiry:read')

  // Validate branch access
  const enquiry = await getEnquiryById(caller, enquiryId)
  assertBranchAccess(caller, enquiry.branchId, 'Enquiry')

  // DB path (raw query, no migration required)
  if (isDbAvailable()) {
    try {
      const rows = await prisma.$queryRaw<any[]>`
        SELECT
          id, enquiry_id AS "enquiryId", enquiry_child_name AS "enquiryChildName",
          branch_id AS "branchId",
          previous_user_id AS "previousUserId", previous_user_name AS "previousUserName",
          new_user_id AS "newUserId", new_user_name AS "newUserName",
          action_type AS "actionType",
          performed_by_user_id AS "performedByUserId", performed_by_name AS "performedByName",
          note, created_at AS "createdAt"
        FROM enquiry_assignment_history
        WHERE enquiry_id = ${enquiryId}
        ORDER BY created_at DESC
      `
      return rows.map((r) => ({
        ...r,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      }))
    } catch {
      markDbOffline()
    }
  }

  // Demo disk path
  const all = loadHistory()
  return all.filter((h) => h.enquiryId === enquiryId)
}
