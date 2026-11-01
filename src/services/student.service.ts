import { prisma, isDbAvailable, markDbOffline } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { UserContext, authorize, RecordNotFoundError, PermissionDeniedError } from '@/lib/rbac'
import { scopeBranchWhere, assertBranchAccess, sanitizeStudentForRole } from '@/lib/branch-query'
import { listBranches, getNextStudentCode } from './branch.service'
import { listBatches, setBatchEnrolledCount } from './batch.service'
import { loadDemoData, saveDemoData } from '@/lib/demo-storage'

export interface AdmitStudentInput {
  branchId: string
  name: string
  dob: string // YYYY-MM-DD
  gender?: string
  guardianName: string
  whatsappNumber: string // E.164
  altNumber?: string
  relationship?: string
  whatsappOptIn: boolean
  consentSource?: string // "admission_form", "verbal"
  emergencyName?: string
  emergencyPhone?: string
  notes?: string
  batchId: string
  feePlanId?: string
}

export interface StudentListItem {
  id: string
  studentCode: string
  name: string
  dob: string
  gender?: string | null
  status: 'ACTIVE' | 'INACTIVE'
  joinedOn: string
  branchId: string
  branchName?: string
  branchCode?: string
  guardianName?: string
  guardianPhone?: string // undefined for coaches
  whatsappOptIn: boolean
  currentBatch?: {
    id: string
    name: string
  } | null
  outstandingDuesPaise?: number
}

