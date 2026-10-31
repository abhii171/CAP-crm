import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { recordCashPayment } from '@/services/payment.service'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { branchId, studentId, amountPaise, businessDate, allocations, note } = body

    if (!branchId || !studentId || !amountPaise) {
      return NextResponse.json(
        { error: 'branchId, studentId, and amountPaise are required' },
        { status: 400 }
      )
    }

    const result = await recordCashPayment(user, {
      branchId,
      studentId,
      amountPaise: Number(amountPaise),
      businessDate,
      allocations,
      note,
    })

    return NextResponse.json({ success: true, ...result }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 400 })
  }
}

