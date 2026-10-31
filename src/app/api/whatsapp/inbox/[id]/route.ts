import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { updateInboxMessageStatus, replyToInboxMessage } from '@/services/notice.service'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { status } = body

    if (!status) {
      return NextResponse.json({ error: 'status is required' }, { status: 400 })
    }

    const result = await updateInboxMessageStatus(user, {
      messageId: params.id,
      newStatus: status,
    })

    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 400 })
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
    const { replyText, templateName } = body

    if (!replyText) {
      return NextResponse.json({ error: 'replyText is required' }, { status: 400 })
    }

    const result = await replyToInboxMessage(user, {
      messageId: params.id,
      replyText,
      templateName,
    })

    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 400 })
  }
}

