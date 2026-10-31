import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { logAudit } from '@/lib/audit'

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1'

    if (session.userId) {
      await logAudit({
        actorId: session.userId,
        branchId: session.branchId,
        action: 'user.logout',
        entityType: 'User',
        entityId: session.userId,
        reason: 'User logged out',
        ip,
      })
    }

    session.destroy()
    return NextResponse.json({ success: true, message: 'Logged out successfully' })
  } catch (error) {
    console.error('Logout error:', error)
    return NextResponse.json({ error: 'Failed to logout' }, { status: 500 })
  }
}
