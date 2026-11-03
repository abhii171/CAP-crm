import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { assignEnquiry } from '@/modules/phase2/enquiries/enquiry-assignment.service'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    if (!body.newUserId) {
      return NextResponse.json({ error: 'newUserId is required' }, { status: 400 })
    }

    const result = await assignEnquiry(user, params.id, body.newUserId, body.note)
    return NextResponse.json({ success: true, ...result })
  } catch (err: any) {
    const status = err.statusCode === 403 ? 403 : err.statusCode === 404 ? 404 : 400
    return NextResponse.json({ error: err.message }, { status })
  }
}

