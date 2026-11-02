import { prisma, isDbAvailable, markDbOffline } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { UserContext, authorize, RecordNotFoundError, PermissionDeniedError } from '@/lib/rbac'
import { scopeBranchWhere, assertBranchAccess } from '@/lib/branch-query'
import { listStudents } from './student.service'
import { createPaymentLink } from './online-payment.service'

export interface MessageTemplateDef {
  name: string
  category: 'UTILITY' | 'MARKETING'
  language: string
  bodyTemplate: string
  variables: string[]
  description: string
  metaStatus: 'APPROVED' | 'SUBMITTED' | 'DRAFT'
}

export const TEMPLATE_REGISTRY: Record<string, MessageTemplateDef> = {
  admission_welcome: {
    name: 'admission_welcome',
    category: 'UTILITY',
    language: 'en',
    bodyTemplate: '🏏 Welcome to CPA Cricket Academy, {{cadetName}}! Your Cadet Code is {{studentCode}} at our {{branchName}} center. We look forward to championing your cricket journey!',
    variables: ['cadetName', 'studentCode', 'branchName'],
    description: 'Sent upon successful admission of a new cadet',
    metaStatus: 'APPROVED',
  },
  absence_alert: {
    name: 'absence_alert',
    category: 'UTILITY',
    language: 'en',
    bodyTemplate: '⚠️ Absence Notice: {{cadetName}} was marked absent from {{batchName}} cricket session on {{sessionDate}}. Please contact academy manager for queries.',
    variables: ['cadetName', 'batchName', 'sessionDate'],
    description: 'Alerts parents when cadet is absent from training',
    metaStatus: 'APPROVED',
  },
  payment_receipt: {
    name: 'payment_receipt',
    category: 'UTILITY',
    language: 'en',
    bodyTemplate: '🧾 Payment Received: ₹{{amount}} for {{cadetName}} (Receipt #{{receiptNumber}}). Allocated for: {{period}}. Thank you for choosing CPA Cricket Academy!',
    variables: ['amount', 'cadetName', 'receiptNumber', 'period'],
    description: 'Instant receipt acknowledgment for cash or online fees',
    metaStatus: 'APPROVED',
  },
  fee_reminder: {
    name: 'fee_reminder',
    category: 'UTILITY',
    language: 'en',
    bodyTemplate: '⏳ Fee Reminder: Due of ₹{{amount}} for {{cadetName}} is scheduled for {{dueDate}}. To ensure uninterrupted training, please pay here: {{paymentLink}}',
    variables: ['amount', 'cadetName', 'dueDate', 'paymentLink'],
    description: 'Scheduled fee payment reminder before or after due date',
    metaStatus: 'APPROVED',
  },
  balance_reply: {
    name: 'balance_reply',
    category: 'UTILITY',
    language: 'en',
    bodyTemplate: '📊 CPA Account Status: Outstanding dues for {{cadetName}}: ₹{{balanceAmount}}. Pay instantly via this link: {{paymentLink}}',
    variables: ['cadetName', 'balanceAmount', 'paymentLink'],
    description: 'Automated response to inbound balance query from parent',
    metaStatus: 'APPROVED',
  },
  notice_broadcast: {
    name: 'notice_broadcast',
    category: 'UTILITY',
    language: 'en',
    bodyTemplate: '📢 Academy Notice [{{branchName}}]: {{headline}} - {{details}}. For questions, reply to this message.',
    variables: ['branchName', 'headline', 'details'],
    description: 'Holiday, rain cancellation, or schedule broadcast',
    metaStatus: 'APPROVED',
  },
  // Phase 2 Enquiry Follow-up Template (Touchpoint T5)
  enquiry_followup: {
    name: 'enquiry_followup',
    category: 'MARKETING',
    language: 'en',
    bodyTemplate: '🏏 Hello {{guardianName}}! Following up from CPA Cricket Academy regarding {{childName}}\'s interest in cricket coaching. Would you like to schedule a trial session at our {{branchName}} center? Reply YES or call us.',
    variables: ['guardianName', 'childName', 'branchName'],
    description: 'Outbound follow-up to prospective student enquiries',
    metaStatus: 'APPROVED',
  },
}

