import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { reversePayment, listPendingReversals } from '@/services/payment.service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const list = await listPendingReversals(user)
    return NextResponse.json({ pendingReversals: list })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 400 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { paymentId, reason } = body

    if (!paymentId || !reason) {
      return NextResponse.json({ error: 'paymentId and reason are required' }, { status: 400 })
    }

    const result = await reversePayment(user, { paymentId, reason })
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 400 })
  }
}

