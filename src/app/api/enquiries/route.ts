import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { listEnquiries, createEnquiry, checkEnquiryDuplicates } from '@/modules/phase2'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const branchId = searchParams.get('branchId') || undefined
    const status = (searchParams.get('status') as any) || undefined
    const assignedToUserId = searchParams.get('assignedToUserId') || undefined
    const search = searchParams.get('search') || undefined

    const checkPhone = searchParams.get('checkPhone')
    if (checkPhone) {
      const dup = await checkEnquiryDuplicates(checkPhone, branchId)
      return NextResponse.json({ success: true, duplicateCheck: dup })
    }

    const enquiries = await listEnquiries(user, { branchId, status, assignedToUserId, search })
    return NextResponse.json({ success: true, enquiries })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    // For Managers, force the branchId to the manager's own branch
    if (user.role === 'MANAGER' && user.branchId) {
      body.branchId = user.branchId
    }

    const enquiry = await createEnquiry(user, body)
    return NextResponse.json({ success: true, enquiry }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 400 })
  }
}