// Seeded demo students
const initialDemoStudents: any[] = [
  {
    id: 'std-1',
    studentCode: 'KKP-000001',
    branchId: 'branch-kkp',
    branchName: 'CPA Kukatpally',
    name: 'Aditya Sharma',
    dob: '2012-03-15',
    gender: 'Male',
    status: 'ACTIVE',
    joinedOn: '2026-08-01',
    emergencyName: 'Rakesh Sharma',
    emergencyPhone: '+919876543210',
    guardian: {
      id: 'grd-1',
      name: 'Rakesh Sharma',
      whatsappNumber: '+919876543210',
      whatsappOptIn: true,
      relationship: 'Father',
    },
    currentBatch: { id: 'batch-1', name: 'Under-14 Morning' },
    enrollments: [{ batchId: 'batch-1', batchName: 'Under-14 Morning', startDate: '2026-08-01', endDate: null }],
    outstandingDuesPaise: 250000, // ₹2,500
  },
  {
    id: 'std-2',
    studentCode: 'KKP-000002',
    branchId: 'branch-kkp',
    branchName: 'CPA Kukatpally',
    name: 'Rahul Verma',
    dob: '2012-07-22',
    gender: 'Male',
    status: 'ACTIVE',
    joinedOn: '2026-08-01',
    emergencyName: 'Sunil Verma',
    emergencyPhone: '+919876543211',
    guardian: {
      id: 'grd-2',
      name: 'Sunil Verma',
      whatsappNumber: '+919876543211',
      whatsappOptIn: true,
      relationship: 'Father',
    },
    currentBatch: { id: 'batch-1', name: 'Under-14 Morning' },
    enrollments: [{ batchId: 'batch-1', batchName: 'Under-14 Morning', startDate: '2026-08-01', endDate: null }],
    outstandingDuesPaise: 250000,
  },
  {
    id: 'std-3',
    studentCode: 'KKP-000003',
    branchId: 'branch-kkp',
    branchName: 'CPA Kukatpally',
    name: 'Pranav Iyer',
    dob: '2010-12-20',
    gender: 'Male',
    status: 'ACTIVE',
    joinedOn: '2026-08-01',
    emergencyName: 'Krishnan Iyer',
    emergencyPhone: '+919876543218',
    guardian: {
      id: 'grd-3',
      name: 'Krishnan Iyer',
      whatsappNumber: '+919876543218',
      whatsappOptIn: true,
      relationship: 'Father',
    },
    currentBatch: { id: 'batch-2', name: 'Under-17 Evening' },
    enrollments: [{ batchId: 'batch-2', batchName: 'Under-17 Evening', startDate: '2026-08-01', endDate: null }],
    outstandingDuesPaise: 250000,
  },
  {
    id: 'std-4',
    studentCode: 'KKP-000004',
    branchId: 'branch-kkp',
    branchName: 'CPA Kukatpally',
    name: 'Nikhil Iyer', // Sibling of Pranav Iyer, shares same guardian (+919876543218)
    dob: '2009-06-14',
    gender: 'Male',
    status: 'ACTIVE',
    joinedOn: '2026-08-01',
    emergencyName: 'Krishnan Iyer',
    emergencyPhone: '+919876543218',
    guardian: {
      id: 'grd-3',
      name: 'Krishnan Iyer',
      whatsappNumber: '+919876543218',
      whatsappOptIn: true,
      relationship: 'Father',
    },
    currentBatch: { id: 'batch-2', name: 'Under-17 Evening' },
    enrollments: [{ batchId: 'batch-2', batchName: 'Under-17 Evening', startDate: '2026-08-01', endDate: null }],
    outstandingDuesPaise: 250000,
  },
  {
    id: 'std-5',
    studentCode: 'KKP-000005',
    branchId: 'branch-kkp',
    branchName: 'CPA Kukatpally',
    name: 'Rohan Gupta',
    dob: '2013-05-11',
    gender: 'Male',
    status: 'ACTIVE',
    joinedOn: '2026-08-10',
    emergencyName: 'Amit Gupta',
    emergencyPhone: '+919876543220',
    guardian: {
      id: 'grd-4',
      name: 'Amit Gupta',
      whatsappNumber: '+919876543220',
      whatsappOptIn: true,
      relationship: 'Father',
    },
    currentBatch: { id: 'batch-1', name: 'Under-14 Morning' },
    enrollments: [{ batchId: 'batch-1', batchName: 'Under-14 Morning', startDate: '2026-08-10', endDate: null }],
    outstandingDuesPaise: 0,
  },
  {
    id: 'std-6',
    studentCode: 'KKP-000006',
    branchId: 'branch-kkp',
    branchName: 'CPA Kukatpally',
    name: 'Aarav Mehta',
    dob: '2013-09-04',
    gender: 'Male',
    status: 'ACTIVE',
    joinedOn: '2026-08-12',
    emergencyName: 'Priya Mehta',
    emergencyPhone: '+919876543221',
    guardian: {
      id: 'grd-5',
      name: 'Priya Mehta',
      whatsappNumber: '+919876543221',
      whatsappOptIn: true,
      relationship: 'Mother',
    },
    currentBatch: { id: 'batch-1', name: 'Under-14 Morning' },
    enrollments: [{ batchId: 'batch-1', batchName: 'Under-14 Morning', startDate: '2026-08-12', endDate: null }],
    outstandingDuesPaise: 250000,
  },
  {
    id: 'std-7',
    studentCode: 'KKP-000007',
    branchId: 'branch-kkp',
    branchName: 'CPA Kukatpally',
    name: 'Kabir Singh',
    dob: '2012-11-19',
    gender: 'Male',
    status: 'ACTIVE',
    joinedOn: '2026-08-15',
    emergencyName: 'Jaspreet Singh',
    emergencyPhone: '+919876543222',
    guardian: {
      id: 'grd-6',
      name: 'Jaspreet Singh',
      whatsappNumber: '+919876543222',
      whatsappOptIn: true,
      relationship: 'Father',
    },
    currentBatch: { id: 'batch-1', name: 'Under-14 Morning' },
    enrollments: [{ batchId: 'batch-1', batchName: 'Under-14 Morning', startDate: '2026-08-15', endDate: null }],
    outstandingDuesPaise: 0,
  },
  {
    id: 'std-8',
    studentCode: 'KKP-000008',
    branchId: 'branch-kkp',
    branchName: 'CPA Kukatpally',
    name: 'Vihaan Reddy',
    dob: '2010-04-18',
    gender: 'Male',
    status: 'ACTIVE',
    joinedOn: '2026-08-05',
    emergencyName: 'Suresh Reddy',
    emergencyPhone: '+919876543223',
    guardian: {
      id: 'grd-7',
      name: 'Suresh Reddy',
      whatsappNumber: '+919876543223',
      whatsappOptIn: true,
      relationship: 'Father',
    },
    currentBatch: { id: 'batch-2', name: 'Under-17 Evening' },
    enrollments: [{ batchId: 'batch-2', batchName: 'Under-17 Evening', startDate: '2026-08-05', endDate: null }],
    outstandingDuesPaise: 250000,
  },
  {
    id: 'std-9',
    studentCode: 'KKP-000009',
    branchId: 'branch-kkp',
    branchName: 'CPA Kukatpally',
    name: 'Ishaan Rao',
    dob: '2010-08-25',
    gender: 'Male',
    status: 'ACTIVE',
    joinedOn: '2026-08-18',
    emergencyName: 'Venkat Rao',
    emergencyPhone: '+919876543224',
    guardian: {
      id: 'grd-8',
      name: 'Venkat Rao',
      whatsappNumber: '+919876543224',
      whatsappOptIn: true,
      relationship: 'Father',
    },
    currentBatch: { id: 'batch-2', name: 'Under-17 Evening' },
    enrollments: [{ batchId: 'batch-2', batchName: 'Under-17 Evening', startDate: '2026-08-18', endDate: null }],
    outstandingDuesPaise: 0,
  },
  {
    id: 'std-10',
    studentCode: 'KKP-000010',
    branchId: 'branch-kkp',
    branchName: 'CPA Kukatpally',
    name: 'Devansh Kulkarni',
    dob: '2011-01-30',
    gender: 'Male',
    status: 'ACTIVE',
    joinedOn: '2026-08-20',
    emergencyName: 'Manoj Kulkarni',
    emergencyPhone: '+919876543225',
    guardian: {
      id: 'grd-9',
      name: 'Manoj Kulkarni',
      whatsappNumber: '+919876543225',
      whatsappOptIn: true,
      relationship: 'Father',
    },
    currentBatch: { id: 'batch-3', name: 'Open Batch' },
    enrollments: [{ batchId: 'batch-3', batchName: 'Open Batch', startDate: '2026-08-20', endDate: null }],
    outstandingDuesPaise: 0,
  },
  {
    id: 'std-11',
    studentCode: 'KKP-000011',
    branchId: 'branch-kkp',
    branchName: 'CPA Kukatpally',
    name: 'Aryan Joshi',
    dob: '2011-06-12',
    gender: 'Male',
    status: 'ACTIVE',
    joinedOn: '2026-08-22',
    emergencyName: 'Naveen Joshi',
    emergencyPhone: '+919876543226',
    guardian: {
      id: 'grd-10',
      name: 'Naveen Joshi',
      whatsappNumber: '+919876543226',
      whatsappOptIn: true,
      relationship: 'Father',
    },
    currentBatch: { id: 'batch-3', name: 'Open Batch' },
    enrollments: [{ batchId: 'batch-3', batchName: 'Open Batch', startDate: '2026-08-22', endDate: null }],
    outstandingDuesPaise: 250000,
  },
  {
    id: 'std-12',
    studentCode: 'KKP-000012',
    branchId: 'branch-kkp',
    branchName: 'CPA Kukatpally',
    name: 'Samar Nair',
    dob: '2012-09-14',
    gender: 'Male',
    status: 'ACTIVE',
    joinedOn: '2026-09-01',
    emergencyName: 'Gopal Nair',
    emergencyPhone: '+919876543227',
    guardian: {
      id: 'grd-11',
      name: 'Gopal Nair',
      whatsappNumber: '+919876543227',
      whatsappOptIn: true,
      relationship: 'Father',
    },
    currentBatch: null, // Unassigned cadet
    enrollments: [],
    outstandingDuesPaise: 0,
  },
  {
    id: 'std-13',
    studentCode: 'KKP-000013',
    branchId: 'branch-kkp',
    branchName: 'CPA Kukatpally',
    name: 'Shreyas Deshmukh',
    dob: '2013-02-18',
    gender: 'Male',
    status: 'ACTIVE',
    joinedOn: '2026-09-02',
    emergencyName: 'Vikram Deshmukh',
    emergencyPhone: '+919876543228',
    guardian: {
      id: 'grd-12',
      name: 'Vikram Deshmukh',
      whatsappNumber: '+919876543228',
      whatsappOptIn: true,
      relationship: 'Father',
    },
    currentBatch: null, // Unassigned cadet
    enrollments: [],
    outstandingDuesPaise: 250000,
  },
  {
    id: 'std-14',
    studentCode: 'KKP-000014',
    branchId: 'branch-kkp',
    branchName: 'CPA Kukatpally',
    name: 'Tanmay Bhatia',
    dob: '2011-10-05',
    gender: 'Male',
    status: 'ACTIVE',
    joinedOn: '2026-09-05',
    emergencyName: 'Rajesh Bhatia',
    emergencyPhone: '+919876543229',
    guardian: {
      id: 'grd-13',
      name: 'Rajesh Bhatia',
      whatsappNumber: '+919876543229',
      whatsappOptIn: true,
      relationship: 'Father',
    },
    currentBatch: null, // Unassigned cadet
    enrollments: [],
    outstandingDuesPaise: 0,
  },
  {
    id: 'std-15',
    studentCode: 'KKP-000015',
    branchId: 'branch-kkp',
    branchName: 'CPA Kukatpally',
    name: 'Dhruv Patel',
    dob: '2012-04-23',
    gender: 'Male',
    status: 'ACTIVE',
    joinedOn: '2026-09-10',
    emergencyName: 'Hitesh Patel',
    emergencyPhone: '+919876543230',
    guardian: {
      id: 'grd-14',
      name: 'Hitesh Patel',
      whatsappNumber: '+919876543230',
      whatsappOptIn: true,
      relationship: 'Father',
    },
    currentBatch: null, // Unassigned cadet
    enrollments: [],
    outstandingDuesPaise: 0,
  },
]

