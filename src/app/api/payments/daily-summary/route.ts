import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getDailySummary } from '@/services/payment.service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const branchId = searchParams.get('branchId') || user.branchId || 'branch-kkp'
    const businessDate = searchParams.get('businessDate') || undefined

    const summary = await getDailySummary(user, branchId, businessDate)
    return NextResponse.json({ success: true, summary })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 500 })
  }
}

