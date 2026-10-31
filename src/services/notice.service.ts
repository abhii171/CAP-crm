import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { UserContext, authorize, RecordNotFoundError, PermissionDeniedError } from '@/lib/rbac'
import { assertBranchAccess, scopeBranchWhere } from '@/lib/branch-query'
import { listStudents } from './student.service'
import { listBatches } from './batch.service'
import { listBranches } from './branch.service'
import { cancelSession } from './attendance.service'
import { queueOutboundMessage, listMessages, MessageRecord } from './whatsapp.service'

export interface NoticePreviewRecipient {
  studentId: string
  studentName: string
  studentCode: string
  guardianName: string
  whatsappNumber: string
  optedIn: boolean
  batchName?: string
}

export interface NoticePreviewResult {
  branchId: string
  branchName: string
  totalCadets: number
  optedInCount: number
  optedOutCount: number
  recipients: NoticePreviewRecipient[]
}

export interface DispatchNoticeInput {
  branchId: string
  batchIds?: string[] // Optional specific batches; otherwise all batches in branch
  templateName?: string // defaults to 'notice_broadcast'
  headline: string
  details: string
  cancelSessions?: boolean // Automatically mark sessions CANCELLED
  sessionDate?: string // YYYY-MM-DD, defaults to today
}

export interface InboxItem extends MessageRecord {
  cadetName?: string
  studentCode?: string
  hoursAgo: number
  canFreeFormReply: boolean
  escalationLevel: 'NONE' | 'MANAGER' | 'ADMIN'
}

/**
 * Generates recipient count and preview for an upcoming broadcast notice (WORKFLOWS.md § 4).
 * Separates opted-in recipients from opted-out recipients to ensure compliance.
 */
export async function previewNoticeRecipients(
  caller: UserContext,
  input: { branchId: string; batchIds?: string[] }
): Promise<NoticePreviewResult> {
  authorize(caller, 'notice:send')
  assertBranchAccess(caller, input.branchId, 'Branch')

  const branches = await listBranches(caller)
  const branch = branches.find((b) => b.id === input.branchId)
  const branchName = branch?.name || 'CPA Academy'

  const students = await listStudents(caller, { branchId: input.branchId, status: 'ACTIVE' })

  const filtered = input.batchIds && input.batchIds.length > 0
    ? students.filter((s) => s.currentBatch && input.batchIds!.includes(s.currentBatch.id))
    : students

  const seenPhones = new Set<string>()
  const recipients: NoticePreviewRecipient[] = []
  let optedInCount = 0
  let optedOutCount = 0

  for (const s of filtered) {
    const rawPhone = s.guardianPhone?.replace(/\D/g, '') || ''
    const isOptedIn = Boolean(s.whatsappOptIn && rawPhone)

    recipients.push({
      studentId: s.id,
      studentName: s.name,
      studentCode: s.studentCode,
      guardianName: s.guardianName || 'Guardian',
      whatsappNumber: s.guardianPhone || '',
      optedIn: isOptedIn,
      batchName: s.currentBatch?.name,
    })

    if (rawPhone && !seenPhones.has(rawPhone)) {
      seenPhones.add(rawPhone)
      if (isOptedIn) optedInCount++
      else optedOutCount++
    }
  }

  return {
    branchId: input.branchId,
    branchName,
    totalCadets: filtered.length,
    optedInCount,
    optedOutCount,
    recipients,
  }
}

/**
 * Dispatches a holiday, rain cancellation, or general notice to opted-in parents (WORKFLOWS.md § 4).
 * If cancelSessions is requested (or rain cancellation), automatically cancels matching training sessions
 * so attendance expectations are cleared and no false absence alerts fire.
 */
