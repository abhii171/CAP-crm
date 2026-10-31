import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { UserContext, authorize } from '@/lib/rbac'
import { getStudentById, getStudentContactForAlert } from './student.service'
import { listStudentDues, FeeDueRecord, demoFeeDues } from './fee.service'
import { createPaymentLink } from './online-payment.service'
import { queueOutboundMessage } from './whatsapp.service'

export type ReminderMilestone = 'T_MINUS_3' | 'T_ZERO' | 'T_PLUS_3' | 'T_PLUS_7' | 'T_PLUS_14'

export interface ReminderJobResult {
  date: string
  scannedDues: number
  sentReminders: number
  skippedPaidOrWaived: number
  skippedPaused: number
  flaggedOverdue14Days: number
  remindersSent: Array<{
    dueId: string
    studentId: string
    studentName: string
    milestone: ReminderMilestone
    amount: string
    paymentLink: string
  }>
}

// In-memory set to prevent duplicate milestone reminders: Set of `${dueId}_${milestone}`
const sentMilestones = new Set<string>()

// Set of dues flagged for manager attention (> 14 days overdue)
const flaggedForManagerDues = new Set<string>()

/**
 * Executes the scheduled fee reminder engine (WORKFLOWS.md § 5).
 * - 3 days before due date: Friendly reminder with payment link
 * - On due date: Due today reminder with payment link
 * - 3, 7, 14 days after: Overdue reminders with payment link
 * - > 14 days after: Reminders stop automatically and due is flagged for manager follow-up
 * - Dues that are PAID, WAIVED, or PAUSED by manager are strictly skipped.
 */
export async function runFeeReminderScheduler(
  caller?: UserContext | null,
  referenceDateStr?: string
): Promise<ReminderJobResult> {
  if (caller) {
    authorize(caller, 'fee:view')
  }

  const todayStr = referenceDateStr || new Date().toISOString().split('T')[0]
  const todayTime = new Date(todayStr).getTime()

  // System context for automated reminder scheduler
  const systemContext: UserContext = caller || {
    userId: 'usr-system-reminder',
    loginId: 'SYSTEM-SCHEDULER',
    role: 'ADMIN',
    branchId: null,
  }

  // Scan all dues across all students in demo/prisma store
  // In demo mode, we can fetch all dues from fee.service
  const allDues: FeeDueRecord[] = demoFeeDues

  let sentReminders = 0
  let skippedPaidOrWaived = 0
  let skippedPaused = 0
  let flaggedOverdue14Days = 0
  const remindersSent: ReminderJobResult['remindersSent'] = []

  for (const due of allDues) {
    // 1. Skip fully paid or waived dues
    if (due.status === 'PAID' || due.status === 'WAIVED') {
      skippedPaidOrWaived++
      continue
    }

    const remainingPaise = due.amountPaise - (due.paidPaise || 0)
    if (remainingPaise <= 0) {
      skippedPaidOrWaived++
      continue
    }

    // 2. Skip dues where manager paused reminders
    if (due.remindersPausedUntil && due.remindersPausedUntil > todayStr) {
      skippedPaused++
      continue
    }

    // 3. Calculate date difference in days (positive = overdue, negative = before due date)
    const dueTime = new Date(due.dueDate).getTime()
    const diffDays = Math.round((todayTime - dueTime) / (1000 * 60 * 60 * 24))

    let milestone: ReminderMilestone | null = null

    if (diffDays === -3) {
      milestone = 'T_MINUS_3'
    } else if (diffDays === 0) {
      milestone = 'T_ZERO'
    } else if (diffDays === 3) {
      milestone = 'T_PLUS_3'
    } else if (diffDays === 7) {
      milestone = 'T_PLUS_7'
    } else if (diffDays === 14) {
      milestone = 'T_PLUS_14'
    } else if (diffDays > 14) {
      // Past 14 days: stop sending reminders and flag for manual manager follow-up (WORKFLOWS.md § 5)
      flaggedForManagerDues.add(due.id)
      flaggedOverdue14Days++
      continue
    }

    if (!milestone) {
      // Not a milestone day
      continue
    }

    // 4. Idempotency check: don't send the same milestone twice for this due
    const milestoneKey = `${due.id}_${milestone}`
    if (sentMilestones.has(milestoneKey)) {
      continue
    }

    // 5. Look up student & contact
    let student
    try {
      student = await getStudentById(systemContext, due.studentId)
    } catch {
      continue
    }

    const contact = await getStudentContactForAlert(due.studentId)
    if (!contact || !contact.whatsappNumber) {
      continue
    }

    // 6. Generate or retrieve online payment link for this due
    let paymentLinkUrl = 'https://pay.cpa-cricket.in/pay/demo'
    try {
      const link = await createPaymentLink(systemContext, {
        studentId: due.studentId,
        dueId: due.id,
        amountPaise: remainingPaise,
        description: `Tuition Fee Due (${due.label})`,
      })
      paymentLinkUrl = link.shortUrl
    } catch {}

    const amountFormatted = (remainingPaise / 100).toLocaleString('en-IN')

    // 7. Queue WhatsApp reminder message
    await queueOutboundMessage(systemContext, {
      branchId: due.branchId,
      guardianId: contact.guardianId,
      studentId: due.studentId,
      recipientPhone: contact.whatsappNumber,
      templateName: 'fee_reminder',
      variables: {
        amount: amountFormatted,
        cadetName: student.name,
        dueDate: due.dueDate,
        paymentLink: paymentLinkUrl,
      },
      relatedType: 'FEE_DUE',
      relatedId: due.id,
    })

    sentMilestones.add(milestoneKey)
    sentReminders++

    remindersSent.push({
      dueId: due.id,
      studentId: due.studentId,
      studentName: student.name,
      milestone,
      amount: amountFormatted,
      paymentLink: paymentLinkUrl,
    })
  }

  await logAudit({
    actorId: systemContext.userId,
    branchId: 'branch-kkp',
    action: 'fee.reminders_scheduled',
    entityType: 'Scheduler',
    entityId: `sched-${todayStr}`,
    after: {
      date: todayStr,
      scannedDues: allDues.length,
      sentReminders,
      flaggedOverdue14Days,
    },
    reason: `Fee reminder scheduler executed for ${todayStr}. Sent ${sentReminders} reminders, ${flaggedOverdue14Days} dues flagged over 14 days overdue.`,
  })

  return {
    date: todayStr,
    scannedDues: allDues.length,
    sentReminders,
    skippedPaidOrWaived,
    skippedPaused,
    flaggedOverdue14Days,
    remindersSent,
  }
}

/**
 * Checks if a fee due is flagged for manual manager follow-up (> 14 days overdue).
 */
export function isDueFlaggedForManager(dueId: string): boolean {
  return flaggedForManagerDues.has(dueId)
}

/**
 * Clears sent milestones (useful for testing).
 */
export function resetReminderMilestonesForTest(): void {
  sentMilestones.clear()
  flaggedForManagerDues.clear()
}
