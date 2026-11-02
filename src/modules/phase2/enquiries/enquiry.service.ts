import { prisma, isDbAvailable, markDbOffline } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { UserContext, authorize, RecordNotFoundError, PermissionDeniedError } from '@/lib/rbac'
import { assertBranchAccess } from '@/lib/branch-query'
import { isFeatureEnabled } from '../flags/feature-flags.service'
import { normalizePhone, isValidE164Phone } from '../utils/phone'
import { loadDemoData, saveDemoData } from '@/lib/demo-storage'

export type EnquiryStatus =
  | 'NEW'
  | 'CONTACTED'
  | 'TRIAL_SCHEDULED'
  | 'TRIAL_DONE'
  | 'CONVERTED'
  | 'LOST'

export type EnquirySource =
  | 'WALK_IN'
  | 'PHONE'
  | 'WEBSITE'
  | 'REFERRAL'
  | 'SOCIAL_MEDIA'
  | 'OTHER'

export type EnquiryCreatedVia = 'MANUAL' | 'WEBSITE_FORM'

export interface CreateEnquiryInput {
  branchId: string
  childName: string
  guardianName?: string
  phone: string
  email?: string
  childAgeYears?: number
  interest?: string
  source: EnquirySource
  sourceDetail?: string
  status?: EnquiryStatus
  assignedToUserId?: string
  firstFollowUpAt?: string
  whatsappConsent?: boolean
  consentTextVersion?: string
  createdVia?: EnquiryCreatedVia
}

export interface EnquiryRecord {
  id: string
  branchId: string
  childName: string
  guardianName?: string | null
  phone: string
  phoneNormalized: string
  email?: string | null
  childAgeYears?: number | null
  interest?: string | null
  source: EnquirySource
  sourceDetail?: string | null
  createdVia: EnquiryCreatedVia
  status: EnquiryStatus
  assignedToUserId?: string | null
  lostReasonId?: string | null
  lostNote?: string | null
  nextFollowUpAt?: string | null
  lastContactedAt?: string | null
  possibleDuplicate: boolean
  mergedIntoId?: string | null
  convertedStudentId?: string | null
  convertedAt?: string | null
  createdByUserId?: string | null
  anonymizedAt?: string | null
  version: number
  createdAt: string
  updatedAt: string
}

export interface DuplicateMatch {
  type: 'ENQUIRY' | 'STUDENT'
  id: string
  name: string
  phone: string
  branchId: string
  status: string
}

export interface DuplicateCheckResult {
  hasDuplicate: boolean
  matches: DuplicateMatch[]
}

// In-memory demo buffer for fallback / offline test resiliency with disk persistence
let demoEnquiries: EnquiryRecord[] = loadDemoData('enquiries', [])
let demoEnquiryConsents: any[] = loadDemoData('enquiry-consents', [])
let demoEnquiryHistory: any[] = loadDemoData('enquiry-history', [])

export function resetDemoEnquiries(): void {
  demoEnquiries = []
  demoEnquiryConsents = []
  demoEnquiryHistory = []
  saveDemoData('enquiries', demoEnquiries)
  saveDemoData('enquiry-consents', demoEnquiryConsents)
  saveDemoData('enquiry-history', demoEnquiryHistory)
}

export function updateDemoEnquiryStage(
  enquiryId: string,
  updates: Partial<EnquiryRecord>
): void {
  if (demoEnquiries.length === 0) {
    demoEnquiries = loadDemoData('enquiries', [])
  }

  const item = demoEnquiries.find((e) => e.id === enquiryId)
  if (item) {
    Object.assign(item, updates)
  } else {
    demoEnquiries.unshift({ id: enquiryId, ...updates } as any)
  }
  saveDemoData('enquiries', demoEnquiries)
}

/**
 * Checks for duplicates against both existing Enquiries and existing Students (E-3, W2-1).
 * Matches by normalised E.164 phone number.
 */
