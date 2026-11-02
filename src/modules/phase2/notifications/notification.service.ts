import { prisma, isDbAvailable, markDbOffline } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { UserContext, authorize, RecordNotFoundError, PermissionDeniedError } from '@/lib/rbac'
import { listUsers } from '@/services/user.service'
import {
  NotificationSeverity,
  NOTIFICATION_EVENT_CATALOGUE,
} from './notification-events'

export interface NotificationEventRecord {
  id: string
  type: string
  branchId?: string | null
  dedupeKey: string
  severity: NotificationSeverity
  payload: Record<string, any>
  createdAt: string
}

export interface NotificationRecord {
  id: string
  eventId: string
  recipientUserId: string
  readAt?: string | null
  dismissedAt?: string | null
  createdAt: string
}

export interface NotificationItem {
  id: string
  eventId: string
  type: string
  title: string
  message: string
  severity: NotificationSeverity
  payload: Record<string, any>
  branchId?: string | null
  isRead: boolean
  readAt?: string | null
  createdAt: string
}

export interface CreateEventInput {
  type: string
  branchId?: string | null
  dedupeKey: string
  severity?: NotificationSeverity
  payload: Record<string, any>
  recipientUserIds?: string[]
}

// In-memory demo buffer for fallback / offline test resiliency
let demoEvents: NotificationEventRecord[] = []
let demoNotifications: NotificationRecord[] = []
let demoPreferences: { userId: string; eventType: string; inApp: boolean }[] = []

export function resetDemoNotifications(): void {
  demoEvents = []
  demoNotifications = []
  demoPreferences = []
}

/**
 * Resolves recipient user IDs based on event audience and branch scope (W2-10).
 */
async function resolveRecipients(
  caller: UserContext,
  eventType: string,
  branchId?: string | null
): Promise<string[]> {
  const def = NOTIFICATION_EVENT_CATALOGUE[eventType]
  const audience = def?.audience || 'BRANCH_MANAGERS'

  // Fetch all staff users across system using admin context
  const adminCtx: UserContext = { userId: 'system', loginId: 'SYS', role: 'ADMIN', branchId: null }
  const allUsers = await listUsers(adminCtx)
  const activeUsers = allUsers.filter((u) => u.isActive)

  if (audience === 'ADMINS') {
    return activeUsers.filter((u) => u.role === 'ADMIN').map((u) => u.id)
  }

  if (audience === 'ALL_MANAGERS') {
    return activeUsers.filter((u) => u.role === 'ADMIN' || u.role === 'MANAGER').map((u) => u.id)
  }

  if (audience === 'BRANCH_MANAGERS') {
    return activeUsers
      .filter((u) => (u.role === 'ADMIN' && !branchId) || (u.role === 'MANAGER' && u.branchId === branchId))
      .map((u) => u.id)
  }

  if (audience === 'BRANCH_STAFF') {
    return activeUsers
      .filter((u) => u.branchId === branchId)
      .map((u) => u.id)
  }

  return []
}

/**
 * Idempotently creates a notification event and distributes to eligible recipients (W2-10).
 * If dedupeKey already exists, returns existing event without creating duplicate notifications.
 */
