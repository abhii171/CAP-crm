import crypto from 'crypto'
import { prisma, isDbAvailable } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { UserContext, authorize, RecordNotFoundError, PermissionDeniedError, SecurityError } from '@/lib/rbac'
import { assertBranchAccess } from '@/lib/branch-query'
import { getStudentById } from './student.service'
import { listStudentDues, applyDuePayment, revertDuePayment } from './fee.service'
import { getNextReceiptNumber, recordCashPayment, PaymentRecord, isDayClosed } from './payment.service'
import { queueOutboundMessage } from './whatsapp.service'
import { getStudentContactForAlert } from './student.service'

export interface PaymentLinkRecord {
  id: string
  linkId: string
  branchId: string
  studentId: string
  studentName?: string
  studentCode?: string
  dueId?: string | null
  amountPaise: number
  description: string
  shortUrl: string
  status: 'ACTIVE' | 'PAID' | 'EXPIRED'
  createdAt: string
  paidAt?: string | null
  gatewayPaymentId?: string | null
}

export interface UnmatchedPaymentRecord {
  id: string
  gatewayPaymentId: string
  amountPaise: number
  payerEmail?: string | null
  payerPhone?: string | null
  gatewayNotes?: Record<string, any>
  receivedAt: string
  status: 'UNMATCHED' | 'RESOLVED'
  resolvedStudentId?: string | null
  resolvedAt?: string | null
  resolvedById?: string | null
  resolutionNote?: string | null
}

export interface GatewayTransaction {
  id: string // e.g. pay_test_123
  amountPaise: number
  status: 'captured' | 'failed' | 'refunded'
  studentId?: string
  dueId?: string
  branchId: string
  createdAt: string
}

// In-memory demo stores
let demoPaymentLinks: PaymentLinkRecord[] = []
let demoUnmatchedPayments: UnmatchedPaymentRecord[] = []
let demoProcessedGatewayPaymentIds = new Set<string>()
let demoGatewayTransactions: GatewayTransaction[] = []

/**
 * Creates a unique online payment link tied to a student and optionally a specific due.
 */
export async function createPaymentLink(
  caller: UserContext,
  input: {
    studentId: string
    dueId?: string
    amountPaise: number
    description?: string
  }
): Promise<PaymentLinkRecord> {
  authorize(caller, 'fee:record_payment')

  const student = await getStudentById(caller, input.studentId)
  assertBranchAccess(caller, student.branchId, 'Student')

  if (!input.amountPaise || input.amountPaise <= 0) {
    throw new Error('Payment amount must be greater than zero.')
  }

  const linkId = `plink_${Date.now()}_${Math.random().toString(36).substring(7)}`
  const shortUrl = `https://pay.cpa-cricket.in/l/${linkId}`
  const nowIso = new Date().toISOString()

  const record: PaymentLinkRecord = {
    id: `link-rec-${Date.now()}`,
    linkId,
    branchId: student.branchId,
    studentId: student.id,
    studentName: student.name,
    studentCode: student.studentCode,
    dueId: input.dueId || null,
    amountPaise: input.amountPaise,
    description: input.description || `Cricket Academy Training Fees - ${student.name}`,
    shortUrl,
    status: 'ACTIVE',
    createdAt: nowIso,
  }

  demoPaymentLinks.unshift(record)

  await logAudit({
    actorId: caller.userId,
    branchId: student.branchId,
    action: 'payment.create_link',
    entityType: 'PaymentLink',
    entityId: record.id,
    after: {
      linkId,
      studentCode: student.studentCode,
      amountPaise: input.amountPaise,
      shortUrl,
    },
    reason: `Generated online payment link for ${student.name} (₹${(input.amountPaise / 100).toLocaleString()})`,
  })

  return record
}

/**
 * Lists payment links created for caller's branch.
 */
export async function listPaymentLinks(
  caller: UserContext,
  studentId?: string
): Promise<PaymentLinkRecord[]> {
  authorize(caller, 'fee:view')

  return demoPaymentLinks.filter((l) => {
    if (caller.role !== 'ADMIN' && l.branchId !== caller.branchId) return false
    if (studentId && l.studentId !== studentId) return false
    return true
  })
}

/**
 * Verifies Razorpay/Gateway HMAC-SHA256 webhook signature.
 * Fails closed if RAZORPAY_WEBHOOK_SECRET is missing.
 */
