import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { closeDay } from '@/services/payment.service'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { branchId, businessDate, countedCashPaise, note } = body

    if (!branchId || !businessDate || countedCashPaise === undefined) {
      return NextResponse.json(
        { error: 'branchId, businessDate, and countedCashPaise are required' },
        { status: 400 }
      )
    }

    const result = await closeDay(user, {
      branchId,
      businessDate,
      countedCashPaise: Number(countedCashPaise),
      note,
    })

    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 400 })
  }
}