// Persistent demo students store
let demoStudents: any[] = loadDemoData('students', initialDemoStudents)

export async function listStudents(
  caller: UserContext,
  options?: { branchId?: string; status?: 'ACTIVE' | 'INACTIVE'; batchId?: string; search?: string }
): Promise<StudentListItem[]> {
  if (isDbAvailable()) {
    try {
      const where = scopeBranchWhere(caller, {
        ...(options?.status ? { status: options.status } : {}),
        ...(options?.batchId ? { enrollments: { some: { batchId: options.batchId, endDate: null } } } : {}),
      }, options?.branchId)

      const students = await prisma.student.findMany({
        where,
        orderBy: { studentCode: 'asc' },
        include: {
          branch: { select: { id: true, code: true, name: true } },
          guardian: { select: { id: true, name: true, whatsappNumber: true, whatsappOptIn: true } },
          enrollments: {
            where: { endDate: null },
            include: { batch: { select: { id: true, name: true } } },
          },
          dues: {
            where: { status: { in: ['UNPAID', 'PARTIAL'] } },
            select: { amountPaise: true, paidPaise: true },
          },
        },
      })

      if (students.length > 0) {
        return students.map((s) => {
          const activeEnrollment = s.enrollments[0]
          const totalOutstanding = s.dues.reduce((sum, d) => sum + (d.amountPaise - d.paidPaise), 0)

          const rawItem: any = {
            id: s.id,
            studentCode: s.studentCode,
            name: s.name,
            dob: s.dob.toISOString().split('T')[0],
            gender: s.gender,
            status: s.status as any,
            joinedOn: s.joinedOn.toISOString().split('T')[0],
            branchId: s.branchId,
            branchName: s.branch.name,
            branchCode: s.branch.code,
            guardian: s.guardian,
            guardianName: s.guardian.name,
            guardianPhone: s.guardian.whatsappNumber,
            whatsappOptIn: s.guardian.whatsappOptIn,
            currentBatch: activeEnrollment
              ? { id: activeEnrollment.batch.id, name: activeEnrollment.batch.name }
              : null,
            outstandingDuesPaise: totalOutstanding,
          }

          // Apply coach privacy masking
          const sanitized = sanitizeStudentForRole(rawItem, caller.role, false)
          return {
            id: sanitized.id,
            studentCode: sanitized.studentCode,
            name: sanitized.name,
            dob: sanitized.dob,
            gender: sanitized.gender,
            status: sanitized.status,
            joinedOn: sanitized.joinedOn,
            branchId: sanitized.branchId,
            branchName: sanitized.branchName,
            branchCode: sanitized.branchCode,
            guardianName: sanitized.guardianName,
            guardianPhone: sanitized.guardian?.whatsappNumber,
            whatsappOptIn: sanitized.whatsappOptIn,
            currentBatch: sanitized.currentBatch,
            outstandingDuesPaise: sanitized.outstandingDuesPaise,
          }
        })
      }
    } catch {
      markDbOffline()
    }
  }

  // Filter in-memory demo list
  const filtered = demoStudents.filter((s) => {
    if (caller.role !== 'ADMIN' && s.branchId !== caller.branchId) return false
    if (options?.branchId && s.branchId !== options.branchId) return false
    if (options?.status && s.status !== options.status) return false
    if (options?.batchId && s.currentBatch?.id !== options.batchId) return false
    if (options?.search) {
      const q = options.search.toLowerCase()
      return (
        s.name.toLowerCase().includes(q) ||
        s.studentCode.toLowerCase().includes(q) ||
        (s.guardian?.whatsappNumber && s.guardian.whatsappNumber.includes(q))
      )
    }
    return true
  })

  return filtered.map((s) => {
    const sanitized = sanitizeStudentForRole(s, caller.role, false)
    return {
      id: sanitized.id,
      studentCode: sanitized.studentCode,
      name: sanitized.name,
      dob: sanitized.dob,
      gender: sanitized.gender,
      status: sanitized.status,
      joinedOn: sanitized.joinedOn,
      branchId: sanitized.branchId,
      branchName: sanitized.branchName,
      guardianName: sanitized.guardian?.name,
      guardianPhone: sanitized.guardian?.whatsappNumber,
      whatsappOptIn: sanitized.guardian?.whatsappOptIn ?? false,
      currentBatch: sanitized.currentBatch,
      outstandingDuesPaise: sanitized.outstandingDuesPaise,
    }
  })
}

