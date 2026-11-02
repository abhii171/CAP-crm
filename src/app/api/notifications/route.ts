import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import {
  listNotificationsForUser,
  getNotificationSummary,
  markNotificationRead,
  markAllNotificationsRead,
  dismissNotification,
  updateNotificationPreference,
} from '@/modules/phase2'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const unreadOnly = req.nextUrl.searchParams.get('unreadOnly') === 'true'
    const limit = Number(req.nextUrl.searchParams.get('limit')) || 50

    const notifications = await listNotificationsForUser(user, { unreadOnly, limit })
    const summary = await getNotificationSummary(user)

    return NextResponse.json({ notifications, summary })
  } catch (err: any) {
    const status = err.statusCode || (err.name === 'PermissionDeniedError' ? 403 : 400)
    return NextResponse.json({ error: err.message }, { status })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { action } = body

    if (action === 'mark_read') {
      await markNotificationRead(user, body.notificationId)
      return NextResponse.json({ success: true })
    }

    if (action === 'mark_all_read') {
      const count = await markAllNotificationsRead(user)
      return NextResponse.json({ success: true, count })
    }

    if (action === 'dismiss') {
      await dismissNotification(user, body.notificationId)
      return NextResponse.json({ success: true })
    }

    if (action === 'preference') {
      await updateNotificationPreference(user, {
        eventType: body.eventType,
        inApp: Boolean(body.inApp),
      })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid notification action' }, { status: 400 })
  } catch (err: any) {
    const status = err.statusCode || (err.name === 'PermissionDeniedError' ? 403 : 400)
    return NextResponse.json({ error: err.message }, { status })
  }
}

