/**
 * CPA Cricket Academy CRM — Phase 2 Metrics Layer Definitions
 * 
 * Hard Rule 9: One definition per metric.
 * All role dashboards, reports, and aggregates derive exclusively from these formulas.
 * Money is strictly integer paise (1 INR = 100 paise).
 */

export interface MetricDailyBranchRecord {
  id: string
  branchId: string
  businessDate: string // YYYY-MM-DD
  collectionsCashPaise: number
  collectionsOnlinePaise: number
  reversalsPaise: number
  netCollectionsPaise?: number // Derived: (Cash + Online) - Reversals
  outstandingPaise: number
  overduePaise: number
  activeStudents: number
  activeStudentsCount?: number // Alias
  attendanceSessionsMarked: number
  attendancePresent: number
  attendanceAbsent: number
  enquiriesCreated: number
  enquiriesContacted: number
  enquiriesConverted: number
  enquiriesLost: number
  trialsAttended: number
  computedAt: string
  sourceVersion: number
}

/**
 * Gross Collections: Cash + Online before subtracting reversals.
 */
export function calculateGrossCollectionsPaise(metric: {
  collectionsCashPaise: number
  collectionsOnlinePaise: number
}): number {
  return (metric.collectionsCashPaise || 0) + (metric.collectionsOnlinePaise || 0)
}

/**
 * Net Collections: Gross collections minus reversals.
 * Reconciled against Phase 1 Collections Report.
 */
export function calculateNetCollectionsPaise(metric: {
  collectionsCashPaise: number
  collectionsOnlinePaise: number
  reversalsPaise: number
}): number {
  return calculateGrossCollectionsPaise(metric) - (metric.reversalsPaise || 0)
}

/**
 * Attendance Rate: Percentage of present marks over total marks recorded.
 */
export function calculateAttendanceRate(metric: {
  attendancePresent: number
  attendanceAbsent: number
}): number {
  const total = (metric.attendancePresent || 0) + (metric.attendanceAbsent || 0)
  if (total === 0) return 100
  return Math.round(((metric.attendancePresent || 0) / total) * 1000) / 10
}

/**
 * Enquiry Conversion Rate: Percentage of created enquiries that reached CONVERTED stage.
 */
export function calculateConversionRate(metric: {
  enquiriesCreated: number
  enquiriesConverted: number
}): number {
  if (!metric.enquiriesCreated || metric.enquiriesCreated === 0) return 0
  return Math.round(((metric.enquiriesConverted || 0) / metric.enquiriesCreated) * 1000) / 10
}

/**
 * Total Outstanding: Current unpaid + Overdue unpaid dues.
 */
export function calculateTotalOutstandingPaise(metric: {
  outstandingPaise: number
  overduePaise: number
}): number {
  return (metric.outstandingPaise || 0) + (metric.overduePaise || 0)
}

export interface MetricDefinition {
  id: string
  name: string
  unit: 'PAISE' | 'PERCENTAGE' | 'COUNT'
  formula: string
  description: string
}

export const METRIC_DEFINITIONS: MetricDefinition[] = [
  {
    id: 'GROSS_COLLECTIONS',
    name: 'Gross Collections',
    unit: 'PAISE',
    formula: 'Cash Collections + Online Collections',
    description: 'Total fee payments received before subtracting any approved reversals.',
  },
  {
    id: 'REVERSALS',
    name: 'Reversals',
    unit: 'PAISE',
    formula: 'Sum of approved payment reversals',
    description: 'Total refunds/reversals approved and executed on this business date.',
  },
  {
    id: 'NET_COLLECTIONS',
    name: 'Net Collections',
    unit: 'PAISE',
    formula: '(Cash Collections + Online Collections) - Reversals',
    description: 'Net cash and bank intake for the business date (Hard Rule 9).',
  },
  {
    id: 'TOTAL_OUTSTANDING',
    name: 'Total Outstanding Dues',
    unit: 'PAISE',
    formula: 'Current Unpaid Dues + Overdue Dues',
    description: 'Total outstanding student fee dues across all aging buckets.',
  },
  {
    id: 'ACTIVE_STUDENTS',
    name: 'Active Students',
    unit: 'COUNT',
    formula: 'Count of students with status ACTIVE',
    description: 'Enrolled students currently active in academy programs.',
  },
  {
    id: 'ATTENDANCE_RATE',
    name: 'Attendance Rate',
    unit: 'PERCENTAGE',
    formula: '(Present Marks / Total Marks Recorded) * 100',
    description: 'Overall player attendance percentage for sessions marked on this date.',
  },
  {
    id: 'ENQUIRY_CONVERSION_RATE',
    name: 'Enquiry Conversion Rate',
    unit: 'PERCENTAGE',
    formula: '(Converted Enquiries / Created Enquiries) * 100',
    description: 'Conversion efficacy from pipeline entry to active academy enrollment.',
  },
  {
    id: 'TRIALS_ATTENDED',
    name: 'Trials Attended',
    unit: 'COUNT',
    formula: 'Count of trial sessions marked ATTENDED',
    description: 'Prospective players who attended their booked trial session.',
  },
]