export async function dispatchNotice(
  caller: UserContext,
  input: DispatchNoticeInput
): Promise<{
  success: boolean
  dispatchedCount: number
  skippedOptOutCount: number
  cancelledSessionsCount: number
}> {
  authorize(caller, 'notice:send')
  assertBranchAccess(caller, input.branchId, 'Branch')

  if (!input.headline || input.headline.trim().length < 3) {
    throw new Error('Notice headline must be at least 3 characters.')
  }
  if (!input.details || input.details.trim().length < 5) {
    throw new Error('Notice details must be at least 5 characters.')
  }

  const branches = await listBranches(caller)
  const branch = branches.find((b) => b.id === input.branchId)
  const branchName = branch?.name || 'CPA Cricket Academy'

  const todayStr = input.sessionDate || new Date().toISOString().split('T')[0]
  const preview = await previewNoticeRecipients(caller, {
    branchId: input.branchId,
    batchIds: input.batchIds,
  })

  // Deduplicate by parent phone number to avoid sending multiple messages to sibling parents
  const dispatchedPhones = new Set<string>()
  let dispatchedCount = 0
  let skippedOptOutCount = 0

  for (const r of preview.recipients) {
    if (!r.optedIn || !r.whatsappNumber) {
      skippedOptOutCount++
      continue
    }

    const cleanPhone = r.whatsappNumber.replace(/\D/g, '')
    if (dispatchedPhones.has(cleanPhone)) {
      continue
    }
    dispatchedPhones.add(cleanPhone)

    await queueOutboundMessage(caller, {
      branchId: input.branchId,
      studentId: r.studentId,
      recipientPhone: r.whatsappNumber,
      templateName: input.templateName || 'notice_broadcast',
      variables: {
        branchName,
        headline: input.headline.trim(),
        details: input.details.trim(),
      },
      relatedType: 'NOTICE',
    })
    dispatchedCount++
  }

  // Session cancellation handling (WORKFLOWS.md § 4)
  // If cancelSessions is true or notice is a rain cancellation, cancel all affected batch sessions
  let cancelledSessionsCount = 0
  const isCancellation =
    input.cancelSessions ||
    input.headline.toLowerCase().includes('rain') ||
    input.headline.toLowerCase().includes('cancel') ||
    input.headline.toLowerCase().includes('waterlog')

  if (isCancellation) {
    const batches = await listBatches(caller, input.branchId)
    const targetBatches = input.batchIds && input.batchIds.length > 0
      ? batches.filter((b) => input.batchIds!.includes(b.id))
      : batches

    for (const batch of targetBatches) {
      try {
        await cancelSession(caller, {
          batchId: batch.id,
          date: todayStr,
          reason: `${input.headline}: ${input.details}`,
        })
        cancelledSessionsCount++
      } catch {}
    }
  }

  await logAudit({
    actorId: caller.userId,
    branchId: input.branchId,
    action: 'notice.dispatch',
    entityType: 'Notice',
    entityId: `notice-${Date.now()}`,
    after: {
      headline: input.headline,
      dispatchedCount,
      skippedOptOutCount,
      cancelledSessionsCount,
    },
    reason: `Dispatched notice "${input.headline}" to ${dispatchedCount} guardians (${cancelledSessionsCount} sessions cancelled)`,
  })

  return {
    success: true,
    dispatchedCount,
    skippedOptOutCount,
    cancelledSessionsCount,
  }
}

/**
 * Lists inbound messages in the shared branch reply inbox (WORKFLOWS.md § 10).
 * Enriches messages with 24-hour service window status and escalation levels:
 * - Unread for > 24 hours: escalated to Manager
 * - Unread for > 48 hours: escalated to Admin
 */
export async function listInboxMessages(
  caller: UserContext,
  options?: {
    branchId?: string
    inboxStatus?: 'UNREAD' | 'IN_PROGRESS' | 'RESOLVED'
  }
): Promise<InboxItem[]> {
  authorize(caller, 'inbox:view')

  const inboundMessages = await listMessages(caller, {
    branchId: options?.branchId,
    direction: 'INBOUND',
  })

  const nowTime = Date.now()
  const students = await listStudents(caller, { branchId: options?.branchId })

  return inboundMessages
    .filter((m) => {
      if (options?.inboxStatus && m.inboxStatus !== options.inboxStatus) {
        return false
      }
      return true
    })
    .map((m) => {
      const msgTime = new Date(m.createdAt).getTime()
      const hoursAgo = Math.max(0, Math.floor((nowTime - msgTime) / (1000 * 60 * 60)))
      const canFreeFormReply = hoursAgo < 24

      let escalationLevel: 'NONE' | 'MANAGER' | 'ADMIN' = 'NONE'
      if (m.inboxStatus === 'UNREAD') {
        if (hoursAgo >= 48) escalationLevel = 'ADMIN'
        else if (hoursAgo >= 24) escalationLevel = 'MANAGER'
      }

      // Match sender to cadet if not already set
      let cadetName
      let studentCode
      if (m.studentId) {
        const matched = students.find((s) => s.id === m.studentId)
        if (matched) {
          cadetName = matched.name
          studentCode = matched.studentCode
        }
      } else {
        const cleanSender = m.recipientPhone.replace(/\D/g, '')
        const matched = students.find(
          (s) => s.guardianPhone && s.guardianPhone.replace(/\D/g, '').endsWith(cleanSender.slice(-10))
        )
        if (matched) {
          cadetName = matched.name
          studentCode = matched.studentCode
        }
      }

      return {
        ...m,
        cadetName,
        studentCode,
        hoursAgo,
        canFreeFormReply,
        escalationLevel,
      }
    })
}

