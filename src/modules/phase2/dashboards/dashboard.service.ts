import { prisma, isDbAvailable } from '@/lib/prisma'
import { UserContext, authorize, RecordNotFoundError } from '@/lib/rbac'
import { assertBranchAccess } from '@/lib/branch-query'
import { listBranches, getBranchById } from '@/services/branch.service'
import { listBatches } from '@/services/batch.service'
import { listStudents } from '@/services/student.service'
import { getSessionsForDate } from '@/services/attendance.service'
import { getOutstandingFeesReport, getCollectionsReport, getUnclosedDaysReport } from '@/services/report.service'
import { listEnquiries } from '../enquiries/enquiry.service'
import { listFollowUps } from '../enquiries/follow-up.service'
import { listTrialSessions } from '../trials/trial.service'
import { getDailyBranchSnapshot } from '../metrics/snapshot.service'
import { listReconciliationRuns } from '../metrics/reconciliation.service'
import { getNotificationSummary } from '../notifications/notification.service'

/**
 * Coach Dashboard View
 * Focused on today's pitch sessions, trial guests roster, and absence roll call.
 * Anti-poaching protection: Phone numbers stripped for coaches.
 */
export async function getCoachDashboard(caller: UserContext, dateStr?: string) {
  authorize(caller, 'attendance:mark')

  const today = dateStr || new Date().toISOString().split('T')[0]
  const branchId = caller.branchId

  if (!branchId) {
    throw new RecordNotFoundError('Branch')
  }

  // 1. Sessions for today
  const allSessions = await getSessionsForDate(caller, today)
  // Coach only sees their assigned sessions
  const coachSessions = allSessions.filter((s: any) => s.coachId === caller.userId || !s.coachId)

  // 2. Trial guests for today's batches (Anti-poaching redacted)
  const batchIds = coachSessions.map((s: any) => s.batchId)
  const allTrials = await listTrialSessions(caller, { branchId })
  const todayTrials = allTrials.filter((t) => {
    const isToday = t.sessionDate.split('T')[0] === today
    const matchesBatch = batchIds.length === 0 || batchIds.includes(t.batchId)
    return isToday && matchesBatch && t.status === 'SCHEDULED'
  })

  // Strip phone numbers for coach view
  const redactedTrialGuests = todayTrials.map((t) => ({
    id: t.id,
    batchId: t.batchId,
    childName: t.childName,
    childAgeYears: t.childAgeYears,
    note: t.note,
    status: t.status,
  }))

  return {
    today,
    sessionsCount: coachSessions.length,
    sessions: coachSessions,
    todayTrialGuestsCount: redactedTrialGuests.length,
    todayTrialGuests: redactedTrialGuests,
  }
}

/**
 * Branch Manager Dashboard View
 * Operational + Pipeline + Financial tiles scoped strictly to branch.
 */
