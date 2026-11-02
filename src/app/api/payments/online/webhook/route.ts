import { NextRequest, NextResponse } from 'next/server'
import {
  processOnlinePaymentWebhook,
  processOnlineRefundWebhook,
  verifyWebhookSignature,
} from '@/services/online-payment.service'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text()
    const signature = req.headers.get('x-razorpay-signature')

    // Reject with 401 if x-razorpay-signature header is missing
    if (!signature) {
      return NextResponse.json({ error: 'Missing webhook signature' }, { status: 401 })
    }

    // Verify HMAC SHA-256 against raw body before any JSON.parse
    const isValid = verifyWebhookSignature(rawBody, signature)
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 })
    }

    let payload: any
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
    }

    const event = payload?.event || 'payment.captured'

    if (event.includes('refund')) {
      const result = await processOnlineRefundWebhook({
        payload,
        signature,
        rawBody,
      })
      return NextResponse.json(result)
    }

    const result = await processOnlinePaymentWebhook({
      payload,
      signature,
      rawBody,
    })

    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 400 })
  }
}

