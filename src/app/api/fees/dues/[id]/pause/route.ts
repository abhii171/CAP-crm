import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { pauseDueReminders } from '@/services/fee.service'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { pauseUntil, reason } = body

    if (!pauseUntil || !reason) {
      return NextResponse.json(
        { error: 'pauseUntil date and reason are required' },
        { status: 400 }
      )
    }

    const due = await pauseDueReminders(user, params.id, pauseUntil, reason)
    return NextResponse.json({ success: true, due })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 400 })
  }
}

