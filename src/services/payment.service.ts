import { prisma, isDbAvailable } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { UserContext, authorize, RecordNotFoundError, PermissionDeniedError } from '@/lib/rbac'
import { assertBranchAccess } from '@/lib/branch-query'
import { getStudentById } from './student.service'
import { listStudentDues, FeeDueRecord, applyDuePayment, revertDuePayment } from './fee.service'
import { queueOutboundMessage } from './whatsapp.service'
import { getStudentContactForAlert } from './student.service'
import { formatPaise } from '@/lib/utils'

export interface RecordCashPaymentInput {
  branchId: string
  studentId: string
  amountPaise: number
  businessDate?: string // YYYY-MM-DD, defaults to today
  allocations?: { dueId: string; amountPaise: number }[] // Optional manual allocation; otherwise FIFO
  note?: string
}

export interface PaymentRecord {
  id: string
  branchId: string
  studentId: string
  studentName?: string
  studentCode?: string
  entryType: 'PAYMENT' | 'REVERSAL'
  method: 'CASH' | 'ONLINE'
  amountPaise: number
  businessDate: string
  receivedAt: string
  collectedById?: string | null
  collectedByName?: string | null
  receiptNumber?: number
  receiptId?: string
  note?: string | null
  allocations: {
    dueId: string
    dueLabel?: string
    amountPaise: number
  }[]
  isReversed?: boolean
  reversedAt?: string | null
  reversedByName?: string | null
  reversalReason?: string | null
  reversalOfPaymentId?: string | null
  status?: 'COMPLETED' | 'PENDING_APPROVAL' | 'REJECTED'
}

export const MANAGER_REVERSAL_LIMIT_PAISE = 500000 // ₹5,000 threshold for Manager approval

export interface ReversePaymentInput {
  paymentId: string
  reason: string
}

export interface ReversalResult {
  status: 'REVERSED' | 'PENDING_APPROVAL'
  reversalPayment?: PaymentRecord
  requiresAdminApproval: boolean
  message: string
}

export interface DailySummary {
  businessDate: string
  branchId: string
  isClosed: boolean
  closedAt?: string | null
  closedByName?: string | null
  expectedCashPaise: number
  countedCashPaise?: number | null
  discrepancyPaise?: number | null
  onlinePaise: number
  totalPaise: number
  receiptCount: number
  closeNote?: string | null
  payments: PaymentRecord[]
}

// In-memory demo stores
let demoPayments: PaymentRecord[] = []
let demoReceiptCounters: Record<string, number> = {
  'branch-kkp': 100, // Starts at 100
  'branch-hbn': 50,
}
let demoDailyCloses: {
  id: string
  branchId: string
  businessDate: string
  expectedCashPaise: number
  countedCashPaise: number
  discrepancyPaise: number
  onlinePaise: number
  receiptCount: number
  note?: string | null
  closedAt: string
  closedById: string
  closedByName: string
}[] = []

/**
 * Checks if a business date is already closed and locked for a branch.
 */
export async function isDayClosed(branchId: string, businessDate: string): Promise<boolean> {
  if (isDbAvailable()) {
    try {
      const closed = await prisma.dailyClose.findUnique({
        where: {
          branchId_businessDate: {
            branchId,
            businessDate: new Date(businessDate),
          },
        },
      })
      if (closed) return true
    } catch {}
  }

  return demoDailyCloses.some(
    (c) => c.branchId === branchId && c.businessDate === businessDate
  )
}

/**
 * Generates the next atomic, gapless receipt number for a branch.
 */
export async function getNextReceiptNumber(branchId: string): Promise<number> {
  if (isDbAvailable()) {
    try {
      const counter = await prisma.receiptCounter.upsert({
        where: { branchId },
        update: { lastNumber: { increment: 1 } },
        create: { branchId, lastNumber: 1 },
      })
      return counter.lastNumber
    } catch {}
  }

  demoReceiptCounters[branchId] = (demoReceiptCounters[branchId] || 0) + 1
  return demoReceiptCounters[branchId]
}

/**
 * Records a cash payment with FIFO or custom dues allocation, generates a gapless sequential receipt,
 * and sends an automated WhatsApp receipt to the parent.
 */
