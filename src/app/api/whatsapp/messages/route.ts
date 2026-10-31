import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { listMessages, queueOutboundMessage } from '@/services/whatsapp.service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const branchId = searchParams.get('branchId') || undefined
    const status = searchParams.get('status') || undefined
    const direction = (searchParams.get('direction') as any) || undefined
    const search = searchParams.get('search') || undefined

    const messages = await listMessages(user, { branchId, status, direction, search })
    return NextResponse.json({ success: true, messages })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { branchId, recipientPhone, templateName, variables } = body

    if (!branchId || !recipientPhone || !templateName) {
      return NextResponse.json(
        { error: 'branchId, recipientPhone, and templateName are required' },
        { status: 400 }
      )
    }

    const message = await queueOutboundMessage(user, {
      branchId,
      recipientPhone,
      templateName,
      variables: variables || {},
      guardianId: body.guardianId,
      studentId: body.studentId,
      relatedType: body.relatedType,
      relatedId: body.relatedId,
    })

    return NextResponse.json({ success: true, message }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 400 })
  }
}

