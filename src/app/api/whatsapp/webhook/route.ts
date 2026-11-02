import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { handleInboundReply } from '@/services/whatsapp.service'

export const dynamic = 'force-dynamic'

/**
 * Verifies Meta WhatsApp Cloud API x-hub-signature-256 header ("sha256=<hex>").
 * Fails closed if WHATSAPP_APP_SECRET is not configured.
 */
function verifyWhatsAppWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET
  if (!secret) {
    console.error('WHATSAPP_APP_SECRET is not configured. WhatsApp webhook verification failed closed.')
    return false
  }

  if (!signatureHeader || !rawBody) return false
  if (!signatureHeader.startsWith('sha256=')) return false

  const sigHex = signatureHeader.substring(7)
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex')

  try {
    const sigBuf = Buffer.from(sigHex, 'utf8')
    const expBuf = Buffer.from(expectedSignature, 'utf8')

    if (sigBuf.length !== expBuf.length) {
      return false
    }

    return crypto.timingSafeEqual(sigBuf, expBuf)
  } catch {
    return false
  }
}

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
 * Protected by Meta HMAC SHA-256 signature verification.
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text()
    const signature = req.headers.get('x-hub-signature-256')

    // Reject with 401 if signature header is missing
    if (!signature) {
      return NextResponse.json({ error: 'Missing webhook signature' }, { status: 401 })
    }

    // Verify signature before parsing or acting on the body
    const isValid = verifyWhatsAppWebhookSignature(rawBody, signature)
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 })
    }

    let body: any
    try {
      body = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
    }

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
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 400 })
  }
}