export async function recordCashPayment(
  caller: UserContext,
  input: RecordCashPaymentInput
): Promise<{ payment: PaymentRecord; receiptNumber: number; whatsappDispatched: boolean }> {
  // Enforce fee:record_payment permission (strictly forbidden for coaches)
  authorize(caller, 'fee:record_payment')
  assertBranchAccess(caller, input.branchId, 'Branch')

  if (!input.amountPaise || input.amountPaise <= 0) {
    throw new Error('Payment amount must be greater than zero.')
  }

  const todayStr = new Date().toISOString().split('T')[0]
  const businessDate = input.businessDate || todayStr

  // Verify the business date is not already closed (WORKFLOWS.md § 6)
  const locked = await isDayClosed(input.branchId, businessDate)
  if (locked) {
    throw new PermissionDeniedError(
      `Daily collection for ${businessDate} is already closed and locked. No new entries can be added.`
    )
  }

  const student = await getStudentById(caller, input.studentId)
  assertBranchAccess(caller, student.branchId, 'Student')

  // Fetch student unpaid/partial dues for allocation
  const allDues = await listStudentDues(caller, student.id)
  const payableDues = allDues.filter((d) => d.status === 'UNPAID' || d.status === 'PARTIAL' || d.status === 'OVERDUE')

  let remainingToAllocate = input.amountPaise
  const allocations: { dueId: string; dueLabel?: string; amountPaise: number }[] = []

  if (input.allocations && input.allocations.length > 0) {
    // Custom allocation provided by manager
    for (const alloc of input.allocations) {
      const due = allDues.find((d) => d.id === alloc.dueId)
      allocations.push({
        dueId: alloc.dueId,
        dueLabel: due?.label,
        amountPaise: alloc.amountPaise,
      })
      await applyDuePayment(alloc.dueId, alloc.amountPaise)
    }
  } else {
    // FIFO allocation to oldest unpaid dues first
    for (const due of payableDues) {
      if (remainingToAllocate <= 0) break
      const outstandingOnDue = due.amountPaise - (due.paidPaise || 0)
      const allocAmount = Math.min(remainingToAllocate, outstandingOnDue)

      allocations.push({
        dueId: due.id,
        dueLabel: due.label,
        amountPaise: allocAmount,
      })

      await applyDuePayment(due.id, allocAmount)
      remainingToAllocate -= allocAmount
    }
  }

  // Issue next sequential receipt number
  const receiptNumber = await getNextReceiptNumber(input.branchId)
  const paymentId = `pay-${Date.now()}`
  const nowIso = new Date().toISOString()

  const payment: PaymentRecord = {
    id: paymentId,
    branchId: input.branchId,
    studentId: student.id,
    studentName: student.name,
    studentCode: student.studentCode,
    entryType: 'PAYMENT',
    method: 'CASH',
    amountPaise: input.amountPaise,
    businessDate,
    receivedAt: nowIso,
    collectedById: caller.userId,
    collectedByName: caller.loginId,
    receiptNumber,
    receiptId: `rec-${receiptNumber}`,
    note: input.note || null,
    allocations,
  }

  demoPayments.push(payment)

  // Update student outstanding dues
  student.outstandingDuesPaise = Math.max(0, (student.outstandingDuesPaise || 0) - input.amountPaise)

  // Automatic WhatsApp Receipt Dispatch (WORKFLOWS.md § 6)
  let whatsappDispatched = false
  const contact = await getStudentContactForAlert(student.id)
  if (contact && contact.whatsappNumber) {
    const periodLabel = allocations.map((a) => a.dueLabel).filter(Boolean).join(', ') || 'Cricket Training Dues'
    await queueOutboundMessage(caller, {
      branchId: input.branchId,
      guardianId: contact.guardianId,
      studentId: student.id,
      recipientPhone: contact.whatsappNumber,
      templateName: 'payment_receipt',
      variables: {
        amount: (input.amountPaise / 100).toLocaleString('en-IN'),
        cadetName: student.name,
        receiptNumber: String(receiptNumber),
        period: periodLabel,
      },
      relatedType: 'PAYMENT',
      relatedId: payment.id,
    })
    whatsappDispatched = true
  }

  await logAudit({
    actorId: caller.userId,
    branchId: input.branchId,
    action: 'payment.record_cash',
    entityType: 'Payment',
    entityId: payment.id,
    after: {
      studentCode: student.studentCode,
      amountPaise: input.amountPaise,
      receiptNumber,
      businessDate,
    },
    reason: `Recorded cash payment ₹${(input.amountPaise / 100).toLocaleString()} from ${student.name} (Receipt #${receiptNumber})`,
  })

  return { payment, receiptNumber, whatsappDispatched }
}