export async function createNotificationEvent(
  caller: UserContext,
  input: CreateEventInput
): Promise<{ event: NotificationEventRecord; createdNotificationsCount: number }> {
  const def = NOTIFICATION_EVENT_CATALOGUE[input.type]
  const severity = input.severity || def?.severity || 'INFO'
  const isCritical = def?.isCritical || severity === 'CRITICAL'

  // 1. Idempotency Check: dedupeKey uniqueness
  let existingEvent: NotificationEventRecord | undefined = undefined

  if (isDbAvailable()) {
    try {
      const dbEvent = await prisma.notificationEvent.findUnique({
        where: { dedupeKey: input.dedupeKey },
      })
      if (dbEvent) {
        existingEvent = {
          id: dbEvent.id,
          type: dbEvent.type,
          branchId: dbEvent.branchId,
          dedupeKey: dbEvent.dedupeKey,
          severity: dbEvent.severity as NotificationSeverity,
          payload: dbEvent.payload as Record<string, any>,
          createdAt: dbEvent.createdAt.toISOString(),
        }
      }
    } catch {
      markDbOffline()
    }
  }

  if (!existingEvent) {
    existingEvent = demoEvents.find((e) => e.dedupeKey === input.dedupeKey)
  }

  if (existingEvent) {
    // Already created; return existing without duplication
    return { event: existingEvent, createdNotificationsCount: 0 }
  }

  // 2. Resolve Recipients
  let recipientIds = input.recipientUserIds
  if (!recipientIds || recipientIds.length === 0) {
    recipientIds = await resolveRecipients(caller, input.type, input.branchId)
  }

  // Filter out users who disabled inApp notifications (Critical events cannot be muted)
  if (!isCritical) {
    recipientIds = recipientIds.filter((uid) => {
      const pref = demoPreferences.find((p) => p.userId === uid && p.eventType === input.type)
      return pref ? pref.inApp : true
    })
  }

  // 3. Create Event Record
  const now = new Date().toISOString()
  const eventId = `ne-${Date.now()}-${Math.random().toString(36).substring(7)}`

  const newEvent: NotificationEventRecord = {
    id: eventId,
    type: input.type,
    branchId: input.branchId || null,
    dedupeKey: input.dedupeKey,
    severity,
    payload: input.payload,
    createdAt: now,
  }

  if (isDbAvailable()) {
    try {
      await prisma.notificationEvent.create({
        data: {
          id: newEvent.id,
          type: newEvent.type,
          branchId: newEvent.branchId,
          dedupeKey: newEvent.dedupeKey,
          severity: newEvent.severity,
          payload: newEvent.payload,
        },
      })
    } catch {
      markDbOffline()
    }
  }

  demoEvents.push(newEvent)

  // 4. Distribute Notifications to Recipients
  let createdCount = 0

  for (const uid of recipientIds) {
    const notifId = `notif-${Date.now()}-${Math.random().toString(36).substring(7)}`
    const notif: NotificationRecord = {
      id: notifId,
      eventId: newEvent.id,
      recipientUserId: uid,
      readAt: null,
      dismissedAt: null,
      createdAt: now,
    }

    if (isDbAvailable()) {
      try {
        await prisma.notification.create({
          data: {
            id: notif.id,
            eventId: notif.eventId,
            recipientUserId: notif.recipientUserId,
          },
        })
      } catch {
        markDbOffline()
      }
    }

    demoNotifications.push(notif)
    createdCount++
  }

  // Audit log (zero PII: eventId, type, recipient count)
  await logAudit({
    actorId: caller.userId,
    branchId: input.branchId || null,
    action: 'p2.notification.event_created',
    entityType: 'NotificationEvent',
    entityId: newEvent.id,
    after: { type: newEvent.type, dedupeKey: newEvent.dedupeKey, recipientCount: createdCount },
    reason: `Dispatched notification event: ${newEvent.type}`,
  })

  return { event: newEvent, createdNotificationsCount: createdCount }
}

/**
 * Returns notifications for the current authenticated user (W2-10).
 * Scoped strictly to caller's userId (zero cross-user / cross-branch leaking).
 */
export async function listNotificationsForUser(
  caller: UserContext,
  options?: { unreadOnly?: boolean; limit?: number }
): Promise<NotificationItem[]> {
  const limit = options?.limit || 50

  if (isDbAvailable()) {
    try {
      const where: any = {
        recipientUserId: caller.userId,
        dismissedAt: null,
      }
      if (options?.unreadOnly) {
        where.readAt = null
      }

      const records = await prisma.notification.findMany({
        where,
        include: { event: true },
        orderBy: { createdAt: 'desc' },
        take: limit,
      })

      return records.map((r) => {
        const def = NOTIFICATION_EVENT_CATALOGUE[r.event.type]
        const payload = (r.event.payload as Record<string, any>) || {}
        return {
          id: r.id,
          eventId: r.eventId,
          type: r.event.type,
          title: def?.title || r.event.type,
          message: def?.formatBody(payload) || `Notification: ${r.event.type}`,
          severity: r.event.severity as NotificationSeverity,
          payload,
          branchId: r.event.branchId,
          isRead: Boolean(r.readAt),
          readAt: r.readAt?.toISOString() || null,
          createdAt: r.createdAt.toISOString(),
        }
      })
    } catch {
      markDbOffline()
    }
  }

  // Filter demo notifications
  let items = demoNotifications.filter(
    (n) => n.recipientUserId === caller.userId && !n.dismissedAt
  )

  if (options?.unreadOnly) {
    items = items.filter((n) => !n.readAt)
  }

  return items
    .slice(0, limit)
    .map((n) => {
      const event = demoEvents.find((e) => e.id === n.eventId)
      const type = event?.type || 'SYSTEM'
      const def = NOTIFICATION_EVENT_CATALOGUE[type]
      const payload = event?.payload || {}
      return {
        id: n.id,
        eventId: n.eventId,
        type,
        title: def?.title || type,
        message: def?.formatBody(payload) || `Notification: ${type}`,
        severity: event?.severity || 'INFO',
        payload,
        branchId: event?.branchId || null,
        isRead: Boolean(n.readAt),
        readAt: n.readAt,
        createdAt: n.createdAt,
      }
    })
}

