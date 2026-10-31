import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { createPaymentLink, listPaymentLinks } from '@/services/online-payment.service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const studentId = req.nextUrl.searchParams.get('studentId') || undefined
    const links = await listPaymentLinks(user, studentId)
    return NextResponse.json({ links })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 400 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { studentId, dueId, amountPaise, description } = body

    if (!studentId || !amountPaise) {
      return NextResponse.json({ error: 'studentId and amountPaise are required' }, { status: 400 })
    }

    const link = await createPaymentLink(user, {
      studentId,
      dueId,
      amountPaise: Number(amountPaise),
      description,
    })

    return NextResponse.json({ success: true, link })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 400 })
  }
}