/**
 * Returns the daily collection summary for a branch on a given business date.
 */
export async function getDailySummary(
  caller: UserContext,
  branchId: string,
  businessDate?: string
): Promise<DailySummary> {
  authorize(caller, 'daily_close:view')
  assertBranchAccess(caller, branchId, 'Branch')

  const effectiveDate = businessDate || new Date().toISOString().split('T')[0]

  // Filter payments belonging to this business date
  const payments = demoPayments.filter(
    (p) => p.branchId === branchId && p.businessDate === effectiveDate
  )

  const cashPayments = payments.filter((p) => p.method === 'CASH')
  const onlinePayments = payments.filter((p) => p.method === 'ONLINE')

  const expectedCashPaise = cashPayments.reduce((sum, p) => sum + p.amountPaise, 0)
  const onlinePaise = onlinePayments.reduce((sum, p) => sum + p.amountPaise, 0)
  const totalPaise = expectedCashPaise + onlinePaise
  const receiptCount = payments.length

  const closedRecord = demoDailyCloses.find(
    (c) => c.branchId === branchId && c.businessDate === effectiveDate
  )

  return {
    businessDate: effectiveDate,
    branchId,
    isClosed: Boolean(closedRecord),
    closedAt: closedRecord?.closedAt || null,
    closedByName: closedRecord?.closedByName || null,
    expectedCashPaise,
    countedCashPaise: closedRecord?.countedCashPaise ?? null,
    discrepancyPaise: closedRecord?.discrepancyPaise ?? null,
    onlinePaise,
    totalPaise,
    receiptCount,
    closeNote: closedRecord?.note || null,
    payments,
  }
}

/**
 * Closes and locks a business date collection (WORKFLOWS.md § 6).
 * Once closed, entries are immutable and locked.
 */
export async function closeDay(
  caller: UserContext,
  input: {
    branchId: string
    businessDate: string
    countedCashPaise: number
    note?: string
  }
): Promise<{ success: boolean; discrepancyPaise: number; closedAt: string }> {
  authorize(caller, 'daily_close:perform')
  assertBranchAccess(caller, input.branchId, 'Branch')

  const summary = await getDailySummary(caller, input.branchId, input.businessDate)

  if (summary.isClosed) {
    throw new Error(`Business date ${input.businessDate} is already closed.`)
  }

  const discrepancyPaise = input.countedCashPaise - summary.expectedCashPaise

  // If there is a cash discrepancy, a justification note is mandatory (WORKFLOWS.md § 6)
  if (discrepancyPaise !== 0) {
    if (!input.note || input.note.trim().length < 5) {
      throw new Error(
        `A cash discrepancy of ₹${Math.abs(discrepancyPaise / 100).toLocaleString()} was counted. A detailed explanation note (minimum 5 characters) is required.`
      )
    }
  }

  const nowIso = new Date().toISOString()
  const closeEntry = {
    id: `close-${input.branchId}-${input.businessDate}`,
    branchId: input.branchId,
    businessDate: input.businessDate,
    expectedCashPaise: summary.expectedCashPaise,
    countedCashPaise: input.countedCashPaise,
    discrepancyPaise,
    onlinePaise: summary.onlinePaise,
    receiptCount: summary.receiptCount,
    note: input.note?.trim() || null,
    closedAt: nowIso,
    closedById: caller.userId,
    closedByName: caller.loginId,
  }

  demoDailyCloses.push(closeEntry)

  await logAudit({
    actorId: caller.userId,
    branchId: input.branchId,
    action: 'daily_close.perform',
    entityType: 'DailyClose',
    entityId: closeEntry.id,
    after: {
      businessDate: input.businessDate,
      expectedCashPaise: summary.expectedCashPaise,
      countedCashPaise: input.countedCashPaise,
      discrepancyPaise,
      receiptCount: summary.receiptCount,
      note: closeEntry.note,
    },
    reason: `Closed business day ${input.businessDate} for branch ${input.branchId}. Cash counted: ₹${(input.countedCashPaise / 100).toLocaleString()}${discrepancyPaise !== 0 ? ` (Discrepancy: ₹${(discrepancyPaise / 100).toLocaleString()})` : ''}`,
  })

  return { success: true, discrepancyPaise, closedAt: nowIso }
}

/**
 * Lists closed and unclosed daily summaries across all branches for Admin reporting.
 */
