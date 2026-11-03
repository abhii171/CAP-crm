import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { listAssignmentHistory } from '@/modules/phase2/enquiries/enquiry-assignment.service'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const history = await listAssignmentHistory(user, params.id)
    return NextResponse.json({ success: true, history })
  } catch (err: any) {
    const status = err.statusCode === 403 ? 403 : err.statusCode === 404 ? 404 : 400
    return NextResponse.json({ error: err.message }, { status })
  }
}

