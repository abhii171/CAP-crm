import { NextRequest, NextResponse } from 'next/server'
import { createEnquiry, isFeatureEnabled } from '@/modules/phase2'

export const dynamic = 'force-dynamic'

// In-memory sliding window rate limiter (max 5 submissions per minute per IP / phone)
const rateLimitMap: Map<string, number[]> = new Map()

function isRateLimited(identifier: string, limit = 5, windowMs = 60000): boolean {
  const now = Date.now()
  const timestamps = (rateLimitMap.get(identifier) || []).filter((t) => now - t < windowMs)
  if (timestamps.length >= limit) {
    return true
  }
  timestamps.push(now)
  rateLimitMap.set(identifier, timestamps)
  return false
}

export async function POST(req: NextRequest) {
  try {
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1'

    // Rate-limit by client IP
    if (isRateLimited(`ip:${clientIp}`, 5, 60000)) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again after one minute.' },
        { status: 429 }
      )
    }

    const body = await req.json()

    // 1. Honeypot check (A-10): silent discard for bots
    if (body.website_hp || body.fax_number) {
      return NextResponse.json({
        success: true,
        message: 'Thank you for your enquiry. Our academy manager will contact you shortly.',
      })
    }

    const branchId = body.branchId?.trim()
    if (!branchId) {
      return NextResponse.json({ error: 'Please select an academy branch.' }, { status: 400 })
    }

    // 2. Feature Flag Guard (A-12)
    const enabled = await isFeatureEnabled('p2.enquiries', branchId)
    if (!enabled) {
      return NextResponse.json(
        { error: 'Online enquiries are temporarily unavailable for this branch.' },
        { status: 404 }
      )
    }

    const rawPhone = body.phone?.trim()
    if (!rawPhone) {
      return NextResponse.json({ error: 'Phone number is required.' }, { status: 400 })
    }

    // Rate-limit by phone number
    if (isRateLimited(`phone:${rawPhone}`, 3, 60000)) {
      return NextResponse.json(
        { error: 'Too many submissions for this phone number. Please try again later.' },
        { status: 429 }
      )
    }

    // 3. Captcha stub verification (D-13 default: allow unless explicit invalid token)
    if (body.captchaToken === 'invalid_token') {
      return NextResponse.json({ error: 'Captcha validation failed. Please refresh and try again.' }, { status: 400 })
    }

    // 4. Create enquiry via service
    await createEnquiry(null, {
      branchId,
      childName: body.childName,
      guardianName: body.guardianName,
      phone: rawPhone,
      email: body.email,
      childAgeYears: body.childAgeYears ? Number(body.childAgeYears) : undefined,
      interest: body.interest,
      source: 'WEBSITE',
      sourceDetail: 'Public Website Intake Form',
      whatsappConsent: Boolean(body.whatsappConsent),
      consentTextVersion: 'web_v1.0',
      createdVia: 'WEBSITE_FORM',
    })

    // 5. Response: Generic acknowledgment only. Strictly never leak internal record IDs or duplicate status (A-10)
    return NextResponse.json({
      success: true,
      message: 'Thank you for your enquiry! A coach or manager from CPA Cricket Academy will contact you shortly.',
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unable to process enquiry.' }, { status: 400 })
  }
}