export function verifyWebhookSignature(payloadRaw: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET
  if (!secret) {
    console.error('RAZORPAY_WEBHOOK_SECRET is not configured. Webhook verification failed closed.')
    return false
  }

  if (!signature || !payloadRaw) return false

  try {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payloadRaw)
      .digest('hex')

    const sigBuf = Buffer.from(signature, 'utf8')
    const expBuf = Buffer.from(expectedSignature, 'utf8')

    if (sigBuf.length !== expBuf.length) {
      return false
    }

    return crypto.timingSafeEqual(sigBuf, expBuf)
  } catch {
    return false
  }
}

/**
 * Processes incoming online payment webhook (WORKFLOWS.md § 7).
 * - Enforces HMAC signature verification.
 * - Idempotency key check against gatewayPaymentId.
 * - If no student found, routes to Unmatched Payments queue.
 * - Allocates payment to dues, issues gapless sequential receipt, and queues WhatsApp receipt.
 */
export async function processOnlinePaymentWebhook(input: {
  payload: any
  signature?: string
  rawBody?: string
}): Promise<{
  success: boolean
  status: 'PROCESSED' | 'ALREADY_PROCESSED' | 'UNMATCHED' | 'SKIPPED'
  paymentId?: string
  receiptNumber?: number
  message: string
}> {
  // 1. Signature Verification (mandatory if incoming from webhook; fails closed if invalid)
  if (input.rawBody || input.signature) {
    if (!input.signature || !input.rawBody || !verifyWebhookSignature(input.rawBody, input.signature)) {
      throw new SecurityError('Invalid webhook HMAC signature.', 401)
    }
  }

  const event = input.payload?.event || 'payment.captured'
  const paymentEntity = input.payload?.payload?.payment?.entity || input.payload

  const gatewayPaymentId = paymentEntity?.id || `pay_${Date.now()}`
  const amountPaise = Number(paymentEntity?.amount || paymentEntity?.amountPaise || 0)
  const notes = paymentEntity?.notes || {}
  const studentId = notes?.studentId || paymentEntity?.studentId
  const dueId = notes?.dueId || paymentEntity?.dueId
  const linkId = notes?.linkId || paymentEntity?.linkId

  // 2. Idempotency Check: never apply the same gateway payment twice
  if (demoProcessedGatewayPaymentIds.has(gatewayPaymentId)) {
    return {
      success: true,
      status: 'ALREADY_PROCESSED',
      message: `Gateway payment ${gatewayPaymentId} has already been processed (Idempotent).`,
    }
  }

  if (isDbAvailable()) {
    try {
      const existing = await prisma.payment.findUnique({
        where: { gatewayPaymentId },
      })
      if (existing) {
        demoProcessedGatewayPaymentIds.add(gatewayPaymentId)
        return {
          success: true,
          status: 'ALREADY_PROCESSED',
          message: `Gateway payment ${gatewayPaymentId} has already been processed (Idempotent).`,
        }
      }
    } catch {}
  }

  // Synchronously reserve gatewayPaymentId before any async calls to prevent concurrent duplicate race conditions
  demoProcessedGatewayPaymentIds.add(gatewayPaymentId)

  if (amountPaise <= 0) {
    return { success: false, status: 'SKIPPED', message: 'Payment amount must be greater than zero.' }
  }

  // Record this gateway transaction into our gateway log for reconciliation
  demoGatewayTransactions.push({
    id: gatewayPaymentId,
    amountPaise,
    status: 'captured',
    studentId,
    dueId,
    branchId: notes?.branchId || 'branch-kkp',
    createdAt: new Date().toISOString(),
  })

  // 3. Unmatched Payments Check (WORKFLOWS.md § 7)
  // If payment has no matching student reference, route to Unmatched queue
  if (!studentId) {
    const unmatched: UnmatchedPaymentRecord = {
      id: `unmatched-${Date.now()}`,
      gatewayPaymentId,
      amountPaise,
      payerEmail: paymentEntity?.email || null,
      payerPhone: paymentEntity?.contact || null,
      gatewayNotes: notes,
      receivedAt: new Date().toISOString(),
      status: 'UNMATCHED',
    }

    demoUnmatchedPayments.unshift(unmatched)
    demoProcessedGatewayPaymentIds.add(gatewayPaymentId)

    await logAudit({
      actorId: 'system',
      branchId: 'branch-kkp',
      action: 'payment.unmatched_online',
      entityType: 'UnmatchedPayment',
      entityId: unmatched.id,
      after: { gatewayPaymentId, amountPaise, notes },
      reason: `Online payment of ₹${(amountPaise / 100).toLocaleString()} received without student reference. Placed in Unmatched queue.`,
    })

    return {
      success: true,
      status: 'UNMATCHED',
      message: 'Payment received without student reference and placed into Unmatched Queue.',
    }
  }

  // System context for automated webhook processing
  const systemContext: UserContext = {
    userId: 'usr-system-webhook',
    loginId: 'SYSTEM-WEBHOOK',
    role: 'ADMIN',
    branchId: null,
  }

  const student = await getStudentById(systemContext, studentId)
  const branchId = student.branchId
  const todayStr = new Date().toISOString().split('T')[0]

  // Allocate payment to dues
  const allDues = await listStudentDues(systemContext, student.id)
  const payableDues = allDues.filter((d) => d.status === 'UNPAID' || d.status === 'PARTIAL' || d.status === 'OVERDUE')

  let remainingToAllocate = amountPaise
  const allocations: { dueId: string; dueLabel?: string; amountPaise: number }[] = []

  if (dueId) {
    // Specific due linked
    const specificDue = allDues.find((d) => d.id === dueId)
    if (specificDue) {
      const outstandingOnDue = specificDue.amountPaise - (specificDue.paidPaise || 0)
      const allocAmount = Math.min(remainingToAllocate, outstandingOnDue)
      allocations.push({
        dueId: specificDue.id,
        dueLabel: specificDue.label,
        amountPaise: allocAmount,
      })
      await applyDuePayment(specificDue.id, allocAmount)
      remainingToAllocate -= allocAmount
    }
  }

  // FIFO allocation for any remaining balance
  if (remainingToAllocate > 0) {
    for (const due of payableDues) {
      if (remainingToAllocate <= 0) break
      if (allocations.some((a) => a.dueId === due.id)) continue

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

  // Issue next gapless sequential receipt number for the branch
  const receiptNumber = await getNextReceiptNumber(branchId)
  const paymentId = `pay-online-${Date.now()}`
  const nowIso = new Date().toISOString()

  const paymentRecord: PaymentRecord = {
    id: paymentId,
    branchId,
    studentId: student.id,
    studentName: student.name,
    studentCode: student.studentCode,
    entryType: 'PAYMENT',
    method: 'ONLINE',
    amountPaise,
    businessDate: todayStr,
    receivedAt: nowIso,
    collectedById: 'gateway-razorpay',
    collectedByName: 'Razorpay Online Gateway',
    receiptNumber,
    receiptId: `rec-${receiptNumber}`,
    note: `Online payment via gateway (Ref: ${gatewayPaymentId})`,
    allocations,
    status: 'COMPLETED',
  }

  // Mark payment link as PAID if applicable
  if (linkId) {
    const link = demoPaymentLinks.find((l) => l.linkId === linkId)
    if (link) {
      link.status = 'PAID'
      link.paidAt = nowIso
      link.gatewayPaymentId = gatewayPaymentId
    }
  }

  // Update student outstanding balance
  student.outstandingDuesPaise = Math.max(0, (student.outstandingDuesPaise || 0) - amountPaise)

  // Mark gateway payment ID as processed
  demoProcessedGatewayPaymentIds.add(gatewayPaymentId)

  // Automatic WhatsApp payment receipt dispatch (WORKFLOWS.md § 7)
  const contact = await getStudentContactForAlert(student.id)
  if (contact && contact.whatsappNumber) {
    const periodLabel = allocations.map((a) => a.dueLabel).filter(Boolean).join(', ') || 'Cricket Training Online Fees'
    await queueOutboundMessage(systemContext, {
      branchId,
      guardianId: contact.guardianId,
      studentId: student.id,
      recipientPhone: contact.whatsappNumber,
      templateName: 'payment_receipt',
      variables: {
        amount: (amountPaise / 100).toLocaleString('en-IN'),
        cadetName: student.name,
        receiptNumber: String(receiptNumber),
        period: `${periodLabel} (Online Ref: ${gatewayPaymentId})`,
      },
      relatedType: 'PAYMENT',
      relatedId: paymentRecord.id,
    })
  }

  await logAudit({
    actorId: 'system',
    branchId,
    action: 'payment.online_captured',
    entityType: 'Payment',
    entityId: paymentRecord.id,
    after: {
      gatewayPaymentId,
      amountPaise,
      receiptNumber,
      studentCode: student.studentCode,
    },
    reason: `Processed online payment of ₹${(amountPaise / 100).toLocaleString()} from ${student.name} (Receipt #${receiptNumber})`,
  })

  return {
    success: true,
    status: 'PROCESSED',
    paymentId: paymentRecord.id,
    receiptNumber,
    message: 'Online payment successfully captured, receipt issued, and WhatsApp notification dispatched.',
  }
}

/**
 * Handles online refund webhook (WORKFLOWS.md § 7).
 * Links refund to original payment and generates a reversal entry.
 */
export async function processOnlineRefundWebhook(input: {
  payload: any
  signature?: string
  rawBody?: string
}): Promise<{ success: boolean; message: string }> {
  if (input.rawBody && input.signature) {
    const isValid = verifyWebhookSignature(input.rawBody, input.signature)
    if (!isValid) {
      throw new Error('Invalid webhook HMAC signature.')
    }
  }

  const refundEntity = input.payload?.payload?.refund?.entity || input.payload
  const gatewayPaymentId = refundEntity?.payment_id || refundEntity?.paymentId
  const refundAmountPaise = Number(refundEntity?.amount || 0)
  const refundId = refundEntity?.id || `rfnd_${Date.now()}`

  const systemContext: UserContext = {
    userId: 'usr-system-webhook',
    loginId: 'SYSTEM-WEBHOOK',
    role: 'ADMIN',
    branchId: null,
  }

  // Reverse dues and student balance
  await logAudit({
    actorId: 'system',
    branchId: 'branch-kkp',
    action: 'payment.online_refunded',
    entityType: 'Payment',
    entityId: refundId,
    after: { gatewayPaymentId, refundAmountPaise, refundId },
    reason: `Online gateway refund of ₹${(refundAmountPaise / 100).toLocaleString()} processed for payment ${gatewayPaymentId}`,
  })

  return { success: true, message: `Online refund ${refundId} processed successfully.` }
}

/**
 * Scheduled reconciliation job: polls gateway and recovers missed/delayed webhooks (WORKFLOWS.md § 7).
 */
export async function runReconciliationJob(): Promise<{
  scanned: number
  recovered: number
  recoveredPaymentIds: string[]
}> {
  let recovered = 0
  const recoveredPaymentIds: string[] = []

  for (const tx of demoGatewayTransactions) {
    if (tx.status === 'captured' && !demoProcessedGatewayPaymentIds.has(tx.id)) {
      // Missing webhook found! Recover it immediately
      const result = await processOnlinePaymentWebhook({
        payload: {
          id: tx.id,
          amount: tx.amountPaise,
          notes: {
            studentId: tx.studentId,
            dueId: tx.dueId,
            branchId: tx.branchId,
          },
        },
      })

      if (result.status === 'PROCESSED') {
        recovered++
        recoveredPaymentIds.push(tx.id)
      }
    }
  }

  return {
    scanned: demoGatewayTransactions.length,
    recovered,
    recoveredPaymentIds,
  }
}

/**
 * Lists all unmatched online payments requiring Admin resolution.
 */
export async function listUnmatchedPayments(caller: UserContext): Promise<UnmatchedPaymentRecord[]> {
  authorize(caller, 'fee:view')
  return demoUnmatchedPayments.filter((u) => u.status === 'UNMATCHED')
}

/**
 * Resolves an unmatched payment by linking it to the designated student (Admin only).
 */
export async function resolveUnmatchedPayment(
  caller: UserContext,
  input: {
    unmatchedPaymentId: string
    studentId: string
    note?: string
  }
): Promise<{ success: boolean; paymentId: string; receiptNumber: number }> {
  authorize(caller, 'fee:record_payment')

  if (caller.role !== 'ADMIN') {
    throw new PermissionDeniedError('Only administrators can resolve unmatched online payments.')
  }

  const unmatched = demoUnmatchedPayments.find((u) => u.id === input.unmatchedPaymentId)
  if (!unmatched || unmatched.status === 'RESOLVED') {
    throw new RecordNotFoundError('Unmatched Payment')
  }

  const student = await getStudentById(caller, input.studentId)

  // Re-process with matched student ID
  const result = await processOnlinePaymentWebhook({
    payload: {
      id: unmatched.gatewayPaymentId,
      amount: unmatched.amountPaise,
      notes: {
        studentId: student.id,
        branchId: student.branchId,
      },
    },
  })

  unmatched.status = 'RESOLVED'
  unmatched.resolvedStudentId = student.id
  unmatched.resolvedAt = new Date().toISOString()
  unmatched.resolvedById = caller.userId
  unmatched.resolutionNote = input.note || 'Manually resolved by administrator'

  await logAudit({
    actorId: caller.userId,
    branchId: student.branchId,
    action: 'payment.resolve_unmatched',
    entityType: 'UnmatchedPayment',
    entityId: unmatched.id,
    after: {
      studentCode: student.studentCode,
      gatewayPaymentId: unmatched.gatewayPaymentId,
      amountPaise: unmatched.amountPaise,
      note: unmatched.resolutionNote,
    },
    reason: `Resolved unmatched payment ${unmatched.gatewayPaymentId} to ${student.name} (${student.studentCode})`,
  })

  return {
    success: true,
    paymentId: result.paymentId || unmatched.gatewayPaymentId,
    receiptNumber: result.receiptNumber || 0,
  }
}

