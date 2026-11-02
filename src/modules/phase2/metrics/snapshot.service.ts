import { prisma, isDbAvailable, markDbOffline } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { UserContext, authorize, RecordNotFoundError } from '@/lib/rbac'
import { assertBranchAccess } from '@/lib/branch-query'
import { MetricDailyBranchRecord } from './metric-definitions'
import { listPayments } from '@/services/payment.service'
import { listStudents } from '@/services/student.service'
import { getOutstandingFeesReport, getAttendanceSummaryReport } from '@/services/report.service'
import { listEnquiries } from '../enquiries/enquiry.service'

// In-memory demo buffer for fallback / offline test resiliency
let demoMetricsStore: MetricDailyBranchRecord[] = []

export function resetDemoMetrics(): void {
  demoMetricsStore = []
}

export const resetDemoSnapshots = resetDemoMetrics

export async function getDailyBranchSnapshot(
  caller: UserContext,
  params: { branchId: string; businessDate: string }
): Promise<MetricDailyBranchRecord> {
  return buildDailyBranchSnapshot(caller, params.branchId, params.businessDate)
}

export async function rebuildDailyBranchSnapshot(
  caller: UserContext,
  params: { branchId: string; businessDate: string }
): Promise<MetricDailyBranchRecord> {
  return buildDailyBranchSnapshot(caller, params.branchId, params.businessDate)
}


/**
 * Builds (or rebuilds) a daily branch snapshot row (W2-11, Step 2.6).
 * Idempotent: running twice for the same branch and date produces identical totals.
 */
export async function buildDailyBranchSnapshot(
  caller: UserContext,
  branchId: string,
  businessDate: string // YYYY-MM-DD
): Promise<MetricDailyBranchRecord> {
  authorize(caller, 'report:view')
  assertBranchAccess(caller, branchId, 'Branch')

  const dateFormatted = businessDate.split('T')[0]
  const dayStart = `${dateFormatted}T00:00:00.000Z`
  const dayEnd = `${dateFormatted}T23:59:59.999Z`

  // 1. Phase 1 Payments & Collections
  const allPayments = await listPayments(caller, { branchId })
  const dayPayments = allPayments.filter((p) => {
    const pDate = (p.businessDate || p.receivedAt || '').split('T')[0]
    return pDate === dateFormatted
  })

  let collectionsCashPaise = 0
  let collectionsOnlinePaise = 0
  let reversalsPaise = 0

  for (const p of dayPayments) {
    if (p.method === 'CASH') {
      collectionsCashPaise += p.amountPaise
    } else if (p.method === 'ONLINE') {
      collectionsOnlinePaise += p.amountPaise
    }
  }

  // Reversals on this business date
  const reversedPayments = allPayments.filter((p) => {
    if (!p.reversedAt) return false
    return p.reversedAt.split('T')[0] === dateFormatted
  })
  for (const p of reversedPayments) {
    reversalsPaise += p.amountPaise
  }

  // 2. Phase 1 Outstanding & Overdue Dues
  const feesReport = await getOutstandingFeesReport(caller, { branchId })
  const outstandingPaise = feesReport.currentPaise || 0
  const overduePaise =
    (feesReport.overdue1to7Paise || 0) +
    (feesReport.overdue8to14Paise || 0) +
    (feesReport.overdue14PlusPaise || 0)

  // 3. Phase 1 Active Students
  const students = await listStudents(caller, { branchId, status: 'ACTIVE' })
  const activeStudents = students.length

  // 4. Phase 1 Attendance
  let attendanceSessionsMarked = 0
  let attendancePresent = 0
  let attendanceAbsent = 0

  try {
    const attReport = await getAttendanceSummaryReport(caller, {
      branchId,
      startDate: dateFormatted,
      endDate: dateFormatted,
    })
    attendanceSessionsMarked = attReport.totalSessionsHeld
    for (const b of attReport.batches) {
      attendancePresent += b.presentCount
      attendanceAbsent += b.absentCount
    }
  } catch {}

  // 5. Phase 2 Enquiries & Trials
  const branchEnquiries = await listEnquiries(caller, { branchId })
  let enquiriesCreated = 0
  let enquiriesContacted = 0
  let enquiriesConverted = 0
  let enquiriesLost = 0

  for (const e of branchEnquiries) {
    const cDate = e.createdAt.split('T')[0]
    if (cDate === dateFormatted) {
      enquiriesCreated++
    }
    if (e.lastContactedAt && e.lastContactedAt.split('T')[0] === dateFormatted) {
      enquiriesContacted++
    }
    if (e.convertedAt && e.convertedAt.split('T')[0] === dateFormatted) {
      enquiriesConverted++
    }
    if (e.status === 'LOST' && e.updatedAt.split('T')[0] === dateFormatted) {
      enquiriesLost++
    }
  }

  const now = new Date().toISOString()
  const snapshotId = `mb-${branchId}-${dateFormatted}`

  const snapshot: MetricDailyBranchRecord = {
    id: snapshotId,
    branchId,
    businessDate: dateFormatted,
    collectionsCashPaise,
    collectionsOnlinePaise,
    reversalsPaise,
    netCollectionsPaise: collectionsCashPaise + collectionsOnlinePaise - reversalsPaise,
    outstandingPaise,
    overduePaise,
    activeStudents,
    activeStudentsCount: activeStudents,
    attendanceSessionsMarked,
    attendancePresent,
    attendanceAbsent,
    enquiriesCreated,
    enquiriesContacted,
    enquiriesConverted,
    enquiriesLost,
    trialsAttended: 0,
    computedAt: now,
    sourceVersion: 1,
  }

  // 6. Database Upsert
  if (isDbAvailable()) {
    try {
      await prisma.metricDailyBranch.upsert({
        where: {
          branchId_businessDate: {
            branchId,
            businessDate: new Date(dateFormatted),
          },
        },
        create: {
          id: snapshot.id,
          branchId: snapshot.branchId,
          businessDate: new Date(dateFormatted),
          collectionsCashPaise: snapshot.collectionsCashPaise,
          collectionsOnlinePaise: snapshot.collectionsOnlinePaise,
          reversalsPaise: snapshot.reversalsPaise,
          outstandingPaise: snapshot.outstandingPaise,
          overduePaise: snapshot.overduePaise,
          activeStudents: snapshot.activeStudents,
          attendanceSessionsMarked: snapshot.attendanceSessionsMarked,
          attendancePresent: snapshot.attendancePresent,
          attendanceAbsent: snapshot.attendanceAbsent,
          enquiriesCreated: snapshot.enquiriesCreated,
          enquiriesContacted: snapshot.enquiriesContacted,
          enquiriesConverted: snapshot.enquiriesConverted,
          enquiriesLost: snapshot.enquiriesLost,
          trialsAttended: snapshot.trialsAttended,
          computedAt: new Date(now),
          sourceVersion: 1,
        },
        update: {
          collectionsCashPaise: snapshot.collectionsCashPaise,
          collectionsOnlinePaise: snapshot.collectionsOnlinePaise,
          reversalsPaise: snapshot.reversalsPaise,
          outstandingPaise: snapshot.outstandingPaise,
          overduePaise: snapshot.overduePaise,
          activeStudents: snapshot.activeStudents,
          attendanceSessionsMarked: snapshot.attendanceSessionsMarked,
          attendancePresent: snapshot.attendancePresent,
          attendanceAbsent: snapshot.attendanceAbsent,
          enquiriesCreated: snapshot.enquiriesCreated,
          enquiriesContacted: snapshot.enquiriesContacted,
          enquiriesConverted: snapshot.enquiriesConverted,
          enquiriesLost: snapshot.enquiriesLost,
          trialsAttended: snapshot.trialsAttended,
          computedAt: new Date(now),
        },
      })
    } catch {
      markDbOffline()
    }
  }

  // Upsert in-memory demo store
  const existingIdx = demoMetricsStore.findIndex(
    (m) => m.branchId === branchId && m.businessDate === dateFormatted
  )
  if (existingIdx >= 0) {
    demoMetricsStore[existingIdx] = snapshot
  } else {
    demoMetricsStore.push(snapshot)
  }

  await logAudit({
    actorId: caller.userId,
    branchId,
    action: 'p2.metrics.rebuild',
    entityType: 'MetricDailyBranch',
    entityId: snapshot.id,
    after: {
      businessDate: dateFormatted,
      collectionsCashPaise,
      collectionsOnlinePaise,
      reversalsPaise,
    },
    reason: `Built metrics snapshot for ${branchId} on ${dateFormatted}`,
  })

  return snapshot
}