export async function getManagerDashboard(caller: UserContext, branchId?: string) {
  const targetBranchId = branchId || caller.branchId
  if (!targetBranchId) {
    throw new RecordNotFoundError('Branch')
  }

  authorize(caller, 'report:view')
  assertBranchAccess(caller, targetBranchId)

  const today = new Date().toISOString().split('T')[0]
  const branch = await getBranchById(caller, targetBranchId)

  // 1. Live Daily Financial Snapshot
  const snapshot = await getDailyBranchSnapshot(caller, {
    branchId: targetBranchId,
    businessDate: today,
  })

  // 2. Pipeline metrics
  const branchEnquiries = await listEnquiries(caller, { branchId: targetBranchId })
  const unassignedEnquiries = branchEnquiries.filter((e) => !e.assignedToUserId && e.status === 'NEW')

  // 3. Overdue and Today's Follow-ups
  const overdueFollowUps = await listFollowUps(caller, { overdueOnly: true })
  const todayFollowUps = await listFollowUps(caller, { dueTodayOnly: true })

  // 4. Today's Trials
  const trials = await listTrialSessions(caller, { branchId: targetBranchId })
  const todayTrials = trials.filter((t) => t.sessionDate.split('T')[0] === today)

  // 5. Unread / Critical Notifications
  const notificationSummary = await getNotificationSummary(caller)

  // 6. Active Batches & Cadets
  const batches = await listBatches(caller, targetBranchId)
  const activeStudents = await listStudents(caller, { branchId: targetBranchId, status: 'ACTIVE' })

  return {
    branch: {
      id: branch.id,
      name: branch.name,
      code: branch.code,
      type: branch.type,
    },
    today,
    financials: {
      collectionsCashPaise: snapshot.collectionsCashPaise,
      collectionsOnlinePaise: snapshot.collectionsOnlinePaise,
      reversalsPaise: snapshot.reversalsPaise,
      netCollectionsPaise: snapshot.netCollectionsPaise || 0,
      outstandingPaise: snapshot.outstandingPaise,
      overduePaise: snapshot.overduePaise,
    },
    pipeline: {
      totalEnquiries: branchEnquiries.length,
      unassignedCount: unassignedEnquiries.length,
      overdueFollowUpsCount: overdueFollowUps.length,
      todayFollowUpsCount: todayFollowUps.length,
      todayTrialsCount: todayTrials.length,
    },
    operations: {
      activeCadetsCount: activeStudents.length,
      batchesCount: batches.length,
      unmarkedSessionsCount: snapshot.attendanceSessionsMarked,
    },
    notifications: notificationSummary,
  }
}

/**
 * Academy Admin Dashboard View
 * Multi-branch governance, cross-branch reconciliation status, and critical alerts.
 */
