import { prisma, isDbAvailable } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { UserContext, authorize, RecordNotFoundError, PermissionDeniedError } from '@/lib/rbac'
import { assertBranchAccess } from '@/lib/branch-query'
import { listBranches } from '@/services/branch.service'
import { getCollectionsReport } from '@/services/report.service'
import { getDailyBranchSnapshot } from './snapshot.service'
import { createNotificationEvent } from '../notifications/notification.service'

export interface ReconciliationRunRecord {
  id: string
  branchId: string
  businessDate: string
  ranAt: string
  status: 'OK' | 'MISMATCH'
  diffCollectionsPaise: number
  diffReversalsPaise: number
  diffOutstandingPaise: number
  details?: Record<string, any> | null
  createdAt: string
}

let demoReconciliationRuns: ReconciliationRunRecord[] = []

export function resetDemoReconciliationRuns() {
  demoReconciliationRuns = []
}

/**
 * Nightly reconciliation job comparing Phase 2 snapshot totals against Phase 1 reports.
 * Hard Rule 9: One definition per metric. Net collections = (Cash + Online) - Reversals.
 * Dispatches CRITICAL notification if any discrepancy is detected.
 */
export async function runNightlyBranchReconciliation(
  caller: UserContext,
  params: {
    branchId: string
    businessDate: string
  }
): Promise<ReconciliationRunRecord> {
  authorize(caller, 'report:view')
  assertBranchAccess(caller, params.branchId)

  const dateFormatted = params.businessDate.split('T')[0]

  // 1. Fetch Phase 2 daily snapshot for this branch & business date
  const snapshot = await getDailyBranchSnapshot(caller, {
    branchId: params.branchId,
    businessDate: dateFormatted,
  })

  // 2. Fetch authoritative Phase 1 collections report
  const collectionsReport = await getCollectionsReport(caller, {
    startDate: dateFormatted,
    endDate: dateFormatted,
  })

  const branchSummary = collectionsReport.branches.find((b) => b.branchId === params.branchId)

  const p1TotalCollectionsPaise = branchSummary ? branchSummary.totalCollectionsPaise : 0
  const p1ReversalsPaise = branchSummary ? branchSummary.reversalsTotalPaise : 0

  const p2TotalCollectionsPaise = snapshot.collectionsCashPaise + snapshot.collectionsOnlinePaise
  const p2ReversalsPaise = snapshot.reversalsPaise

  const diffCollections = Math.abs(p2TotalCollectionsPaise - p1TotalCollectionsPaise)
  const diffReversals = Math.abs(p2ReversalsPaise - p1ReversalsPaise)
  const diffOutstanding = 0 // In future phases, verified against ledger trial balance

  const isMatched = diffCollections === 0 && diffReversals === 0 && diffOutstanding === 0
  const status: 'OK' | 'MISMATCH' = isMatched ? 'OK' : 'MISMATCH'

  const record: ReconciliationRunRecord = {
    id: `recon-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    branchId: params.branchId,
    businessDate: dateFormatted,
    ranAt: new Date().toISOString(),
    status,
    diffCollectionsPaise: diffCollections,
    diffReversalsPaise: diffReversals,
    diffOutstandingPaise: diffOutstanding,
    details: {
      p1TotalCollectionsPaise,
      p2TotalCollectionsPaise,
      p1ReversalsPaise,
      p2ReversalsPaise,
      snapshotNetPaise: snapshot.netCollectionsPaise,
    },
    createdAt: new Date().toISOString(),
  }

  // Persist run
  if (isDbAvailable()) {
    try {
      const created = await (prisma as any).metricReconciliationRun.create({
        data: {
          branchId: record.branchId,
          businessDate: new Date(record.businessDate),
          status: record.status,
          diffCollectionsPaise: record.diffCollectionsPaise,
          diffReversalsPaise: record.diffReversalsPaise,
          diffOutstandingPaise: record.diffOutstandingPaise,
          details: record.details ? JSON.stringify(record.details) : null,
        },
      })
      record.id = created.id
    } catch {
      demoReconciliationRuns.unshift(record)
    }
  } else {
    demoReconciliationRuns.unshift(record)
  }

  // If MISMATCH, dispatch CRITICAL alert (Hard Rule 9 & W2-10)
  if (status === 'MISMATCH') {
    await createNotificationEvent(caller, {
      type: 'RECON_MISMATCH',
      branchId: params.branchId,
      dedupeKey: `recon-mismatch:${params.branchId}:${dateFormatted}`,
      severity: 'CRITICAL',
      payload: {
        branchId: params.branchId,
        businessDate: dateFormatted,
        diffCollectionsPaise: diffCollections,
        diffReversalsPaise: diffReversals,
      },
    })
  }

  await logAudit({
    actorId: caller.userId,
    branchId: params.branchId,
    action: 'p2.metrics.reconciliation_run',
    entityType: 'MetricReconciliationRun',
    entityId: record.id,
    after: {
      branchId: params.branchId,
      businessDate: dateFormatted,
      status,
      diffCollectionsPaise: diffCollections,
      diffReversalsPaise: diffReversals,
    },
    reason: `Nightly branch reconciliation status: ${status}`,
  })

  return record
}

/**
 * Run reconciliation sweep for all branches
 */
export async function runNightlyMasterReconciliation(
  caller: UserContext,
  businessDate: string
): Promise<ReconciliationRunRecord[]> {
  authorize(caller, 'report:view')
  const branches = await listBranches(caller)
  const results: ReconciliationRunRecord[] = []

  for (const b of branches) {
    const res = await runNightlyBranchReconciliation(caller, {
      branchId: b.id,
      businessDate,
    })
    results.push(res)
  }

  return results
}

/**
 * List reconciliation history for a branch
 */
export async function listReconciliationRuns(
  caller: UserContext,
  params: {
    branchId: string
    limit?: number
  }
): Promise<ReconciliationRunRecord[]> {
  authorize(caller, 'report:view')
  assertBranchAccess(caller, params.branchId)

  const limit = params.limit || 30

  if (isDbAvailable()) {
    try {
      const rows = await (prisma as any).metricReconciliationRun.findMany({
        where: { branchId: params.branchId },
        orderBy: { ranAt: 'desc' },
        take: limit,
      })
      return rows.map((r: any) => ({
        id: r.id,
        branchId: r.branchId,
        businessDate: r.businessDate.toISOString().split('T')[0],
        ranAt: r.ranAt.toISOString(),
        status: r.status,
        diffCollectionsPaise: r.diffCollectionsPaise,
        diffReversalsPaise: r.diffReversalsPaise,
        diffOutstandingPaise: r.diffOutstandingPaise,
        details: r.details ? JSON.parse(r.details) : null,
        createdAt: r.createdAt.toISOString(),
      }))
    } catch {
      // Fallback to demo
    }
  }

  return demoReconciliationRuns
    .filter((r) => r.branchId === params.branchId)
    .slice(0, limit)
}