/**
 * Computes real-time live metrics for today on the fly.
 */
export async function getLiveBranchMetrics(
  caller: UserContext,
  branchId: string
): Promise<MetricDailyBranchRecord> {
  const today = new Date().toISOString().split('T')[0]
  return buildDailyBranchSnapshot(caller, branchId, today)
}

/**
 * Retrieves historical daily snapshot records for a date range.
 */
export async function getHistoricalBranchMetrics(
  caller: UserContext,
  branchId: string,
  startDate: string,
  endDate: string
): Promise<MetricDailyBranchRecord[]> {
  authorize(caller, 'report:view')
  assertBranchAccess(caller, branchId, 'Branch')

  const startFormatted = startDate.split('T')[0]
  const endFormatted = endDate.split('T')[0]

  if (isDbAvailable()) {
    try {
      const records = await prisma.metricDailyBranch.findMany({
        where: {
          branchId,
          businessDate: {
            gte: new Date(startFormatted),
            lte: new Date(endFormatted),
          },
        },
        orderBy: { businessDate: 'asc' },
      })

      return records.map((r) => ({
        id: r.id,
        branchId: r.branchId,
        businessDate: r.businessDate.toISOString().split('T')[0],
        collectionsCashPaise: r.collectionsCashPaise,
        collectionsOnlinePaise: r.collectionsOnlinePaise,
        reversalsPaise: r.reversalsPaise,
        outstandingPaise: r.outstandingPaise,
        overduePaise: r.overduePaise,
        activeStudents: r.activeStudents,
        attendanceSessionsMarked: r.attendanceSessionsMarked,
        attendancePresent: r.attendancePresent,
        attendanceAbsent: r.attendanceAbsent,
        enquiriesCreated: r.enquiriesCreated,
        enquiriesContacted: r.enquiriesContacted,
        enquiriesConverted: r.enquiriesConverted,
        enquiriesLost: r.enquiriesLost,
        trialsAttended: r.trialsAttended,
        computedAt: r.computedAt.toISOString(),
        sourceVersion: r.sourceVersion,
      }))
    } catch {
      markDbOffline()
    }
  }

  return demoMetricsStore.filter((m) => {
    return (
      m.branchId === branchId &&
      m.businessDate >= startFormatted &&
      m.businessDate <= endFormatted
    )
  })
}