export async function getStudentById(caller: UserContext, studentId: string) {
  const student = demoStudents.find((s) => s.id === studentId)
  if (!student) {
    throw new RecordNotFoundError('Student')
  }

  assertBranchAccess(caller, student.branchId, 'Student')
  return sanitizeStudentForRole(student, caller.role, false)
}

/**
 * Internal system lookup for alert dispatching (returns guardian contact unmasked).
 */
export async function getStudentContactForAlert(
  studentId: string
): Promise<{ name: string; guardianId?: string; whatsappNumber?: string } | null> {
  if (isDbAvailable()) {
    try {
      const s = await prisma.student.findUnique({
        where: { id: studentId },
        include: { guardian: true },
      })
      if (s && s.guardian) {
        return {
          name: s.name,
          guardianId: s.guardian.id,
          whatsappNumber: s.guardian.whatsappNumber,
        }
      }
    } catch {
      markDbOffline()
    }
  }

  const match = demoStudents.find((s) => s.id === studentId)
  if (match) {
    return {
      name: match.name,
      guardianId: match.guardian?.id || `grd-${match.id}`,
      whatsappNumber: match.guardian?.whatsappNumber || match.guardianPhone,
    }
  }
  return null
}

/**
 * Duplicate Check (WORKFLOWS.md § 1):
 * Matches identical parent WhatsApp number and similar student name / date of birth.
 */
