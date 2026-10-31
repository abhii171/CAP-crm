import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getSessionsForDate, submitSessionAttendance } from '@/services/attendance.service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const date = searchParams.get('date') || undefined
    const branchId = searchParams.get('branchId') || undefined

    const sessions = await getSessionsForDate(user, date, branchId)
    return NextResponse.json({ success: true, sessions })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { batchId, date, records } = body

    if (!batchId || !date || !Array.isArray(records)) {
      return NextResponse.json(
        { error: 'batchId, date, and records array are required' },
        { status: 400 }
      )
    }

    const result = await submitSessionAttendance(user, { batchId, date, records })
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 400 })
  }
}