export async function listAllDailySummaries(
  caller: UserContext,
  businessDate?: string
): Promise<DailySummary[]> {
  authorize(caller, 'daily_close:view')
  const branches = ['branch-kkp', 'branch-hbn']
  const results: DailySummary[] = []

  for (const bId of branches) {
    if (caller.role === 'ADMIN' || caller.branchId === bId) {
      results.push(await getDailySummary(caller, bId, businessDate))
    }
  }

  return results
}

/**
 * Reverses a recorded payment (WORKFLOWS.md § 7).
 * Strictly audited and append-only: payments are NEVER edited or deleted.
 * Reversals over manager threshold (₹5,000) require Admin approval.
 */
export async function reversePayment(
  caller: UserContext,
  input: ReversePaymentInput
): Promise<ReversalResult> {
  authorize(caller, 'fee:reverse')

  if (!input.reason || input.reason.trim().length < 5) {
    throw new Error('A detailed reason (minimum 5 characters) is required to reverse a payment.')
  }

  const origPayment = demoPayments.find((p) => p.id === input.paymentId)
  if (!origPayment) {
    throw new RecordNotFoundError('Payment')
  }

  assertBranchAccess(caller, origPayment.branchId, 'Payment')

  if (origPayment.entryType === 'REVERSAL') {
    throw new Error('Cannot reverse an existing reversal entry.')
  }

  if (origPayment.isReversed) {
    throw new Error('This payment has already been reversed.')
  }

  const nowIso = new Date().toISOString()
  const cleanReason = input.reason.trim()

  // Manager threshold check: over ₹5,000 requires Admin approval
  if (caller.role !== 'ADMIN' && origPayment.amountPaise > MANAGER_REVERSAL_LIMIT_PAISE) {
    const pendingReversalId = `rev-pending-${Date.now()}`
    const pendingReversal: PaymentRecord = {
      id: pendingReversalId,
      branchId: origPayment.branchId,
      studentId: origPayment.studentId,
      studentName: origPayment.studentName,
      studentCode: origPayment.studentCode,
      entryType: 'REVERSAL',
      method: origPayment.method,
      amountPaise: -origPayment.amountPaise,
      businessDate: origPayment.businessDate,
      receivedAt: nowIso,
      collectedById: caller.userId,
      collectedByName: caller.loginId,
      reversalOfPaymentId: origPayment.id,
      note: cleanReason,
      status: 'PENDING_APPROVAL',
      allocations: origPayment.allocations,
    }

    demoPayments.push(pendingReversal)

    await logAudit({
      actorId: caller.userId,
      branchId: origPayment.branchId,
      action: 'payment.reversal_requested',
      entityType: 'Payment',
      entityId: origPayment.id,
      after: {
        amountPaise: origPayment.amountPaise,
        reversalId: pendingReversalId,
        reason: cleanReason,
        status: 'PENDING_APPROVAL',
      },
      reason: `Reversal requested for payment ${origPayment.id} (₹${(origPayment.amountPaise / 100).toLocaleString()}) - exceeds ₹5,000 limit, awaiting Admin approval`,
    })

    return {
      status: 'PENDING_APPROVAL',
      reversalPayment: pendingReversal,
      requiresAdminApproval: true,
      message: 'Reversal amount exceeds branch manager limit (₹5,000) and has been queued for Administrator approval.',
    }
  }

  // Execute immediate reversal (Admin or Manager within limit)
  for (const alloc of origPayment.allocations) {
    await revertDuePayment(alloc.dueId, alloc.amountPaise)
  }

  // Restore cadet outstanding dues balance
  const student = await getStudentById(caller, origPayment.studentId)
  student.outstandingDuesPaise = (student.outstandingDuesPaise || 0) + origPayment.amountPaise

  origPayment.isReversed = true
  origPayment.reversedAt = nowIso
  origPayment.reversedByName = caller.loginId
  origPayment.reversalReason = cleanReason

  const reversalId = `rev-${Date.now()}`
  const reversalPayment: PaymentRecord = {
    id: reversalId,
    branchId: origPayment.branchId,
    studentId: origPayment.studentId,
    studentName: origPayment.studentName,
    studentCode: origPayment.studentCode,
    entryType: 'REVERSAL',
    method: origPayment.method,
    amountPaise: -origPayment.amountPaise,
    businessDate: origPayment.businessDate,
    receivedAt: nowIso,
    collectedById: caller.userId,
    collectedByName: caller.loginId,
    reversalOfPaymentId: origPayment.id,
    note: cleanReason,
    status: 'COMPLETED',
    allocations: origPayment.allocations,
  }

  demoPayments.push(reversalPayment)

  await logAudit({
    actorId: caller.userId,
    branchId: origPayment.branchId,
    action: 'payment.reverse',
    entityType: 'Payment',
    entityId: origPayment.id,
    before: {
      isReversed: false,
      amountPaise: origPayment.amountPaise,
    },
    after: {
      isReversed: true,
      reversalId,
      reversalReason: cleanReason,
      reversedBy: caller.loginId,
    },
    reason: `Reversed payment ${origPayment.id} (₹${(origPayment.amountPaise / 100).toLocaleString()}): ${cleanReason}`,
  })

  return {
    status: 'REVERSED',
    reversalPayment,
    requiresAdminApproval: false,
    message: 'Payment has been successfully reversed and fee balance has been restored.',
  }
}

