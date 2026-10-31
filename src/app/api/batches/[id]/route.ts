import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getBatchById, updateBatch } from '@/services/batch.service'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const batch = await getBatchById(user, params.id)
    return NextResponse.json({ success: true, batch })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 404 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const updated = await updateBatch(user, params.id, body)
    return NextResponse.json({ success: true, batch: updated })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 400 })
  }
}

