import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { createFollowUp, listFollowUps } from '@/modules/phase2'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const followUps = await listFollowUps(user, { enquiryId: params.id })
    return NextResponse.json({ success: true, followUps })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const result = await createFollowUp(user, {
      enquiryId: params.id,
      dueAt: body.dueAt,
      channel: body.channel,
      note: body.note,
      sendWhatsAppNow: Boolean(body.sendWhatsAppNow),
      branchName: body.branchName,
    })

    return NextResponse.json({ success: true, ...result }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 400 })
  }
}

