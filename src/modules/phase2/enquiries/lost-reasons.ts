/**
 * CPA Cricket Academy CRM — Lost Reasons Catalogue (D-01, W2-9, DB-PHASE-2 § 3.5)
 */

export interface LostReasonItem {
  id: string
  code: string
  label: string
  sortOrder: number
  active: boolean
}

export const SEEDED_LOST_REASONS: LostReasonItem[] = [
  { id: 'lr-price', code: 'PRICE', label: 'Fees / price too high', sortOrder: 1, active: true },
  { id: 'lr-location', code: 'LOCATION_DISTANCE', label: 'Location or distance too far', sortOrder: 2, active: true },
  { id: 'lr-timing', code: 'TIMING_MISMATCH', label: 'Batch timing does not suit school schedule', sortOrder: 3, active: true },
  { id: 'lr-joined-elsewhere', code: 'JOINED_ELSEWHERE', label: 'Joined another cricket academy', sortOrder: 4, active: true },
  { id: 'lr-not-interested', code: 'NOT_INTERESTED', label: 'Child or parent not interested', sortOrder: 5, active: true },
  { id: 'lr-no-response', code: 'NO_RESPONSE', label: 'Unreachable / no response after multiple attempts', sortOrder: 6, active: true },
  { id: 'lr-duplicate', code: 'DUPLICATE', label: 'Duplicate record / merged into existing cadet', sortOrder: 7, active: true },
  { id: 'lr-other', code: 'OTHER', label: 'Other (see notes)', sortOrder: 8, active: true },
]

export function getLostReasons(): LostReasonItem[] {
  return SEEDED_LOST_REASONS.filter((r) => r.active)
}

export function isValidLostReason(reasonIdOrCode: string): boolean {
  return SEEDED_LOST_REASONS.some(
    (r) => (r.id === reasonIdOrCode || r.code === reasonIdOrCode) && r.active
  )
}