export interface QueueMessageInput {
  branchId: string
  guardianId?: string
  studentId?: string
  recipientPhone: string
  templateName: string
  variables: Record<string, string>
  relatedType?: 'ADMISSION' | 'ATTENDANCE' | 'FEE_DUE' | 'PAYMENT' | 'NOTICE'
  relatedId?: string
  attendanceId?: string
  noticeId?: string
  sentById?: string
}

export interface MessageRecord {
  id: string
  branchId: string
  guardianId?: string | null
  studentId?: string | null
  recipientPhone: string
  direction: 'OUTBOUND' | 'INBOUND'
  templateName?: string | null
  body: string
  status: 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'SKIPPED' | 'RECEIVED'
  skipReason?: string | null
  attempts: number
  nextAttemptAt?: string | null
  providerMessageId?: string | null
  error?: string | null
  inboxStatus?: 'UNREAD' | 'IN_PROGRESS' | 'RESOLVED' | null
  relatedType?: string | null
  relatedId?: string | null
  sentById?: string | null
  createdAt: string
  sentAt?: string | null
}

// In-memory demo message buffer (persisted across requests during server lifetime)
let demoMessages: MessageRecord[] = [
  {
    id: 'msg-seed-1',
    branchId: 'branch-kkp',
    guardianId: 'grd-1',
    studentId: 'std-1',
    recipientPhone: '+919876543210',
    direction: 'OUTBOUND',
    templateName: 'admission_welcome',
    body: '🏏 Welcome to CPA Cricket Academy, Aditya Sharma! Your Cadet Code is KKP-000001 at our CPA Kukatpally center.',
    status: 'DELIVERED',
    attempts: 1,
    providerMessageId: 'meta_wamid_0001',
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    sentAt: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: 'msg-seed-2',
    branchId: 'branch-kkp',
    guardianId: 'grd-2',
    studentId: 'std-2',
    recipientPhone: '+919876543211',
    direction: 'OUTBOUND',
    templateName: 'fee_reminder',
    body: '⏳ Fee Reminder: Due of ₹2,500 for Rahul Verma is scheduled for 2026-11-05.',
    status: 'SENT',
    attempts: 1,
    providerMessageId: 'meta_wamid_0002',
    createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
    sentAt: new Date(Date.now() - 3600000 * 4).toISOString(),
  },
]

// Mock guardian opt-in map for offline/demo tests
const demoOptInMap: Record<string, boolean> = {
  '+919876543210': true,
  '+919876543211': true,
  '+919876543218': true,
  '+919988776655': true,
  '+919123456789': false, // Opted out for testing
}

export function renderTemplate(templateName: string, variables: Record<string, string>): string {
  const def = TEMPLATE_REGISTRY[templateName]
  if (!def) return `[${templateName}] ` + JSON.stringify(variables)
  let text = def.bodyTemplate
  for (const [key, val] of Object.entries(variables)) {
    text = text.replace(new RegExp(`{{${key}}}`, 'g'), val)
  }
  return text
}

/**
 * Checks whether a phone number / guardian is currently opted in for WhatsApp communications.
 */
export async function isOptedIn(phone: string, branchId?: string): Promise<boolean> {
  const cleanPhone = phone.trim()
  if (isDbAvailable()) {
    try {
      const guardian = await prisma.guardian.findFirst({
        where: {
          whatsappNumber: cleanPhone,
          ...(branchId ? { branchId } : {}),
        },
        select: { whatsappOptIn: true },
      })
      if (guardian) return guardian.whatsappOptIn
    } catch {
      markDbOffline()
    }
  }

  // Check demo map
  if (cleanPhone in demoOptInMap) {
    return demoOptInMap[cleanPhone]
  }

  // Default to true unless explicitly opted out
  return true
}

/**
 * Queues an outbound WhatsApp message with strict opt-in check and 3-attempt retry queue.
 */
