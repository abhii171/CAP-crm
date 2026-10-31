import { NextRequest, NextResponse } from 'next/server'
import { processOnlinePaymentWebhook, processOnlineRefundWebhook } from '@/services/online-payment.service'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text()
    const signature = req.headers.get('x-razorpay-signature') || undefined

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
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}