export async function checkDuplicateStudent(
  caller: UserContext,
  data: { branchId: string; name: string; whatsappNumber: string; dob?: string }
): Promise<{ hasDuplicate: boolean; duplicate?: { name: string; studentCode: string; relationship: string } }> {
  assertBranchAccess(caller, data.branchId, 'Branch')

  const normPhone = data.whatsappNumber.replace(/\D/g, '')
  const normName = data.name.trim().toLowerCase()

  const match = demoStudents.find((s) => {
    const sPhone = (s.guardian?.whatsappNumber || s.guardianPhone || '').replace(/\D/g, '')
    if (sPhone === normPhone) {
      if (s.name.toLowerCase() === normName || (data.dob && s.dob === data.dob)) {
        return true
      }
    }
    return false
  })

  if (match) {
    return {
      hasDuplicate: true,
      duplicate: {
        name: match.name,
        studentCode: match.studentCode,
        relationship: 'Existing Cadet with same parent phone',
      },
    }
  }

  return { hasDuplicate: false }
}

export async function admitStudent(
  caller: UserContext,
  input: AdmitStudentInput
): Promise<StudentListItem> {
  authorize(caller, 'student:create')
  const branches = await listBranches(caller)
  const effectiveBranchId = input.branchId || caller.branchId || (branches[0]?.id || 'branch-kkp')
  assertBranchAccess(caller, effectiveBranchId, 'Branch')

  const branch = branches.find((b) => b.id === effectiveBranchId)
  if (!branch) {
    throw new RecordNotFoundError('Branch')
  }

  const batches = await listBatches(caller, effectiveBranchId)
  const batch = batches.find((b) => b.id === input.batchId)
  if (!batch) {
    throw new RecordNotFoundError('Batch')
  }

  // Generate gapless human-facing studentCode
  const { studentCode } = await getNextStudentCode(branch.id)

  const nowIso = new Date().toISOString()
  const todayDate = nowIso.split('T')[0]

  // Sibling check: reuse existing guardian if number matches in same branch
  let guardian = demoStudents
    .map((s) => s.guardian)
    .find((g) => g && g.whatsappNumber === input.whatsappNumber.trim())

  if (!guardian) {
    guardian = {
      id: `grd-${Date.now()}`,
      branchId: branch.id,
      name: input.guardianName.trim(),
      whatsappNumber: input.whatsappNumber.trim(),
      altNumber: input.altNumber?.trim() || null,
      relationship: input.relationship || 'Guardian',
      whatsappOptIn: input.whatsappOptIn,
    }
  } else {
    // Update opt-in status if changed
    guardian.whatsappOptIn = input.whatsappOptIn
  }

  const newStudent: any = {
    id: `std-${Date.now()}`,
    studentCode,
    branchId: branch.id,
    branchName: branch.name,
    branchCode: branch.code,
    name: input.name.trim(),
    dob: input.dob,
    gender: input.gender || null,
    status: 'ACTIVE',
    joinedOn: todayDate,
    emergencyName: input.emergencyName || input.guardianName,
    emergencyPhone: input.emergencyPhone || input.whatsappNumber,
    notes: input.notes || null,
    guardian,
    currentBatch: { id: batch.id, name: batch.name },
    enrollments: [
      {
        batchId: batch.id,
        batchName: batch.name,
        startDate: todayDate,
        endDate: null,
      },
    ],
    outstandingDuesPaise: 250000, // Monthly fee generated
  }

  try {
    // If DB is online, execute full atomic admission transaction
    await prisma.$transaction(async (tx) => {
      // 1. Upsert Guardian
      const g = await tx.guardian.upsert({
        where: { branchId_whatsappNumber: { branchId: branch.id, whatsappNumber: input.whatsappNumber.trim() } },
        update: { whatsappOptIn: input.whatsappOptIn },
        create: {
          branchId: branch.id,
          name: input.guardianName.trim(),
          whatsappNumber: input.whatsappNumber.trim(),
          altNumber: input.altNumber?.trim() || null,
          relationship: input.relationship || 'Guardian',
          whatsappOptIn: input.whatsappOptIn,
        },
      })

      // 3. Create Consent Record
      await tx.consentRecord.create({
        data: {
          guardianId: g.id,
          channel: 'WHATSAPP',
          status: input.whatsappOptIn ? 'GRANTED' : 'REVOKED',
          source: input.consentSource || 'admission_form',
          recordedById: caller.userId,
        },
      })

      // 4. Create Student
      const s = await tx.student.create({
        data: {
          studentCode,
          branchId: branch.id,
          guardianId: g.id,
          name: input.name.trim(),
          dob: new Date(input.dob),
          gender: input.gender || null,
          status: 'ACTIVE',
          joinedOn: new Date(todayDate),
          emergencyName: input.emergencyName || input.guardianName,
          emergencyPhone: input.emergencyPhone || input.whatsappNumber,
          notes: input.notes || null,
        },
      })

      // 5. Create Batch Enrollment
      await tx.enrollment.create({
        data: {
          studentId: s.id,
          batchId: batch.id,
          startDate: new Date(todayDate),
        },
      })
    })
  } catch {
    // Database offline, record in demo memory store
  }

  demoStudents.push(newStudent)
  saveDemoData('students', demoStudents)

  await logAudit({
    actorId: caller.userId,
    branchId: branch.id,
    action: 'student.admit',
    entityType: 'Student',
    entityId: newStudent.id,
    after: { studentCode, name: newStudent.name, batchId: batch.id, whatsappOptIn: input.whatsappOptIn },
    reason: `Admitted cadet ${newStudent.name} (${studentCode}) into ${batch.name}`,
  })

  return {
    id: newStudent.id,
    studentCode: newStudent.studentCode,
    name: newStudent.name,
    dob: newStudent.dob,
    gender: newStudent.gender,
    status: newStudent.status,
    joinedOn: newStudent.joinedOn,
    branchId: newStudent.branchId,
    branchName: newStudent.branchName,
    guardianName: guardian.name,
    guardianPhone: guardian.whatsappNumber,
    whatsappOptIn: guardian.whatsappOptIn,
    currentBatch: newStudent.currentBatch,
    outstandingDuesPaise: newStudent.outstandingDuesPaise,
  }
}

