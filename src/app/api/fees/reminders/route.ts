import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { runFeeReminderScheduler } from '@/services/reminder.service'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const { referenceDate } = body

    const result = await runFeeReminderScheduler(user, referenceDate)
    return NextResponse.json({ success: true, ...result })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 400 })
  }
}

