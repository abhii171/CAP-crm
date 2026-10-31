import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { listUnmatchedPayments, resolveUnmatchedPayment } from '@/services/online-payment.service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const list = await listUnmatchedPayments(user)
    return NextResponse.json({ unmatchedPayments: list })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 400 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { unmatchedPaymentId, studentId, note } = body

    if (!unmatchedPaymentId || !studentId) {
      return NextResponse.json({ error: 'unmatchedPaymentId and studentId are required' }, { status: 400 })
    }

    const result = await resolveUnmatchedPayment(user, {
      unmatchedPaymentId,
      studentId,
      note,
    })

    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 400 })
  }
}