/**
 * Transfer Student Batch (WORKFLOWS.md § 2):
 * Closes the old batch enrollment with effectiveDate, opens the new enrollment starting on effectiveDate.
 */
export async function transferStudentBatch(
  caller: UserContext,
  studentId: string,
  targetBatchId: string,
  effectiveDate: string
): Promise<void> {
  authorize(caller, 'student:transfer_batch')

  const student = demoStudents.find((s) => s.id === studentId)
  if (!student) {
    throw new RecordNotFoundError('Student')
  }

  assertBranchAccess(caller, student.branchId, 'Student')

  const batches = await listBatches(caller, student.branchId)
  const targetBatch = batches.find((b) => b.id === targetBatchId)
  if (!targetBatch) {
    throw new RecordNotFoundError('Batch')
  }

  const prevBatchName = student.currentBatch?.name || 'Previous Batch'

  // Close previous active enrollment
  const currentEnrollment = student.enrollments.find((e: any) => e.endDate === null)
  if (currentEnrollment) {
    currentEnrollment.endDate = effectiveDate
  }

  // Open new enrollment
  student.enrollments.push({
    batchId: targetBatch.id,
    batchName: targetBatch.name,
    startDate: effectiveDate,
    endDate: null,
  })

  student.currentBatch = { id: targetBatch.id, name: targetBatch.name }
  saveDemoData('students', demoStudents)

  await logAudit({
    actorId: caller.userId,
    branchId: student.branchId,
    action: 'student.transfer_batch',
    entityType: 'Student',
    entityId: student.id,
    before: { batchName: prevBatchName },
    after: { batchName: targetBatch.name, effectiveDate },
    reason: `Transferred cadet ${student.name} from ${prevBatchName} to ${targetBatch.name} effective ${effectiveDate}`,
  })
}

/**
 * Deactivate Student (WORKFLOWS.md § 9):
 * Marks student INACTIVE, stops attendance expectations, preserves dues and audit history.
 */