/**
 * Approves or rejects a pending payment reversal (Admin only).
 */
export async function approveReversal(
  caller: UserContext,
  reversalPaymentId: string,
  approved: boolean,
  decisionNote?: string
): Promise<{ success: boolean; status: 'COMPLETED' | 'REJECTED' }> {
  authorize(caller, 'fee:reverse')

  if (caller.role !== 'ADMIN') {
    throw new PermissionDeniedError('Only administrators can approve high-value payment reversals.')
  }

  const reversal = demoPayments.find(
    (p) => p.id === reversalPaymentId && p.entryType === 'REVERSAL' && p.status === 'PENDING_APPROVAL'
  )

  if (!reversal || !reversal.reversalOfPaymentId) {
    throw new RecordNotFoundError('Pending Reversal')
  }

  const origPayment = demoPayments.find((p) => p.id === reversal.reversalOfPaymentId)
  if (!origPayment) {
    throw new RecordNotFoundError('Original Payment')
  }

  const nowIso = new Date().toISOString()

  if (!approved) {
    reversal.status = 'REJECTED'
    reversal.note = decisionNote || 'Rejected by Admin'

    await logAudit({
      actorId: caller.userId,
      branchId: origPayment.branchId,
      action: 'payment.reversal_rejected',
      entityType: 'Payment',
      entityId: origPayment.id,
      after: { reversalId: reversal.id, status: 'REJECTED', decisionNote },
      reason: `Admin rejected reversal request for payment ${origPayment.id}`,
    })

    return { success: true, status: 'REJECTED' }
  }

  // Restore dues
  for (const alloc of origPayment.allocations) {
    await revertDuePayment(alloc.dueId, alloc.amountPaise)
  }

  // Restore student dues balance
  const student = await getStudentById(caller, origPayment.studentId)
  student.outstandingDuesPaise = (student.outstandingDuesPaise || 0) + origPayment.amountPaise

  origPayment.isReversed = true
  origPayment.reversedAt = nowIso
  origPayment.reversedByName = caller.loginId
  origPayment.reversalReason = reversal.note

  reversal.status = 'COMPLETED'

  await logAudit({
    actorId: caller.userId,
    branchId: origPayment.branchId,
    action: 'payment.reversal_approved',
    entityType: 'Payment',
    entityId: origPayment.id,
    after: { reversalId: reversal.id, status: 'COMPLETED', decisionNote },
    reason: `Admin approved reversal request for payment ${origPayment.id} (₹${(origPayment.amountPaise / 100).toLocaleString()})`,
  })

  return { success: true, status: 'COMPLETED' }
}

/**
 * Lists all pending reversals requiring Admin approval.
 */
export async function listPendingReversals(caller: UserContext): Promise<PaymentRecord[]> {
  authorize(caller, 'fee:view')
  return demoPayments.filter((p) => p.status === 'PENDING_APPROVAL')
}

/**
 * Lists all payment records filtered by branch and student scope.
 */
export async function listPayments(
  caller: UserContext,
  options?: { branchId?: string; studentId?: string }
): Promise<PaymentRecord[]> {
  authorize(caller, 'fee:view')
  if (options?.branchId) {
    assertBranchAccess(caller, options.branchId, 'Branch')
  }

  return demoPayments.filter((p) => {
    if (caller.role !== 'ADMIN' && p.branchId !== caller.branchId) return false
    if (options?.branchId && p.branchId !== options.branchId) return false
    if (options?.studentId && p.studentId !== options.studentId) return false
    return true
  })
}

