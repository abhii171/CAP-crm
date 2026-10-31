import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { listUsers, createUser } from '@/services/user.service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const role = (searchParams.get('role') as any) || undefined
    const branchId = searchParams.get('branchId') || undefined

    const users = await listUsers(user, { role, branchId })
    return NextResponse.json({ success: true, users })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const result = await createUser(user, body)
    return NextResponse.json({ success: true, ...result }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 400 })
  }
}