export async function deactivateStudent(
  caller: UserContext,
  studentId: string,
  reason: string
): Promise<{ outstandingDuesPaise: number }> {
  authorize(caller, 'student:deactivate')

  const student = demoStudents.find((s) => s.id === studentId)
  if (!student) {
    throw new RecordNotFoundError('Student')
  }

  assertBranchAccess(caller, student.branchId, 'Student')

  student.status = 'INACTIVE'
  student.deactivatedAt = new Date().toISOString()
  student.deactivationReason = reason
  saveDemoData('students', demoStudents)

  // End active batch enrollment
  const currentEnrollment = student.enrollments.find((e: any) => e.endDate === null)
  if (currentEnrollment) {
    currentEnrollment.endDate = new Date().toISOString().split('T')[0]
  }

  await logAudit({
    actorId: caller.userId,
    branchId: student.branchId,
    action: 'student.deactivate',
    entityType: 'Student',
    entityId: student.id,
    before: { status: 'ACTIVE' },
    after: { status: 'INACTIVE', reason },
    reason: `Deactivated cadet ${student.name}: ${reason}`,
  })

  return { outstandingDuesPaise: student.outstandingDuesPaise || 0 }
}

/**
 * Reactivate Student (WORKFLOWS.md § 9):
 * Restores status to ACTIVE and assigns an active batch.
 */
export async function reactivateStudent(
  caller: UserContext,
  studentId: string,
  targetBatchId: string
): Promise<void> {
  authorize(caller, 'student:create')

  const student = demoStudents.find((s) => s.id === studentId)
  if (!student) {
    throw new RecordNotFoundError('Student')
  }

  assertBranchAccess(caller, student.branchId, 'Student')

  const batches = await listBatches(caller, student.branchId)
  const batch = batches.find((b) => b.id === targetBatchId)
  if (!batch) {
    throw new RecordNotFoundError('Batch')
  }

  student.status = 'ACTIVE'
  student.deactivatedAt = null
  student.deactivationReason = null
  student.currentBatch = { id: batch.id, name: batch.name }

  student.enrollments.push({
    batchId: batch.id,
    batchName: batch.name,
    startDate: new Date().toISOString().split('T')[0],
    endDate: null,
  })

  await logAudit({
    actorId: caller.userId,
    branchId: student.branchId,
    action: 'student.reactivate',
    entityType: 'Student',
    entityId: student.id,
    before: { status: 'INACTIVE' },
    after: { status: 'ACTIVE', batchId: batch.id },
    reason: `Reactivated cadet ${student.name} and enrolled in ${batch.name}`,
  })
}

/**
 * Get all students for a specific batch, plus available cadets in the branch eligible to be added.
 */
export async function getStudentsForBatch(caller: UserContext, batchId: string) {
  const batches = await listBatches(caller)
  const batch = batches.find((b) => b.id === batchId)
  if (!batch) {
    throw new RecordNotFoundError('Batch')
  }

  assertBranchAccess(caller, batch.branchId, 'Batch')

  const enrolled = demoStudents
    .filter((s) => s.currentBatch?.id === batchId && s.status === 'ACTIVE')
    .map((s) => sanitizeStudentForRole(s, caller.role, false))

  const available = demoStudents
    .filter((s) => s.branchId === batch.branchId && s.status === 'ACTIVE' && s.currentBatch?.id !== batchId)
    .map((s) => sanitizeStudentForRole(s, caller.role, false))

  // Update in-memory batch count to always stay dynamic
  setBatchEnrolledCount(batchId, enrolled.length)

  return {
    batch,
    enrolledStudents: enrolled,
    availableStudents: available,
  }
}

/**
 * Bulk assign existing students to a batch at once.
 */
