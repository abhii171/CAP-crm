import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { listTrialGuestsForBatch } from '@/modules/phase2'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const sessionDate = req.nextUrl.searchParams.get('date') || new Date().toISOString().split('T')[0]
    const guests = await listTrialGuestsForBatch(user, params.id, sessionDate)

    return NextResponse.json({ guests })
  } catch (err: any) {
    const status = err.statusCode || (err.name === 'RecordNotFoundError' ? 404 : 400)
    return NextResponse.json({ error: err.message }, { status })
  }
}