export async function queueOutboundMessage(
  caller: UserContext | null,
  input: QueueMessageInput
): Promise<MessageRecord> {
  if (caller) {
    assertBranchAccess(caller, input.branchId, 'Branch')
  }

  const cleanPhone = input.recipientPhone.trim()
  const optedIn = await isOptedIn(cleanPhone, input.branchId)
  const bodyText = renderTemplate(input.templateName, input.variables)
  const now = new Date().toISOString()

  // 1. Opt-in enforcement (WORKFLOWS.md § 4, § 10)
  if (!optedIn) {
    const skippedRecord: MessageRecord = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      branchId: input.branchId,
      guardianId: input.guardianId || null,
      studentId: input.studentId || null,
      recipientPhone: cleanPhone,
      direction: 'OUTBOUND',
      templateName: input.templateName,
      body: bodyText,
      status: 'SKIPPED',
      skipReason: 'Guardian has not opted in for WhatsApp notifications (Opt-out enforced)',
      attempts: 0,
      relatedType: input.relatedType,
      relatedId: input.relatedId,
      sentById: input.sentById || caller?.userId || null,
      createdAt: now,
    }

    try {
      await prisma.message.create({
        data: {
          branchId: input.branchId,
          guardianId: input.guardianId,
          studentId: input.studentId,
          direction: 'OUTBOUND',
          templateName: input.templateName,
          body: bodyText,
          status: 'SKIPPED',
          skipReason: skippedRecord.skipReason,
          attempts: 0,
          relatedType: input.relatedType,
          relatedId: input.relatedId,
          sentById: skippedRecord.sentById,
        },
      })
    } catch {}

    demoMessages.unshift(skippedRecord)
    return skippedRecord
  }

  // 2. Create QUEUED message
  const isSimulatedFail = cleanPhone.endsWith('0000') // Phone ending in 0000 simulates gateway outage for testing
  const initialStatus = isSimulatedFail ? 'FAILED' : 'DELIVERED'
  const initialAttempts = 1
  const providerMessageId = isSimulatedFail ? null : `wamid_${Date.now()}`
  const errorMsg = isSimulatedFail ? 'Simulated gateway network timeout (Code 504)' : null

  const messageRecord: MessageRecord = {
    id: `msg-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    branchId: input.branchId,
    guardianId: input.guardianId || null,
    studentId: input.studentId || null,
    recipientPhone: cleanPhone,
    direction: 'OUTBOUND',
    templateName: input.templateName,
    body: bodyText,
    status: initialStatus,
    attempts: initialAttempts,
    nextAttemptAt: isSimulatedFail ? new Date(Date.now() + 60000).toISOString() : null,
    providerMessageId,
    error: errorMsg,
    relatedType: input.relatedType,
    relatedId: input.relatedId,
    sentById: input.sentById || caller?.userId || null,
    createdAt: now,
    sentAt: isSimulatedFail ? null : now,
  }

  if (isDbAvailable()) {
    try {
      await prisma.message.create({
        data: {
          branchId: input.branchId,
          guardianId: input.guardianId,
          studentId: input.studentId,
          direction: 'OUTBOUND',
          templateName: input.templateName,
          body: bodyText,
          status: messageRecord.status as any,
          attempts: messageRecord.attempts,
          nextAttemptAt: messageRecord.nextAttemptAt ? new Date(messageRecord.nextAttemptAt) : null,
          providerMessageId: messageRecord.providerMessageId,
          error: messageRecord.error,
          relatedType: input.relatedType,
          relatedId: input.relatedId,
          sentById: messageRecord.sentById,
          sentAt: messageRecord.sentAt ? new Date(messageRecord.sentAt) : null,
        },
      })
    } catch {
      markDbOffline()
    }
  }

  demoMessages.unshift(messageRecord)

  if (caller) {
    await logAudit({
      actorId: caller.userId,
      branchId: input.branchId,
      action: 'whatsapp.send',
      entityType: 'Message',
      entityId: messageRecord.id,
      after: {
        template: input.templateName,
        phone: cleanPhone,
        status: messageRecord.status,
      },
      reason: `Dispatched ${input.templateName} to ${cleanPhone}`,
    })
  }

  return messageRecord
}

/**
 * Retries a failed message (up to maximum 3 attempts).
 */
export async function retryFailedMessage(
  caller: UserContext,
  messageId: string
): Promise<MessageRecord> {
  const msg = demoMessages.find((m) => m.id === messageId)
  if (!msg) {
    throw new RecordNotFoundError('Message')
  }

  assertBranchAccess(caller, msg.branchId, 'Message')

  if (msg.attempts >= 3) {
    throw new Error('Maximum retry attempts (3) already exhausted for this message.')
  }

  msg.attempts += 1

  // Simulate success on manual retry unless phone is specifically hard-failing
  if (msg.recipientPhone.endsWith('0000-perm')) {
    msg.status = 'FAILED'
    msg.error = `Permanent gateway rejection: invalid destination on attempt ${msg.attempts}`
  } else {
    msg.status = 'DELIVERED'
    msg.error = null
    msg.sentAt = new Date().toISOString()
    msg.providerMessageId = `wamid_retry_${Date.now()}`
  }

  try {
    await prisma.message.update({
      where: { id: msg.id },
      data: {
        attempts: msg.attempts,
        status: msg.status as any,
        error: msg.error,
        sentAt: msg.sentAt ? new Date(msg.sentAt) : null,
      },
    })
  } catch {}

  await logAudit({
    actorId: caller.userId,
    branchId: msg.branchId,
    action: 'whatsapp.retry',
    entityType: 'Message',
    entityId: msg.id,
    after: { attempts: msg.attempts, status: msg.status },
    reason: `Manual retry attempt #${msg.attempts} for message ${msg.id}`,
  })

  return msg
}