/**
 * Marks a notification as read.
 */
export async function markNotificationRead(
  caller: UserContext,
  notificationId: string
): Promise<void> {
  const notif = demoNotifications.find((n) => n.id === notificationId)
  if (notif && notif.recipientUserId !== caller.userId) {
    throw new PermissionDeniedError('Cannot access another user notification.')
  }

  const now = new Date().toISOString()
  if (notif) {
    notif.readAt = now
  }

  if (isDbAvailable()) {
    try {
      await prisma.notification.updateMany({
        where: { id: notificationId, recipientUserId: caller.userId },
        data: { readAt: new Date(now) },
      })
    } catch {
      markDbOffline()
    }
  }
}

/**
 * Marks all unread notifications for the caller as read.
 */
export async function markAllNotificationsRead(caller: UserContext): Promise<number> {
  const now = new Date().toISOString()
  let count = 0

  for (const n of demoNotifications) {
    if (n.recipientUserId === caller.userId && !n.readAt) {
      n.readAt = now
      count++
    }
  }

  if (isDbAvailable()) {
    try {
      const res = await prisma.notification.updateMany({
        where: { recipientUserId: caller.userId, readAt: null },
        data: { readAt: new Date(now) },
      })
      count = res.count
    } catch {
      markDbOffline()
    }
  }

  return count
}

/**
 * Dismisses a notification from the user's active centre (W2-10).
 * Rule: CRITICAL severity notifications CANNOT be dismissed.
 */
export async function dismissNotification(
  caller: UserContext,
  notificationId: string
): Promise<void> {
  let eventType = ''
  let severity: NotificationSeverity = 'INFO'

  const notif = demoNotifications.find((n) => n.id === notificationId)
  if (notif) {
    if (notif.recipientUserId !== caller.userId) {
      throw new PermissionDeniedError('Cannot access another user notification.')
    }
    const event = demoEvents.find((e) => e.id === notif.eventId)
    if (event) {
      eventType = event.type
      severity = event.severity
    }
  }

  if (isDbAvailable()) {
    try {
      const dbNotif = await prisma.notification.findUnique({
        where: { id: notificationId },
        include: { event: true },
      })
      if (dbNotif) {
        if (dbNotif.recipientUserId !== caller.userId) {
          throw new PermissionDeniedError('Cannot access another user notification.')
        }
        eventType = dbNotif.event.type
        severity = dbNotif.event.severity as NotificationSeverity
      }
    } catch {
      markDbOffline()
    }
  }

  // Critical events cannot be dismissed without resolution
  if (severity === 'CRITICAL') {
    throw new Error('Critical system notifications cannot be dismissed. Please address the underlying issue.')
  }

  const now = new Date().toISOString()
  if (notif) {
    notif.dismissedAt = now
  }

  if (isDbAvailable()) {
    try {
      await prisma.notification.update({
        where: { id: notificationId },
        data: { dismissedAt: new Date(now) },
      })
    } catch {
      markDbOffline()
    }
  }
}

/**
 * Updates a user's notification preference for an event type (W2-10).
 * Critical notifications cannot be disabled.
 */
export async function updateNotificationPreference(
  caller: UserContext,
  input: { eventType: string; inApp: boolean }
): Promise<void> {
  const def = NOTIFICATION_EVENT_CATALOGUE[input.eventType]
  if (def?.isCritical && !input.inApp) {
    throw new Error('Critical notifications cannot be disabled.')
  }

  const existing = demoPreferences.find(
    (p) => p.userId === caller.userId && p.eventType === input.eventType
  )
  if (existing) {
    existing.inApp = input.inApp
  } else {
    demoPreferences.push({
      userId: caller.userId,
      eventType: input.eventType,
      inApp: input.inApp,
    })
  }

  if (isDbAvailable()) {
    try {
      await prisma.notificationPreference.upsert({
        where: {
          userId_eventType: {
            userId: caller.userId,
            eventType: input.eventType,
          },
        },
        create: {
          userId: caller.userId,
          eventType: input.eventType,
          inApp: input.inApp,
        },
        update: {
          inApp: input.inApp,
        },
      })
    } catch {
      markDbOffline()
    }
  }
}

/**
 * Returns summary counts for user header badge / bell icon.
 */
export async function getNotificationSummary(
  caller: UserContext
): Promise<{ unreadCount: number; criticalCount: number }> {
  const items = await listNotificationsForUser(caller, { unreadOnly: true })
  const criticalCount = items.filter((i) => i.severity === 'CRITICAL').length

  return {
    unreadCount: items.length,
    criticalCount,
  }
}

