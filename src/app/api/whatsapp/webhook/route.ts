import { NextRequest, NextResponse } from 'next/server'
import { handleInboundReply } from '@/services/whatsapp.service'

export const dynamic = 'force-dynamic'

/**
 * GET: Webhook verification challenge for Meta WhatsApp Cloud API
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'cpa_academy_webhook_secret'

  if (mode === 'subscribe' && token === verifyToken) {
    return new NextResponse(challenge, { status: 200 })
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

/**
 * POST: Incoming WhatsApp webhook payload (messages, status updates)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // 1. Direct API payload (for internal simulation or custom proxy)
    if (body.fromPhone && body.text) {
      const result = await handleInboundReply({
        fromPhone: body.fromPhone,
        body: body.text,
        branchId: body.branchId,
      })
      return NextResponse.json({ success: true, ...result })
    }

    // 2. Standard Meta Cloud API webhook structure
    const entry = body.entry?.[0]
    const changes = entry?.changes?.[0]
    const value = changes?.value

    if (value?.messages?.[0]) {
      const inbound = value.messages[0]
      const fromPhone = '+' + inbound.from
      const text = inbound.text?.body || ''

      const result = await handleInboundReply({
        fromPhone,
        body: text,
      })
      return NextResponse.json({ success: true, ...result })
    }

    return NextResponse.json({ received: true })
  } catch (err: any) {
    console.error('WhatsApp Webhook error:', err)
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}

