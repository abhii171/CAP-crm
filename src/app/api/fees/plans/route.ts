import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { listFeePlans, createFeePlan } from '@/services/fee.service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const branchId = searchParams.get('branchId') || undefined

    const plans = await listFeePlans(user, branchId)
    return NextResponse.json({ success: true, plans })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { name, amountPaise, frequency, branchId } = body

    if (!name || !amountPaise || !frequency) {
      return NextResponse.json(
        { error: 'name, amountPaise, and frequency are required' },
        { status: 400 }
      )
    }

    const plan = await createFeePlan(user, {
      name,
      amountPaise: Number(amountPaise),
      frequency,
      branchId,
    })

    return NextResponse.json({ success: true, plan }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 400 })
  }
}

