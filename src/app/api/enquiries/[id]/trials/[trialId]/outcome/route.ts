import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { markTrialOutcome } from '@/modules/phase2'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; trialId: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const trial = await markTrialOutcome(user, {
      trialId: params.trialId,
      status: body.status,
      note: body.note,
    })

    return NextResponse.json({ success: true, trial })
  } catch (err: any) {
    const status = err.statusCode || (err.name === 'RecordNotFoundError' ? 404 : 400)
    return NextResponse.json({ error: err.message }, { status })
  }
}