export async function checkEnquiryDuplicates(
  phone: string,
  branchId?: string
): Promise<DuplicateCheckResult> {
  const normPhone = normalizePhone(phone)
  if (!normPhone) {
    return { hasDuplicate: false, matches: [] }
  }

  const matches: DuplicateMatch[] = []

  // 1. Check existing Enquiries
  if (isDbAvailable()) {
    try {
      const existingEnqs = await prisma.enquiry.findMany({
        where: {
          phoneNormalized: normPhone,
          status: { notIn: ['CONVERTED'] },
        },
        select: { id: true, childName: true, phoneNormalized: true, branchId: true, status: true },
      })
      for (const e of existingEnqs) {
        matches.push({
          type: 'ENQUIRY',
          id: e.id,
          name: e.childName,
          phone: e.phoneNormalized,
          branchId: e.branchId,
          status: e.status,
        })
      }
    } catch {
      markDbOffline()
    }
  }

  // Check demo enquiries buffer
  for (const e of demoEnquiries) {
    if (e.phoneNormalized === normPhone && e.status !== 'CONVERTED') {
      if (!matches.some((m) => m.type === 'ENQUIRY' && m.id === e.id)) {
        matches.push({
          type: 'ENQUIRY',
          id: e.id,
          name: e.childName,
          phone: e.phoneNormalized,
          branchId: e.branchId,
          status: e.status,
        })
      }
    }
  }

  // 2. Check existing Students / Guardians
  if (isDbAvailable()) {
    try {
      const guardians = await prisma.guardian.findMany({
        where: { whatsappNumber: normPhone },
        include: {
          students: { select: { id: true, name: true, branchId: true, status: true } },
        },
      })
      for (const g of guardians) {
        for (const s of g.students) {
          matches.push({
            type: 'STUDENT',
            id: s.id,
            name: s.name,
            phone: g.whatsappNumber,
            branchId: s.branchId,
            status: s.status,
          })
        }
      }
    } catch {
      markDbOffline()
    }
  }

  // Check demo students fallback
  try {
    const demoStudents = loadDemoData('students', [])
    const last10Digits = normPhone.replace(/\D/g, '').slice(-10)

    for (const s of demoStudents as any[]) {
      const gPhone = (s.guardianPhone || s.emergencyPhone || s.guardian?.whatsappNumber || '').replace(/\D/g, '').slice(-10)
      if (gPhone && gPhone === last10Digits) {
        if (!matches.some((m) => m.type === 'STUDENT' && m.id === s.id)) {
          matches.push({
            type: 'STUDENT',
            id: s.id,
            name: s.name,
            phone: s.guardianPhone || s.emergencyPhone || s.guardian?.whatsappNumber || normPhone,
            branchId: s.branchId,
            status: s.status,
          })
        }
      }
    }
  } catch {}

  return {
    hasDuplicate: matches.length > 0,
    matches,
  }
}

/**
 * Creates a new prospective student enquiry (W2-1 for staff, W2-2 for public web form).
 */
export async function createEnquiry(
  caller: UserContext | null,
  input: CreateEnquiryInput
): Promise<EnquiryRecord> {
  const isPublic = !caller

  // 1. Feature Flag Guard (A-12)
  const enabled = await isFeatureEnabled('p2.enquiries', input.branchId)
  if (!enabled) {
    throw new PermissionDeniedError('The enquiries module is not currently enabled for this branch.')
  }

  // 2. Authorization Check (for staff calls)
  if (caller) {
    authorize(caller, 'enquiry:create')
    assertBranchAccess(caller, input.branchId, 'Branch')
  }

  // 3. Validation
  const childName = input.childName?.trim()
  if (!childName) {
    throw new Error('Child name is required.')
  }

  const rawPhone = input.phone?.trim()
  if (!rawPhone) {
    throw new Error('Phone number is required.')
  }

  const normPhone = normalizePhone(rawPhone)
  if (!isValidE164Phone(normPhone)) {
    throw new Error(`Invalid phone number format: '${rawPhone}'. Must be valid mobile number.`)
  }

  // 4. Duplicate Check (E-3)
  const dupCheck = await checkEnquiryDuplicates(normPhone, input.branchId)
  const possibleDuplicate = dupCheck.hasDuplicate

  // 5. Build Record
  const now = new Date().toISOString()
  const enquiryId = `enq-${Date.now()}-${Math.random().toString(36).substring(7)}`
  const assignedUserId = input.assignedToUserId || (caller ? caller.userId : null)
  const createdVia = input.createdVia || (isPublic ? 'WEBSITE_FORM' : 'MANUAL')

  const enquiry: EnquiryRecord = {
    id: enquiryId,
    branchId: input.branchId,
    childName,
    guardianName: input.guardianName?.trim() || null,
    phone: rawPhone,
    phoneNormalized: normPhone,
    email: input.email?.trim() || null,
    childAgeYears: input.childAgeYears ?? null,
    interest: input.interest?.trim() || null,
    source: input.source,
    sourceDetail: input.sourceDetail?.trim() || null,
    createdVia,
    status: input.status || 'NEW',
    assignedToUserId: assignedUserId,
    lostReasonId: null,
    lostNote: null,
    nextFollowUpAt: input.firstFollowUpAt || null,
    lastContactedAt: null,
    possibleDuplicate,
    mergedIntoId: null,
    convertedStudentId: null,
    convertedAt: null,
    createdByUserId: caller ? caller.userId : null,
    anonymizedAt: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
  }

  // 6. Database Write
  if (isDbAvailable()) {
    try {
      await prisma.enquiry.create({
        data: {
          id: enquiry.id,
          branchId: enquiry.branchId,
          childName: enquiry.childName,
          guardianName: enquiry.guardianName,
          phone: enquiry.phone,
          phoneNormalized: enquiry.phoneNormalized,
          email: enquiry.email,
          childAgeYears: enquiry.childAgeYears,
          interest: enquiry.interest,
          source: enquiry.source,
          sourceDetail: enquiry.sourceDetail,
          createdVia: enquiry.createdVia,
          status: enquiry.status,
          assignedToUserId: enquiry.assignedToUserId,
          nextFollowUpAt: enquiry.nextFollowUpAt ? new Date(enquiry.nextFollowUpAt) : null,
          possibleDuplicate: enquiry.possibleDuplicate,
          createdByUserId: enquiry.createdByUserId,
          version: enquiry.version,
        },
      })

      // Initial stage history
      await prisma.enquiryStageHistory.create({
        data: {
          enquiryId: enquiry.id,
          fromStatus: null,
          toStatus: 'NEW',
          changedByUserId: caller ? caller.userId : null,
          note: isPublic ? 'Submitted via public website form' : 'Initial enquiry captured',
        },
      })

      // Consent record if provided
      if (input.whatsappConsent) {
        await prisma.enquiryConsent.create({
          data: {
            enquiryId: enquiry.id,
            channel: 'WHATSAPP',
            grantedAt: new Date(),
            captureMethod: isPublic ? 'FORM_CHECKBOX' : 'STAFF_RECORDED',
            textVersion: input.consentTextVersion || 'v1.0',
            recordedByUserId: caller ? caller.userId : null,
          },
        })
      }
    } catch {
      markDbOffline()
    }
  }

  demoEnquiries.unshift(enquiry)
  saveDemoData('enquiries', demoEnquiries)

  // 7. Audit Log (No personal data in logs: A-10, A-15)
  await logAudit({
    actorId: caller?.userId || null,
    branchId: input.branchId,
    action: isPublic ? 'p2.enquiry.create_public' : 'p2.enquiry.create',
    entityType: 'Enquiry',
    entityId: enquiry.id,
    after: {
      enquiryId: enquiry.id,
      branchId: enquiry.branchId,
      source: enquiry.source,
      createdVia: enquiry.createdVia,
      possibleDuplicate: enquiry.possibleDuplicate,
    },
    reason: isPublic ? 'Public website enquiry submission' : 'Manual staff enquiry capture',
  })

  return enquiry
}