/**
 * Updates the triage status of an inbound reply in the shared inbox.
 */
export async function updateInboxMessageStatus(
  caller: UserContext,
  input: {
    messageId: string
    newStatus: 'UNREAD' | 'IN_PROGRESS' | 'RESOLVED'
  }
): Promise<{ success: boolean; messageId: string; status: string }> {
  authorize(caller, 'notice:send')

  const messages = await listMessages(caller, { direction: 'INBOUND' })
  const msg = messages.find((m) => m.id === input.messageId)
  if (!msg) {
    throw new RecordNotFoundError('Inbox Message')
  }

  assertBranchAccess(caller, msg.branchId, 'Inbox Message')

  msg.inboxStatus = input.newStatus

  await logAudit({
    actorId: caller.userId,
    branchId: msg.branchId,
    action: 'whatsapp.inbox_status_update',
    entityType: 'Message',
    entityId: msg.id,
    after: { inboxStatus: input.newStatus },
    reason: `Updated message ${msg.id} status to ${input.newStatus}`,
  })

  return { success: true, messageId: msg.id, status: input.newStatus }
}

/**
 * Replies to an inbound WhatsApp message from the shared branch inbox (WORKFLOWS.md § 10).
 * Enforces WhatsApp 24-hour service window: outside 24 hours, only approved Meta templates are allowed.
 */
export async function replyToInboxMessage(
  caller: UserContext,
  input: {
    messageId: string
    replyText: string
    templateName?: string
  }
): Promise<{ success: boolean; replyMessageId: string }> {
  authorize(caller, 'notice:send')

  const messages = await listMessages(caller, { direction: 'INBOUND' })
  const msg = messages.find((m) => m.id === input.messageId)
  if (!msg) {
    throw new RecordNotFoundError('Inbox Message')
  }

  assertBranchAccess(caller, msg.branchId, 'Inbox Message')

  const hoursAgo = Math.floor((Date.now() - new Date(msg.createdAt).getTime()) / (1000 * 60 * 60))

  // WhatsApp 24-hour window policy (WORKFLOWS.md § 10)
  if (hoursAgo >= 24 && !input.templateName) {
    throw new Error(
      'WhatsApp 24-hour customer service window has expired for this message. Replies must use an approved Meta template.'
    )
  }

  const outbound = await queueOutboundMessage(caller, {
    branchId: msg.branchId,
    studentId: msg.studentId || undefined,
    recipientPhone: msg.recipientPhone,
    templateName: input.templateName || 'notice_broadcast',
    variables: {
      branchName: 'CPA Academy',
      headline: 'Academy Response',
      details: input.replyText.trim(),
    },
    relatedType: 'NOTICE',
    relatedId: msg.id,
  })

  // Mark inbound message as RESOLVED
  msg.inboxStatus = 'RESOLVED'

  await logAudit({
    actorId: caller.userId,
    branchId: msg.branchId,
    action: 'whatsapp.inbox_reply',
    entityType: 'Message',
    entityId: msg.id,
    after: {
      replyMessageId: outbound.id,
      inboxStatus: 'RESOLVED',
    },
    reason: `Replied to inbound message from ${msg.recipientPhone}: ${input.replyText.substring(0, 50)}...`,
  })

  return { success: true, replyMessageId: outbound.id }
}
