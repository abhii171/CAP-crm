import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { listStudents, admitStudent } from '@/services/student.service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const branchId = searchParams.get('branchId') || undefined
    const status = (searchParams.get('status') as any) || undefined
    const batchId = searchParams.get('batchId') || undefined
    const search = searchParams.get('search') || undefined

    const students = await listStudents(user, { branchId, status, batchId, search })
    return NextResponse.json({ success: true, students })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const student = await admitStudent(user, body)
    return NextResponse.json({ success: true, student }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 400 })
  }
}