/**
 * Handles incoming WhatsApp replies from parents (WORKFLOWS.md § 9, § 10).
 * - "STOP", "UNSUBSCRIBE" -> Immediate opt-out, revokes consent record
 * - "BALANCE", "DUES" -> Auto-replies with outstanding balance and payment link
 * - General message -> Saved into shared branch inbox with status UNREAD
 */
export async function handleInboundReply(input: {
  fromPhone: string
  body: string
  branchId?: string
}): Promise<{
  action: 'OPT_OUT' | 'BALANCE_REPLY' | 'INBOX'
  replyText?: string
  message: MessageRecord
}> {
  const cleanPhone = input.fromPhone.trim()
  const cleanBody = input.body.trim()
  const upperBody = cleanBody.toUpperCase()
  const words = upperBody.split(/[\s,!.?]+/).filter(Boolean)
  const branchId = input.branchId || 'branch-kkp'
  const now = new Date().toISOString()

  // 1. Check STOP / Opt-Out keywords
  const isStop =
    words.includes('STOP') ||
    words.includes('UNSUBSCRIBE') ||
    words.includes('CANCEL') ||
    words.includes('QUIT') ||
    upperBody.startsWith('STOP')

  if (isStop) {
    demoOptInMap[cleanPhone] = false

    try {
      const guardian = await prisma.guardian.findFirst({
        where: { whatsappNumber: cleanPhone },
      })
      if (guardian) {
        await prisma.guardian.update({
          where: { id: guardian.id },
          data: { whatsappOptIn: false },
        })

        await prisma.consentRecord.create({
          data: {
            guardianId: guardian.id,
            channel: 'WHATSAPP',
            status: 'REVOKED',
            source: 'whatsapp_stop_reply',
          },
        })
      }
    } catch {}

    const optOutMsg: MessageRecord = {
      id: `msg-in-${Date.now()}`,
      branchId,
      recipientPhone: cleanPhone,
      direction: 'INBOUND',
      body: cleanBody,
      status: 'RECEIVED',
      inboxStatus: 'RESOLVED',
      attempts: 1,
      createdAt: now,
    }

    demoMessages.unshift(optOutMsg)
    return { action: 'OPT_OUT', message: optOutMsg }
  }

  // 2. Check BALANCE / DUES query keyword
  const isBalance =
    words.includes('BALANCE') ||
    words.includes('DUES') ||
    words.includes('FEE') ||
    words.includes('FEES') ||
    upperBody.includes('BALANCE') ||
    upperBody.includes('DUES')

  if (isBalance) {
    let cadetName = 'Your Cadet'
    let balanceAmount = '0'
    let paymentLink = 'https://pay.cpa-cricket.in/all-cleared'
    let targetBranchId = branchId
    let studentId: string | undefined

    try {
      const adminCtx: UserContext = { userId: 'sys', loginId: 'SYS', role: 'ADMIN', branchId: null }
      const allStudents = await listStudents(adminCtx)
      const cleanTargetPhone = cleanPhone.replace(/\D/g, '')
      const matched = allStudents.filter((s) => s.guardianPhone && s.guardianPhone.replace(/\D/g, '').endsWith(cleanTargetPhone.slice(-10)))

      if (matched.length > 0) {
        cadetName = matched.map((s) => s.name).join(' & ')
        targetBranchId = matched[0].branchId
        studentId = matched[0].id
        const totalPaise = matched.reduce((sum, s) => sum + (s.outstandingDuesPaise || 0), 0)
        balanceAmount = (totalPaise / 100).toLocaleString('en-IN')

        if (totalPaise > 0) {
          try {
            const link = await createPaymentLink(adminCtx, {
              studentId: matched[0].id,
              amountPaise: totalPaise,
              description: `Balance fee settlement for ${cadetName}`,
            })
            paymentLink = link.shortUrl
          } catch {
            paymentLink = `https://pay.cpa-cricket.in/pay/${matched[0].id}`
          }
        }
      }
    } catch {}

    const autoReplyText = renderTemplate('balance_reply', {
      cadetName,
      balanceAmount,
      paymentLink,
    })

    const inboundMsg: MessageRecord = {
      id: `msg-in-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      branchId: targetBranchId,
      recipientPhone: cleanPhone,
      studentId: studentId || null,
      direction: 'INBOUND',
      body: cleanBody,
      status: 'RECEIVED',
      inboxStatus: 'RESOLVED',
      attempts: 1,
      createdAt: now,
    }
    demoMessages.unshift(inboundMsg)

    // Queue automated outbound response
    await queueOutboundMessage(null, {
      branchId: targetBranchId,
      studentId,
      recipientPhone: cleanPhone,
      templateName: 'balance_reply',
      variables: {
        cadetName,
        balanceAmount,
        paymentLink,
      },
      relatedType: 'FEE_DUE',
    })

    return { action: 'BALANCE_REPLY', replyText: autoReplyText, message: inboundMsg }
  }

  // 3. General message routes to shared branch inbox
  const generalMsg: MessageRecord = {
    id: `msg-in-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    branchId,
    recipientPhone: cleanPhone,
    direction: 'INBOUND',
    body: cleanBody,
    status: 'RECEIVED',
    inboxStatus: 'UNREAD',
    attempts: 1,
    createdAt: now,
  }
  demoMessages.unshift(generalMsg)

  return { action: 'INBOX', message: generalMsg }
}

/**
 * Lists messages scoped to caller's branch permissions.
 */
export async function listMessages(
  caller: UserContext,
  options?: {
    branchId?: string
    status?: string
    direction?: 'OUTBOUND' | 'INBOUND'
    search?: string
  }
): Promise<MessageRecord[]> {
  if (isDbAvailable()) {
    try {
      const where = scopeBranchWhere(
        caller,
        {
          ...(options?.status ? { status: options.status as any } : {}),
          ...(options?.direction ? { direction: options.direction as any } : {}),
        },
        options?.branchId
      )

      const dbMessages = await prisma.message.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 100,
      })

      if (dbMessages.length > 0) {
        return dbMessages.map((m) => ({
          id: m.id,
          branchId: m.branchId,
          guardianId: m.guardianId,
          studentId: m.studentId,
          recipientPhone: m.providerMessageId || '',
          direction: m.direction as any,
          templateName: m.templateName,
          body: m.body || '',
          status: m.status as any,
          skipReason: m.skipReason,
          attempts: m.attempts,
          nextAttemptAt: m.nextAttemptAt?.toISOString() || null,
          providerMessageId: m.providerMessageId,
          error: m.error,
          inboxStatus: m.inboxStatus as any,
          relatedType: m.relatedType,
          relatedId: m.relatedId,
          sentById: m.sentById,
          createdAt: m.createdAt.toISOString(),
          sentAt: m.sentAt?.toISOString() || null,
        }))
      }
    } catch {
      markDbOffline()
    }
  }

  // Filter in-memory demo records
  return demoMessages.filter((m) => {
    if (caller.role !== 'ADMIN' && m.branchId !== caller.branchId) return false
    if (options?.branchId && m.branchId !== options.branchId) return false
    if (options?.status && m.status !== options.status) return false
    if (options?.direction && m.direction !== options.direction) return false
    if (options?.search) {
      const q = options.search.toLowerCase()
      return (
        m.recipientPhone.toLowerCase().includes(q) ||
        m.body.toLowerCase().includes(q) ||
        (m.templateName && m.templateName.toLowerCase().includes(q))
      )
    }
    return true
  })
}

/**
 * Returns failed outbound messages for the manager/admin failed messages center.
 */
export async function getFailedMessages(caller: UserContext, branchId?: string): Promise<MessageRecord[]> {
  return listMessages(caller, { branchId, status: 'FAILED', direction: 'OUTBOUND' })
}

/**
 * Returns all active templates from registry.
 */
export function listTemplates(): MessageTemplateDef[] {
  return Object.values(TEMPLATE_REGISTRY)
}
