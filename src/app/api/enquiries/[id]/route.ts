import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getEnquiryById, updateEnquiry } from '@/modules/phase2'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const enquiry = await getEnquiryById(user, params.id)
    return NextResponse.json({ success: true, enquiry })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 404 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const enquiry = await updateEnquiry(user, params.id, body)
    return NextResponse.json({ success: true, enquiry })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 400 })
  }
}

