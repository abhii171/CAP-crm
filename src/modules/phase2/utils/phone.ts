/**
 * E.164 Phone Normalisation & Validation Helper (A-11, W2-1)
 * CPA Cricket Academy operates in India (+91) with standard 10-digit mobile numbers.
 */

export function normalizePhone(rawPhone: string, defaultCountryCode = '+91'): string {
  if (!rawPhone) return ''

  // 1. Strip all non-digit characters except leading plus
  let cleaned = rawPhone.trim().replace(/[^\d+]/g, '')

  // 2. Handle already prefixed E.164 (+91...)
  if (cleaned.startsWith('+')) {
    return cleaned
  }

  // 3. Handle Indian leading 0 (e.g. 09876543210 -> +919876543210)
  if (cleaned.startsWith('0') && cleaned.length === 11) {
    return defaultCountryCode + cleaned.substring(1)
  }

  // 4. Handle 12-digit Indian number without plus (e.g. 919876543210 -> +919876543210)
  if (cleaned.startsWith('91') && cleaned.length === 12) {
    return '+' + cleaned
  }

  // 5. Handle standard 10-digit number (e.g. 9876543210 -> +919876543210)
  if (cleaned.length === 10) {
    return defaultCountryCode + cleaned
  }

  // Fallback: prepend default country code if not present
  if (!cleaned.startsWith('+')) {
    return defaultCountryCode + cleaned
  }

  return cleaned
}

/**
 * Validates whether a phone number matches standard E.164 specifications.
 */
export function isValidE164Phone(phone: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(phone)
}

