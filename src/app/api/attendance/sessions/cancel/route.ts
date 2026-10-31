import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { cancelSession } from '@/services/attendance.service'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { batchId, date, reason } = body

    if (!batchId || !date || !reason || reason.trim().length < 3) {
      return NextResponse.json(
        { error: 'batchId, date, and reason (min 3 chars) are required' },
        { status: 400 }
      )
    }

    const result = await cancelSession(user, { batchId, date, reason: reason.trim() })
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 400 })
  }
}
