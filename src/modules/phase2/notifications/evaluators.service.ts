import { UserContext } from '@/lib/rbac'
import { createNotificationEvent } from './notification.service'
import { listEnquiries } from '../enquiries/enquiry.service'
import { listFollowUps, listNeedsOwnerEnquiries } from '../enquiries/follow-up.service'
import { listTrialsForEnquiry } from '../trials/trial.service'
import { getUnclosedDaysReport } from '@/services/report.service'
import { listBranches } from '@/services/branch.service'

const systemAdmin: UserContext = {
  userId: 'system-evaluator',
  loginId: 'SYS-EVAL',
  role: 'ADMIN',
  branchId: null,
}

export interface EvaluatorRunResult {
  unassignedEvaluated: number
  overdueFollowUpsEvaluated: number
  upcomingTrialsEvaluated: number
  inactiveOwnersEvaluated: number
  unclosedDaysEvaluated: number
  totalNotificationsCreated: number
}

/**
 * Evaluates unassigned public website enquiries (W2-2, W2-10).
 * Key pattern: unassigned_enquiry:{enquiryId}
 */
export async function evaluateUnassignedEnquiries(): Promise<number> {
  const openEnquiries = await listEnquiries(systemAdmin, { status: 'NEW' })
  let createdCount = 0

  for (const enq of openEnquiries) {
    if (!enq.assignedToUserId) {
      const res = await createNotificationEvent(systemAdmin, {
        type: 'NEW_ENQUIRY_UNASSIGNED',
        branchId: enq.branchId,
        dedupeKey: `unassigned_enquiry:${enq.id}`,
        payload: {
          enquiryId: enq.id,
          childName: enq.childName,
          source: enq.source,
        },
      })
      createdCount += res.createdNotificationsCount
    }
  }

  return createdCount
}

/**
 * Evaluates overdue follow-ups (W2-5, W2-10).
 * Key pattern: followup_overdue:{followUpId}:{date}
 */
export async function evaluateOverdueFollowUps(): Promise<number> {
  const overdueFollowUps = await listFollowUps(systemAdmin, { overdueOnly: true })
  const today = new Date().toISOString().split('T')[0]
  let createdCount = 0

  for (const fu of overdueFollowUps) {
    const res = await createNotificationEvent(systemAdmin, {
      type: 'FOLLOWUP_OVERDUE',
      dedupeKey: `followup_overdue:${fu.id}:${today}`,
      payload: {
        followUpId: fu.id,
        enquiryId: fu.enquiryId,
        dueDate: fu.dueAt.split('T')[0],
        channel: fu.channel,
      },
    })
    createdCount += res.createdNotificationsCount
  }

  return createdCount
}

/**
 * Evaluates enquiries whose assigned owner has been deactivated in Phase 1 (W2-6, W2-10).
 * Key pattern: owner_deactivated:{enquiryId}:{ownerId}
 */
export async function evaluateInactiveOwners(): Promise<number> {
  const needsOwnerList = await listNeedsOwnerEnquiries(systemAdmin)
  let createdCount = 0

  for (const enq of needsOwnerList) {
    if (enq.assignedToUserId) {
      const res = await createNotificationEvent(systemAdmin, {
        type: 'OWNER_DEACTIVATED',
        branchId: enq.branchId,
        dedupeKey: `owner_deactivated:${enq.id}:${enq.assignedToUserId}`,
        payload: {
          enquiryId: enq.id,
          childName: enq.childName,
          previousOwnerId: enq.assignedToUserId,
        },
      })
      createdCount += res.createdNotificationsCount
    }
  }

  return createdCount
}

/**
 * Evaluates unclosed business dates in Phase 1 (Phase 1 step 1.16 report, W2-10).
 * Reads Phase 1 unclosed report without any Phase 1 modifications.
 * Key pattern: unclosed_day:{branchId}:{businessDate}
 */
export async function evaluateUnclosedDays(): Promise<number> {
  const branches = await listBranches(systemAdmin)
  let createdCount = 0

  for (const b of branches) {
    const report = await getUnclosedDaysReport(systemAdmin, { branchId: b.id })
    for (const d of report.items) {
      const res = await createNotificationEvent(systemAdmin, {
        type: 'UNCLOSED_DAY',
        branchId: b.id,
        dedupeKey: `unclosed_day:${b.id}:${d.businessDate}`,
        payload: {
          branchId: b.id,
          branchName: b.name,
          businessDate: d.businessDate,
          discrepancyPaise: d.discrepancyPaise,
        },
      })
      createdCount += res.createdNotificationsCount
    }
  }

  return createdCount
}

/**
 * Master evaluator job: runs all scheduled evaluators in sequence (W2-10).
 * Idempotent: multiple consecutive runs do not produce duplicate notifications.
 */
export async function runAllEvaluators(): Promise<EvaluatorRunResult> {
  const unassigned = await evaluateUnassignedEnquiries()
  const overdue = await evaluateOverdueFollowUps()
  const inactiveOwners = await evaluateInactiveOwners()
  const unclosed = await evaluateUnclosedDays()

  return {
    unassignedEvaluated: unassigned,
    overdueFollowUpsEvaluated: overdue,
    upcomingTrialsEvaluated: 0,
    inactiveOwnersEvaluated: inactiveOwners,
    unclosedDaysEvaluated: unclosed,
    totalNotificationsCreated: unassigned + overdue + inactiveOwners + unclosed,
  }
}
