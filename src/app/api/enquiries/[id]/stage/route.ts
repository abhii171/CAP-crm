import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { transitionEnquiryStage } from '@/modules/phase2'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const result = await transitionEnquiryStage(user, {
      enquiryId: params.id,
      toStatus: body.toStatus,
      expectedVersion: body.expectedVersion !== undefined ? Number(body.expectedVersion) : undefined,
      lostReasonId: body.lostReasonId,
      lostNote: body.lostNote,
      note: body.note,
    })

    return NextResponse.json({ success: true, ...result })
  } catch (err: any) {
    const status = err.statusCode || (err.name === 'VersionConflictError' ? 409 : 400)
    return NextResponse.json({ error: err.message }, { status })
  }
}

