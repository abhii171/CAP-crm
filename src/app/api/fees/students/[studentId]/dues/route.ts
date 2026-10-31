import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { listStudentDues, assignStudentFeePlan } from '@/services/fee.service'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { studentId: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const dues = await listStudentDues(user, params.studentId)
    return NextResponse.json({ success: true, dues })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { studentId: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { feePlanId, startDate, amountOverridePaise } = body

    if (!feePlanId || !startDate) {
      return NextResponse.json(
        { error: 'feePlanId and startDate are required' },
        { status: 400 }
      )
    }

    const result = await assignStudentFeePlan(user, {
      studentId: params.studentId,
      feePlanId,
      startDate,
      amountOverridePaise: amountOverridePaise ? Number(amountOverridePaise) : null,
    })

    return NextResponse.json({ success: true, ...result }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 400 })
  }
}

