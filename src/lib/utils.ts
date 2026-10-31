import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format paise as Indian Rupee string. e.g. 250000 → "₹2,500" */
export function formatPaise(paise: number): string {
  const rupees = paise / 100
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(rupees)
}

/** Format a date as "29 Oct 2026" */
export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  })
}

/** Format a date as "29/10/26" */
export function formatDateShort(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    timeZone: 'Asia/Kolkata',
  })
}

/** Validate E.164 phone number format */
export function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(phone)
}

/** Mask a phone number for display: +91 98•••• ••10 */
export function maskPhone(phone: string): string {
  if (phone.length < 6) return phone
  return phone.slice(0, 4) + '•'.repeat(phone.length - 6) + phone.slice(-2)
}

/** Get today's date in IST as a Date object (midnight UTC equivalent) */
export function todayIST(): Date {
  const now = new Date()
  const istOffset = 5.5 * 60 * 60 * 1000
  const istDate = new Date(now.getTime() + istOffset)
  return new Date(Date.UTC(istDate.getUTCFullYear(), istDate.getUTCMonth(), istDate.getUTCDate()))
}
