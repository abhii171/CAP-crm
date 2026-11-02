import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { listBranches, createBranch } from '@/services/branch.service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const archived = searchParams.get('archived') === 'true' || searchParams.get('status') === 'archived'
    const all = searchParams.get('status') === 'all'

    const branches = await listBranches(user, {
      onlyArchived: archived,
      includeArchived: all,
    })
    return NextResponse.json({ success: true, branches })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const branch = await createBranch(user, body)
    return NextResponse.json({ success: true, branch }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 400 })
  }
}

