export type NotificationSeverity = 'INFO' | 'WARNING' | 'CRITICAL'

export type NotificationAudience = 'BRANCH_MANAGERS' | 'ADMINS' | 'BRANCH_STAFF' | 'ALL_MANAGERS'

export interface EventDefinition {
  type: string
  title: string
  formatBody: (payload: Record<string, any>) => string
  severity: NotificationSeverity
  audience: NotificationAudience
  isCritical: boolean
}

export const NOTIFICATION_EVENT_CATALOGUE: Record<string, EventDefinition> = {
  NEW_ENQUIRY_UNASSIGNED: {
    type: 'NEW_ENQUIRY_UNASSIGNED',
    title: 'New Unassigned Website Enquiry',
    formatBody: (payload) =>
      `A new prospective enquiry for ${payload.childName || 'a student'} was submitted via the website form and needs an owner.`,
    severity: 'INFO',
    audience: 'BRANCH_MANAGERS',
    isCritical: false,
  },
  FOLLOWUP_OVERDUE: {
    type: 'FOLLOWUP_OVERDUE',
    title: 'Follow-up Task Overdue',
    formatBody: (payload) =>
      `Follow-up task for enquiry ${payload.enquiryId} is past due date (${payload.dueDate || 'today'}).`,
    severity: 'WARNING',
    audience: 'BRANCH_MANAGERS',
    isCritical: false,
  },
  TRIAL_UPCOMING_TODAY: {
    type: 'TRIAL_UPCOMING_TODAY',
    title: 'Trial Session Scheduled Today',
    formatBody: (payload) =>
      `Guest cadet ${payload.childName || 'student'} is scheduled for a trial in batch ${payload.batchName || 'session'} today.`,
    severity: 'INFO',
    audience: 'BRANCH_STAFF',
    isCritical: false,
  },
  OWNER_DEACTIVATED: {
    type: 'OWNER_DEACTIVATED',
    title: 'Enquiry Needs Owner (Staff Inactive)',
    formatBody: (payload) =>
      `Enquiry ${payload.enquiryId} was assigned to an inactive staff member and needs reassignment.`,
    severity: 'WARNING',
    audience: 'BRANCH_MANAGERS',
    isCritical: false,
  },
  UNCLOSED_DAY: {
    type: 'UNCLOSED_DAY',
    title: 'Unclosed Business Day',
    formatBody: (payload) =>
      `Daily register for ${payload.businessDate} remains unclosed. Please review cash and submit daily close.`,
    severity: 'WARNING',
    audience: 'BRANCH_MANAGERS',
    isCritical: false,
  },
  UNMATCHED_PAYMENT: {
    type: 'UNMATCHED_PAYMENT',
    title: 'Unmatched Online Payment Received',
    formatBody: (payload) =>
      `An online payment of ₹${((payload.amountPaise || 0) / 100).toFixed(2)} could not be auto-matched to a cadet.`,
    severity: 'WARNING',
    audience: 'ADMINS',
    isCritical: false,
  },
  RECON_MISMATCH: {
    type: 'RECON_MISMATCH',
    title: 'Reconciliation Discrepancy Detected',
    formatBody: (payload) =>
      `Nightly financial reconciliation found a mismatch of ₹${((payload.diffPaise || 0) / 100).toFixed(2)} for branch ${payload.branchId || 'system'}.`,
    severity: 'CRITICAL',
    audience: 'ADMINS',
    isCritical: true, // Non-mutable; cannot be muted or dismissed without action
  },
}

