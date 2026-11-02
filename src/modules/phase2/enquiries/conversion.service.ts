import { prisma, isDbAvailable, markDbOffline } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { UserContext, authorize, RecordNotFoundError, PermissionDeniedError } from '@/lib/rbac'
import { assertBranchAccess } from '@/lib/branch-query'
import { getEnquiryById, EnquiryRecord } from './enquiry.service'
import { admitStudent, StudentListItem, AdmitStudentInput } from '@/services/student.service'

export interface ConvertEnquiryInput {
  enquiryId: string
  batchId: string
  dob: string // YYYY-MM-DD
  gender?: string
  childName?: string
  guardianName?: string
  guardianRelation?: string
  whatsappOptIn?: boolean
  emergencyName?: string
  emergencyPhone?: string
  feePlanId?: string
  notes?: string
  managerOverrideReason?: string
}

/**
 * Converts an enquiry into an active enrolled student via Phase 1 admission (W2-8).
 * Touchpoints used:
 * - T1: enquiry:convert permission check
 * - T3: admission form initialValues forwarded to Phase 1 admitStudent
 * - T4: p2.enquiry.convert audit log
 * 
 * Invariant: Phase 1 admission service is the SOLE author of Student records.
 * Failure Safety: If admission validation fails, the enquiry remains strictly untouched.
 */
export async function convertEnquiryToStudent(
  caller: UserContext,
  input: ConvertEnquiryInput
): Promise<{ student: StudentListItem; enquiry: EnquiryRecord }> {
  authorize(caller, 'enquiry:convert')

  const enquiry = await getEnquiryById(caller, input.enquiryId)
  assertBranchAccess(caller, enquiry.branchId, 'Enquiry')

  // 1. Idempotency Check: cannot convert an already converted enquiry
  if (enquiry.status === 'CONVERTED' || enquiry.convertedStudentId) {
    throw new Error('Enquiry has already been converted to an enrolled student.')
  }

  // 2. Precondition Check: Status must be TRIAL_DONE, or CONTACTED with manager override (W2-8)
  if (enquiry.status !== 'TRIAL_DONE') {
    if (enquiry.status === 'CONTACTED') {
      if (!input.managerOverrideReason?.trim()) {
        throw new Error('A reason is required to convert directly from Contacted stage without a completed trial.')
      }
    } else {
      throw new Error(`Cannot convert enquiry from stage ${enquiry.status}. Enquiry must be in TRIAL_DONE stage.`)
    }
  }

  // 3. Assemble Phase 1 Admission Payload (Touchpoint T3)
  const admissionPayload: AdmitStudentInput = {
    branchId: enquiry.branchId,
    name: input.childName?.trim() || enquiry.childName,
    dob: input.dob,
    gender: input.gender,
    guardianName: input.guardianName?.trim() || enquiry.guardianName || 'Guardian',
    whatsappNumber: enquiry.phoneNormalized,
    relationship: input.guardianRelation || 'Parent',
    whatsappOptIn: Boolean(input.whatsappOptIn),
    consentSource: 'admission_form',
    emergencyName: input.emergencyName?.trim(),
    emergencyPhone: input.emergencyPhone?.trim(),
    notes: input.notes?.trim() || (input.managerOverrideReason ? `Direct conversion: ${input.managerOverrideReason}` : undefined),
    batchId: input.batchId,
    feePlanId: input.feePlanId,
  }

  // 4. Invoke Phase 1 Admission Service
  // Note: If admitStudent throws, execution halts here and enquiry state is completely untouched.
  const newStudent = await admitStudent(caller, admissionPayload)

  // 5. Update Enquiry Record (Transactional link)
  const now = new Date().toISOString()
  const oldVersion = enquiry.version
  const newVersion = oldVersion + 1

  enquiry.status = 'CONVERTED'
  enquiry.convertedStudentId = newStudent.id
  enquiry.convertedAt = now
  enquiry.version = newVersion
  enquiry.updatedAt = now

  if (isDbAvailable()) {
    try {
      await prisma.enquiry.update({
        where: { id: enquiry.id },
        data: {
          status: 'CONVERTED',
          convertedStudentId: newStudent.id,
          convertedAt: new Date(now),
          version: newVersion,
        },
      })

      // Append Stage History entry
      await prisma.enquiryStageHistory.create({
        data: {
          enquiryId: enquiry.id,
          fromStatus: 'TRIAL_DONE',
          toStatus: 'CONVERTED',
          changedByUserId: caller.userId,
          note: `Converted to student ${newStudent.studentCode}`,
        },
      })
    } catch {
      markDbOffline()
    }
  }

  // 6. Audit Log (zero PII)
  await logAudit({
    actorId: caller.userId,
    branchId: enquiry.branchId,
    action: 'p2.enquiry.convert',
    entityType: 'Enquiry',
    entityId: enquiry.id,
    before: { status: 'TRIAL_DONE', version: oldVersion },
    after: {
      status: 'CONVERTED',
      version: newVersion,
      convertedStudentId: newStudent.id,
      studentCode: newStudent.studentCode,
    },
    reason: `Converted enquiry ${enquiry.id} to enrolled cadet ${newStudent.studentCode}`,
  })

  return { student: newStudent, enquiry }
}

/**
 * Repair job for rare half-completed conversions (W2-8).
 * Links an orphaned student to the enquiry if admission succeeded but stage update timed out.
 */
export async function repairHalfCompletedConversion(
  caller: UserContext,
  enquiryId: string,
  studentId: string
): Promise<EnquiryRecord> {
  authorize(caller, 'enquiry:convert')

  const enquiry = await getEnquiryById(caller, enquiryId)
  assertBranchAccess(caller, enquiry.branchId, 'Enquiry')

  if (enquiry.convertedStudentId === studentId) {
    return enquiry
  }

  const now = new Date().toISOString()
  enquiry.status = 'CONVERTED'
  enquiry.convertedStudentId = studentId
  enquiry.convertedAt = now
  enquiry.version = enquiry.version + 1
  enquiry.updatedAt = now

  if (isDbAvailable()) {
    try {
      await prisma.enquiry.update({
        where: { id: enquiry.id },
        data: {
          status: 'CONVERTED',
          convertedStudentId: studentId,
          convertedAt: new Date(now),
          version: enquiry.version,
        },
      })
    } catch {
      markDbOffline()
    }
  }

  await logAudit({
    actorId: caller.userId,
    branchId: enquiry.branchId,
    action: 'p2.enquiry.convert',
    entityType: 'Enquiry',
    entityId: enquiry.id,
    after: { convertedStudentId: studentId, repaired: true },
    reason: `Repaired half-completed conversion link to student ${studentId}`,
  })

  return enquiry
}