/**
 * Lists enquiries within the caller's authorized branch scope.
 */
export async function listEnquiries(
  caller: UserContext,
  filters?: {
    branchId?: string
    status?: EnquiryStatus
    assignedToUserId?: string
    search?: string
  }
): Promise<EnquiryRecord[]> {
  authorize(caller, 'enquiry:read')

  const effectiveBranchId = caller.role === 'ADMIN' ? filters?.branchId : caller.branchId
  if (caller.role !== 'ADMIN' && caller.branchId) {
    assertBranchAccess(caller, caller.branchId, 'Branch')
  }

  if (isDbAvailable()) {
    try {
      const where: any = {}
      if (effectiveBranchId) where.branchId = effectiveBranchId
      if (filters?.status) where.status = filters.status
      if (filters?.assignedToUserId) where.assignedToUserId = filters.assignedToUserId

      const records = await prisma.enquiry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      })

      if (records.length > 0) {
        return records.map((r) => ({
          ...r,
          nextFollowUpAt: r.nextFollowUpAt ? r.nextFollowUpAt.toISOString() : null,
          lastContactedAt: r.lastContactedAt ? r.lastContactedAt.toISOString() : null,
          convertedAt: r.convertedAt ? r.convertedAt.toISOString() : null,
          anonymizedAt: r.anonymizedAt ? r.anonymizedAt.toISOString() : null,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        }))
      }
    } catch {
      markDbOffline()
    }
  }

  // Filter demo store
  if (demoEnquiries.length === 0) {
    demoEnquiries = loadDemoData('enquiries', [])
  }
  return demoEnquiries.filter((e) => {
    if (effectiveBranchId && e.branchId !== effectiveBranchId) return false
    if (filters?.status && e.status !== filters.status) return false
    if (filters?.assignedToUserId && e.assignedToUserId !== filters.assignedToUserId) return false
    if (filters?.search) {
      const q = filters.search.toLowerCase()
      return e.childName.toLowerCase().includes(q) || e.phone.includes(q)
    }
    return true
  })
}

/**
 * Retrieves a single enquiry with branch-scope security enforcement.
 */
export async function getEnquiryById(
  caller: UserContext,
  enquiryId: string
): Promise<EnquiryRecord> {
  authorize(caller, 'enquiry:read')

  if (isDbAvailable()) {
    try {
      const record = await prisma.enquiry.findUnique({
        where: { id: enquiryId },
      })
      if (record) {
        assertBranchAccess(caller, record.branchId, 'Enquiry')
        return {
          ...record,
          nextFollowUpAt: record.nextFollowUpAt ? record.nextFollowUpAt.toISOString() : null,
          lastContactedAt: record.lastContactedAt ? record.lastContactedAt.toISOString() : null,
          convertedAt: record.convertedAt ? record.convertedAt.toISOString() : null,
          anonymizedAt: record.anonymizedAt ? record.anonymizedAt.toISOString() : null,
          createdAt: record.createdAt.toISOString(),
          updatedAt: record.updatedAt.toISOString(),
        }
      }
    } catch {
      markDbOffline()
    }
  }

  if (demoEnquiries.length === 0) {
    demoEnquiries = loadDemoData('enquiries', [])
  }

  const item = demoEnquiries.find((e) => e.id === enquiryId)
  if (!item) {
    throw new RecordNotFoundError('Enquiry')
  }

  assertBranchAccess(caller, item.branchId, 'Enquiry')
  return item
}
