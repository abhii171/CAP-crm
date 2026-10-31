import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { deactivateUser, reactivateUser, resetUserPassword } from '@/services/user.service'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { action, reason } = body

    if (action === 'deactivate') {
      await deactivateUser(user, params.id, reason)
      return NextResponse.json({ success: true, message: 'User deactivated' })
    } else if (action === 'reactivate') {
      await reactivateUser(user, params.id)
      return NextResponse.json({ success: true, message: 'User reactivated' })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 400 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const result = await resetUserPassword(user, params.id)
    return NextResponse.json({ success: true, ...result })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 400 })
  }
}

