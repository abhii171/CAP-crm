import assert from 'assert'
import crypto from 'crypto'
import { NextRequest } from 'next/server'
import { POST as razorpayWebhookPost } from '../src/app/api/payments/online/webhook/route'
import { POST as whatsappWebhookPost } from '../src/app/api/whatsapp/webhook/route'
import { getSessionSecret } from '../src/lib/session'

async function runSecurityTests() {
  console.log('🧪 Running Phase 1 Security Hardening Automated Tests...')

  const originalRazorpaySecret = process.env.RAZORPAY_WEBHOOK_SECRET
  const originalWhatsAppSecret = process.env.WHATSAPP_APP_SECRET
  const originalSessionSecret = process.env.SESSION_SECRET

  const testRazorpaySecret = 'test_razorpay_secret_key_at_least_32_chars'
  const testWhatsAppSecret = 'test_whatsapp_secret_key_at_least_32_chars'

  try {
    // ==========================================
    // 1. Razorpay Webhook Tests
    // ==========================================
    console.log('\n[1. Razorpay Webhook Hardening]')
    process.env.RAZORPAY_WEBHOOK_SECRET = testRazorpaySecret

    const paymentPayload = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: `pay_sec_${Date.now()}`,
            amount: 500000,
            notes: { branchId: 'branch-kkp' },
          },
        },
      },
    })

    // Test 1.1: Missing signature -> 401
    const reqNoSig = new NextRequest('http://localhost:3000/api/payments/online/webhook', {
      method: 'POST',
      body: paymentPayload,
    })
    const resNoSig = await razorpayWebhookPost(reqNoSig)
    assert.strictEqual(resNoSig.status, 401, 'Missing signature must return 401')
    console.log('  ✓ Missing Razorpay signature returns 401')

    // Test 1.2: Wrong signature -> 401
    const reqWrongSig = new NextRequest('http://localhost:3000/api/payments/online/webhook', {
      method: 'POST',
      headers: { 'x-razorpay-signature': 'invalid_hex_signature_12345' },
      body: paymentPayload,
    })
    const resWrongSig = await razorpayWebhookPost(reqWrongSig)
    assert.strictEqual(resWrongSig.status, 401, 'Invalid signature must return 401')
    console.log('  ✓ Invalid Razorpay signature returns 401')

    // Test 1.3: Valid signature -> 200
    const validRazorpaySig = crypto
      .createHmac('sha256', testRazorpaySecret)
      .update(paymentPayload)
      .digest('hex')

    const reqValidSig = new NextRequest('http://localhost:3000/api/payments/online/webhook', {
      method: 'POST',
      headers: { 'x-razorpay-signature': validRazorpaySig },
      body: paymentPayload,
    })
    const resValidSig = await razorpayWebhookPost(reqValidSig)
    if (resValidSig.status !== 200) {
      const errBody = await resValidSig.json()
      console.error('resValidSig error:', resValidSig.status, errBody)
    }
    assert.strictEqual(resValidSig.status, 200, 'Valid signature must return 200')
    const validData = await resValidSig.json()
    assert.strictEqual(validData.success, true, 'Payment processing succeeded')
    console.log('  ✓ Valid Razorpay signature returns 200')

    // Test 1.4: Idempotency -> duplicate event returns already processed
    const reqDuplicate = new NextRequest('http://localhost:3000/api/payments/online/webhook', {
      method: 'POST',
      headers: { 'x-razorpay-signature': validRazorpaySig },
      body: paymentPayload,
    })
    const resDuplicate = await razorpayWebhookPost(reqDuplicate)
    assert.strictEqual(resDuplicate.status, 200, 'Duplicate payment returns 200')
    const dupData = await resDuplicate.json()
    assert.strictEqual(dupData.status, 'ALREADY_PROCESSED', 'Duplicate payment marked ALREADY_PROCESSED')
    console.log('  ✓ Duplicate payment is idempotent (ALREADY_PROCESSED)')

    // Test 1.5: Missing secret -> fails closed (401)
    delete process.env.RAZORPAY_WEBHOOK_SECRET
    const reqNoSecret = new NextRequest('http://localhost:3000/api/payments/online/webhook', {
      method: 'POST',
      headers: { 'x-razorpay-signature': validRazorpaySig },
      body: paymentPayload,
    })
    const resNoSecret = await razorpayWebhookPost(reqNoSecret)
    assert.strictEqual(resNoSecret.status, 401, 'Unset secret must fail closed with 401')
    console.log('  ✓ Unset RAZORPAY_WEBHOOK_SECRET fails closed with 401')

    // ==========================================
    // 2. WhatsApp Webhook Tests
    // ==========================================
    console.log('\n[2. WhatsApp Webhook Hardening]')
    process.env.WHATSAPP_APP_SECRET = testWhatsAppSecret

    const waPayload = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: '1234567890', phone_number_id: '123' },
                messages: [{ from: '919876543210', id: 'wamid.123', timestamp: '1234567', text: { body: 'Hello' }, type: 'text' }],
              },
              field: 'messages',
            },
          ],
        },
      ],
    })

    // Test 2.1: Missing signature -> 401
    const reqWaNoSig = new NextRequest('http://localhost:3000/api/whatsapp/webhook', {
      method: 'POST',
      body: waPayload,
    })
    const resWaNoSig = await whatsappWebhookPost(reqWaNoSig)
    assert.strictEqual(resWaNoSig.status, 401, 'Missing WhatsApp signature must return 401')
    console.log('  ✓ Missing WhatsApp signature returns 401')

    // Test 2.2: Wrong signature -> 401
    const reqWaWrongSig = new NextRequest('http://localhost:3000/api/whatsapp/webhook', {
      method: 'POST',
      headers: { 'x-hub-signature-256': 'sha256=invalidhex12345' },
      body: waPayload,
    })
    const resWaWrongSig = await whatsappWebhookPost(reqWaWrongSig)
    assert.strictEqual(resWaWrongSig.status, 401, 'Invalid WhatsApp signature must return 401')
    console.log('  ✓ Invalid WhatsApp signature returns 401')

    // Test 2.3: Valid signature -> 200
    const validWaHex = crypto
      .createHmac('sha256', testWhatsAppSecret)
      .update(waPayload)
      .digest('hex')

    const reqWaValidSig = new NextRequest('http://localhost:3000/api/whatsapp/webhook', {
      method: 'POST',
      headers: { 'x-hub-signature-256': `sha256=${validWaHex}` },
      body: waPayload,
    })
    const resWaValidSig = await whatsappWebhookPost(reqWaValidSig)
    assert.strictEqual(resWaValidSig.status, 200, 'Valid WhatsApp signature must return 200')
    console.log('  ✓ Valid WhatsApp signature returns 200')

    // Test 2.4: Missing secret -> fails closed (401)
    delete process.env.WHATSAPP_APP_SECRET
    const reqWaNoSecret = new NextRequest('http://localhost:3000/api/whatsapp/webhook', {
      method: 'POST',
      headers: { 'x-hub-signature-256': `sha256=${validWaHex}` },
      body: waPayload,
    })
    const resWaNoSecret = await whatsappWebhookPost(reqWaNoSecret)
    assert.strictEqual(resWaNoSecret.status, 401, 'Unset secret must fail closed with 401')
    console.log('  ✓ Unset WHATSAPP_APP_SECRET fails closed with 401')

    // ==========================================
    // 3. Session Secret Hardening Tests
    // ==========================================
    console.log('\n[3. Session Secret Hardening]')

    // Test 3.1: Missing secret throws
    delete process.env.SESSION_SECRET
    let caughtMissing = false
    try {
      getSessionSecret()
    } catch (err: any) {
      caughtMissing = true
      assert(err.message.includes('SESSION_SECRET'), 'Error mentions SESSION_SECRET')
    }
    assert(caughtMissing, 'Missing SESSION_SECRET must throw error')
    console.log('  ✓ Missing SESSION_SECRET throws descriptive error')

    // Test 3.2: Short secret (< 32 chars) throws
    process.env.SESSION_SECRET = 'too-short-secret'
    let caughtShort = false
    try {
      getSessionSecret()
    } catch (err: any) {
      caughtShort = true
      assert(err.message.includes('at least 32 characters'), 'Error mentions min 32 chars')
    }
    assert(caughtShort, 'Short SESSION_SECRET (<32) must throw error')
    console.log('  ✓ Short SESSION_SECRET (<32 chars) throws error')

    // Test 3.3: Valid secret (>= 32 chars) succeeds
    process.env.SESSION_SECRET = 'a_very_secure_random_key_that_is_at_least_32_chars_long!'
    const secret = getSessionSecret()
    assert.strictEqual(secret, process.env.SESSION_SECRET)
    console.log('  ✓ Valid SESSION_SECRET (>=32 chars) accepted')

    console.log('\n==================================================')
    console.log('🎉 All Phase 1 Security Hardening Tests Passed!')
    console.log('==================================================\n')
  } finally {
    // Restore original env vars
    if (originalRazorpaySecret !== undefined) {
      process.env.RAZORPAY_WEBHOOK_SECRET = originalRazorpaySecret
    } else {
      delete process.env.RAZORPAY_WEBHOOK_SECRET
    }

    if (originalWhatsAppSecret !== undefined) {
      process.env.WHATSAPP_APP_SECRET = originalWhatsAppSecret
    } else {
      delete process.env.WHATSAPP_APP_SECRET
    }

    if (originalSessionSecret !== undefined) {
      process.env.SESSION_SECRET = originalSessionSecret
    } else {
      delete process.env.SESSION_SECRET
    }
  }
}

runSecurityTests().catch((err) => {
  console.error('❌ Security tests failed:', err)
  process.exit(1)
})