export async function getAdminDashboard(caller: UserContext) {
  authorize(caller, 'report:view')

  const today = new Date().toISOString().split('T')[0]
  const branches = await listBranches(caller)

  // 1. Aggregates across branches
  let totalNetCollectionsPaise = 0
  let totalCashCollectionsPaise = 0
  let totalOnlineCollectionsPaise = 0
  let totalOutstandingPaise = 0
  let totalActiveCadets = 0
  let totalUnassignedEnquiries = 0

  const branchOverviews: Array<{
    branchId: string
    name: string
    code: string
    type: string
    activeStudents: number
    todayNetPaise: number
    reconStatus: string
    unassignedEnquiries: number
  }> = []

  // Database mode: GroupBy queries keyed by branchId (avoids exhausting DB connection pool)
  if (isDbAvailable()) {
    try {
      const todayDate = new Date(today)

      const [paymentGroups, studentGroups, enquiryGroups, duesGroups, latestReconRuns] = await Promise.all([
        prisma.payment.groupBy({
          by: ['branchId', 'method', 'entryType'],
          where: { businessDate: todayDate },
          _sum: { amountPaise: true },
        }),
        prisma.student.groupBy({
          by: ['branchId'],
          where: { status: 'ACTIVE' },
          _count: { id: true },
        }),
        prisma.enquiry.groupBy({
          by: ['branchId'],
          where: { assignedToUserId: null, status: 'NEW' },
          _count: { id: true },
        }),
        prisma.feeDue.groupBy({
          by: ['branchId'],
          where: { status: { in: ['UNPAID', 'PARTIAL'] } },
          _sum: { amountPaise: true, paidPaise: true },
        }),
        prisma.metricReconciliationRun.findMany({
          orderBy: { createdAt: 'desc' },
          distinct: ['branchId'],
        }),
      ])

      const paymentsByBranch = new Map<string, { cash: number; online: number; reversal: number }>()
      for (const pg of paymentGroups) {
        const cur = paymentsByBranch.get(pg.branchId) || { cash: 0, online: 0, reversal: 0 }
        const amt = pg._sum.amountPaise || 0
        if (pg.entryType === 'REVERSAL') {
          cur.reversal += amt
        } else if (pg.method === 'CASH') {
          cur.cash += amt
        } else if (pg.method === 'ONLINE') {
          cur.online += amt
        }
        paymentsByBranch.set(pg.branchId, cur)
      }

      const studentsByBranch = new Map<string, number>()
      for (const sg of studentGroups) {
        studentsByBranch.set(sg.branchId, sg._count.id)
      }

      const unassignedByBranch = new Map<string, number>()
      for (const eg of enquiryGroups) {
        unassignedByBranch.set(eg.branchId, eg._count.id)
      }

      const duesByBranch = new Map<string, number>()
      for (const dg of duesGroups) {
        const remaining = (dg._sum.amountPaise || 0) - (dg._sum.paidPaise || 0)
        duesByBranch.set(dg.branchId, Math.max(0, remaining))
      }

      const reconByBranch = new Map<string, string>()
      for (const rr of latestReconRuns) {
        if (rr.branchId) reconByBranch.set(rr.branchId, rr.status)
      }

      for (const b of branches) {
        const p = paymentsByBranch.get(b.id) || { cash: 0, online: 0, reversal: 0 }
        const todayNet = (p.cash + p.online) - p.reversal
        const activeCadets = studentsByBranch.get(b.id) || 0
        const unassigned = unassignedByBranch.get(b.id) || 0
        const outstanding = duesByBranch.get(b.id) || 0
        const reconStatus = reconByBranch.get(b.id) || 'OK'

        totalNetCollectionsPaise += todayNet
        totalCashCollectionsPaise += p.cash
        totalOnlineCollectionsPaise += p.online
        totalOutstandingPaise += outstanding
        totalActiveCadets += activeCadets
        totalUnassignedEnquiries += unassigned

        branchOverviews.push({
          branchId: b.id,
          name: b.name,
          code: b.code,
          type: b.type,
          activeStudents: activeCadets,
          todayNetPaise: todayNet,
          reconStatus,
          unassignedEnquiries: unassigned,
        })
      }
    } catch {
      // Database offline, fall back to batch demo metrics
    }
  }

  // Fallback to batch-loaded demo data if DB is offline or returned empty
  if (branchOverviews.length === 0) {
    const [allSnapshots, allEnquiries, allReconLists] = await Promise.all([
      Promise.all(branches.map((b) => getDailyBranchSnapshot(caller, { branchId: b.id, businessDate: today }))),
      listEnquiries(caller),
      Promise.all(branches.map((b) => listReconciliationRuns(caller, { branchId: b.id, limit: 1 }))),
    ])

    const enquiriesByBranch = new Map<string, number>()
    for (const e of allEnquiries) {
      if (!e.assignedToUserId && e.status === 'NEW') {
        enquiriesByBranch.set(e.branchId, (enquiriesByBranch.get(e.branchId) || 0) + 1)
      }
    }

    branches.forEach((b, idx) => {
      const snapshot = allSnapshots[idx]
      const unassigned = enquiriesByBranch.get(b.id) || 0
      const latestRecon = allReconLists[idx]?.[0] || null
      const reconStatus = latestRecon?.status || 'OK'

      totalNetCollectionsPaise += snapshot.netCollectionsPaise || 0
      totalCashCollectionsPaise += snapshot.collectionsCashPaise
      totalOnlineCollectionsPaise += snapshot.collectionsOnlinePaise
      totalOutstandingPaise += (snapshot.outstandingPaise || 0) + (snapshot.overduePaise || 0)
      totalActiveCadets += snapshot.activeStudents || 0
      totalUnassignedEnquiries += unassigned

      branchOverviews.push({
        branchId: b.id,
        name: b.name,
        code: b.code,
        type: b.type,
        activeStudents: snapshot.activeStudents,
        todayNetPaise: snapshot.netCollectionsPaise || 0,
        reconStatus,
        unassignedEnquiries: unassigned,
      })
    })
  }

  // 2. Unclosed Days across academy
  const unclosedReport = await getUnclosedDaysReport(caller)
  const unclosedDaysCount = unclosedReport.items.length

  // 3. Notification & Alert Summary
  const notificationSummary = await getNotificationSummary(caller)

  return {
    today,
    branchesCount: branches.length,
    financials: {
      totalNetCollectionsPaise,
      totalCashCollectionsPaise,
      totalOnlineCollectionsPaise,
      totalOutstandingPaise,
    },
    operations: {
      totalActiveCadets,
      totalUnassignedEnquiries,
      unclosedDaysCount,
    },
    branches: branchOverviews,
    notifications: notificationSummary,
  }
}