export async function bulkAssignStudentsToBatch(
  caller: UserContext,
  targetBatchId: string,
  studentIds: string[],
  effectiveDate?: string
): Promise<{ count: number; enrolledCount: number; batchName: string }> {
  authorize(caller, 'student:transfer_batch')

  const batches = await listBatches(caller)
  const targetBatch = batches.find((b) => b.id === targetBatchId)
  if (!targetBatch) {
    throw new RecordNotFoundError('Batch')
  }

  assertBranchAccess(caller, targetBatch.branchId, 'Batch')

  const date = effectiveDate || new Date().toISOString().split('T')[0]
  let assignedCount = 0

  for (const studentId of studentIds) {
    const student = demoStudents.find((s) => s.id === studentId)
    if (!student) continue

    const prevBatchId = student.currentBatch?.id
    const prevBatchName = student.currentBatch?.name || 'Unassigned'

    if (!student.enrollments) {
      student.enrollments = []
    }

    // Close previous active enrollment if open
    const currentEnrollment = student.enrollments.find((e: any) => e.endDate === null)
    if (currentEnrollment) {
      currentEnrollment.endDate = date
    }

    // Open new enrollment
    student.enrollments.push({
      batchId: targetBatch.id,
      batchName: targetBatch.name,
      startDate: date,
      endDate: null,
    })

    student.currentBatch = { id: targetBatch.id, name: targetBatch.name }
  saveDemoData('students', demoStudents)
    assignedCount++

    // Update previous batch count if different
    if (prevBatchId && prevBatchId !== targetBatch.id) {
      const prevEnrolled = demoStudents.filter(
        (s) => s.currentBatch?.id === prevBatchId && s.status === 'ACTIVE'
      ).length
      setBatchEnrolledCount(prevBatchId, prevEnrolled)
    }

    await logAudit({
      actorId: caller.userId,
      branchId: targetBatch.branchId,
      action: 'student.transfer_batch',
      entityType: 'Student',
      entityId: student.id,
      before: { batchName: prevBatchName },
      after: { batchName: targetBatch.name, effectiveDate: date },
      reason: `Assigned cadet ${student.name} to batch ${targetBatch.name}`,
    })
  }

  const currentEnrolled = demoStudents.filter(
    (s) => s.currentBatch?.id === targetBatch.id && s.status === 'ACTIVE'
  ).length
  setBatchEnrolledCount(targetBatch.id, currentEnrolled)

  return { count: assignedCount, enrolledCount: currentEnrolled, batchName: targetBatch.name }
}

/**
 * Remove a student from a batch (moves them to unassigned).
 */
export async function removeStudentFromBatch(
  caller: UserContext,
  batchId: string,
  studentId: string
): Promise<{ enrolledCount: number; studentName: string }> {
  authorize(caller, 'student:transfer_batch')

  const student = demoStudents.find((s) => s.id === studentId)
  if (!student) throw new RecordNotFoundError('Student')

  assertBranchAccess(caller, student.branchId, 'Student')

  const prevBatchName = student.currentBatch?.name || 'Batch'
  const today = new Date().toISOString().split('T')[0]

  if (student.enrollments) {
    const currentEnrollment = student.enrollments.find(
      (e: any) => e.endDate === null && e.batchId === batchId
    )
    if (currentEnrollment) {
      currentEnrollment.endDate = today
    }
  }

  student.currentBatch = null
  saveDemoData('students', demoStudents)

  const currentEnrolled = demoStudents.filter(
    (s) => s.currentBatch?.id === batchId && s.status === 'ACTIVE'
  ).length
  setBatchEnrolledCount(batchId, currentEnrolled)

  await logAudit({
    actorId: caller.userId,
    branchId: student.branchId,
    action: 'student.transfer_batch',
    entityType: 'Student',
    entityId: student.id,
    before: { batchName: prevBatchName },
    after: { batchName: null },
    reason: `Removed cadet ${student.name} from batch ${prevBatchName}`,
  })

  return { enrolledCount: currentEnrolled, studentName: student.name }
}

/**
 * Bulk admit multiple brand new students directly into a batch.
 */
export async function bulkAdmitStudentsToBatch(
  caller: UserContext,
  batchId: string,
  newCadets: Array<{
    name: string
    dob: string
    gender?: string
    guardianName: string
    whatsappNumber: string
    altNumber?: string
    notes?: string
  }>
): Promise<{ addedCount: number; enrolledCount: number; students: any[] }> {
  authorize(caller, 'student:create')

  const batches = await listBatches(caller)
  const batch = batches.find((b) => b.id === batchId)
  if (!batch) throw new RecordNotFoundError('Batch')

  assertBranchAccess(caller, batch.branchId, 'Batch')

  const createdList: any[] = []

  for (const item of newCadets) {
    if (!item.name || !item.dob || !item.guardianName || !item.whatsappNumber) {
      continue
    }

    const created = await admitStudent(caller, {
      branchId: batch.branchId,
      batchId: batch.id,
      name: item.name,
      dob: item.dob,
      gender: item.gender || 'Male',
      guardianName: item.guardianName,
      whatsappNumber: item.whatsappNumber,
      altNumber: item.altNumber,
      relationship: 'Guardian',
      whatsappOptIn: true,
      notes: item.notes,
    })
    createdList.push(created)
  }

  const currentEnrolled = demoStudents.filter(
    (s) => s.currentBatch?.id === batch.id && s.status === 'ACTIVE'
  ).length
  setBatchEnrolledCount(batch.id, currentEnrolled)
  saveDemoData('students', demoStudents)

  return { addedCount: createdList.length, enrolledCount: currentEnrolled, students: createdList }
}

