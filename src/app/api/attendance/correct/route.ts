import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { managerCorrectAttendance } from '@/services/attendance.service'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { sessionId, studentId, newStatus, reason } = body

    if (!sessionId || !studentId || !newStatus || !reason) {
      return NextResponse.json(
        { error: 'sessionId, studentId, newStatus, and reason are required' },
        { status: 400 }
      )
    }

    const result = await managerCorrectAttendance(user, {
      sessionId,
      studentId,
      newStatus,
      reason: reason.trim(),
    })

    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 400 })
  }
}
