import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { listBatches, createBatch } from '@/services/batch.service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const branchId = searchParams.get('branchId') || undefined
    const archived = searchParams.get('archived') === 'true' || searchParams.get('status') === 'archived'
    const all = searchParams.get('status') === 'all'

    const batches = await listBatches(user, branchId, {
      onlyArchived: archived,
      includeArchived: all,
    })
    return NextResponse.json({ success: true, batches })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const batch = await createBatch(user, body)
    return NextResponse.json({ success: true, batch }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 400 })
  }
}

