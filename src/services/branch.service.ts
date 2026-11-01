import bcrypt from 'bcryptjs'
import { prisma, isDbAvailable, markDbOffline } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { UserContext, authorize, RecordNotFoundError, PermissionDeniedError } from '@/lib/rbac'
import { scopeBranchWhere, assertBranchAccess } from '@/lib/branch-query'
import { loadDemoData, saveDemoData } from '@/lib/demo-storage'

export interface CreateBranchInput {
  code: string
  name: string
  type: 'OWNED' | 'FRANCHISE'
  city?: string
  address?: string
}

export interface BranchRecord {
  id: string
  code: string
  name: string
  type: 'OWNED' | 'FRANCHISE'
  city: string | null
  address: string | null
  studentSeq: number
  isActive: boolean
  managerCount?: number
  coachCount?: number
  staffCount?: number
  studentCount?: number
  batchCount?: number
  totalAdmissions?: number
  totalCollectedPaise?: number
  admissionFeeCollectedPaise?: number
  monthlyFeeCollectedPaise?: number
  outstandingPaise?: number
  collectionRate?: number
  createdAt: string
}

// Initial demo branches
const initialDemoBranches: BranchRecord[] = [
  {
    id: 'branch-kkp',
    code: 'KKP',
    name: 'CPA Kukatpally',
    type: 'OWNED',
    city: 'Hyderabad',
    address: 'Plot 12, Kukatpally, Hyderabad',
    studentSeq: 20,
    isActive: true,
    managerCount: 1,
    coachCount: 2,
    staffCount: 3,
    studentCount: 20,
    batchCount: 3,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'branch-hbn',
    code: 'HBN',
    name: 'CPA Hitech City',
    type: 'FRANCHISE',
    city: 'Hyderabad',
    address: 'Hitech City, Hyderabad',
    studentSeq: 0,
    isActive: true,
    managerCount: 1,
    coachCount: 2,
    staffCount: 3,
    studentCount: 0,
    batchCount: 0,
    createdAt: new Date().toISOString(),
  },
]

// Persistent demo store
const demoBranches: BranchRecord[] = loadDemoData('branches', initialDemoBranches)

export async function listBranches(caller: UserContext): Promise<BranchRecord[]> {
  if (isDbAvailable()) {
    try {
      const where: any = {}
      if (caller.role !== 'ADMIN' && caller.branchId) {
        where.id = caller.branchId
      }

      const branches = await prisma.branch.findMany({
        where,
        orderBy: { code: 'asc' },
        include: {
          _count: {
            select: {
              users: true,
              students: true,
            },
          },
        },
      })

      if (branches.length > 0) {
        return branches.map((b) => {
          const studentCount = b._count.students
          const totalAdmissions = Math.max(b.studentSeq, studentCount)
          const admissionFeeCollectedPaise = totalAdmissions * 150000
          return {
            id: b.id,
            code: b.code,
            name: b.name,
            type: b.type as any,
            city: b.city,
            address: b.address,
            studentSeq: b.studentSeq,
            isActive: b.isActive,
            studentCount,
            staffCount: b._count.users,
            totalAdmissions,
            totalCollectedPaise: totalAdmissions * 350000,
            admissionFeeCollectedPaise,
            monthlyFeeCollectedPaise: totalAdmissions * 200000,
            outstandingPaise: 0,
            collectionRate: 100,
            createdAt: b.createdAt.toISOString(),
          }
        })
      }
    } catch {
      markDbOffline()
    }
  }

  // Demo mode: calculate live member/staff/cadet counts strictly per branch
  const users = loadDemoData<any[]>('users', [])
  const students = loadDemoData<any[]>('students', [])
  const batches = loadDemoData<any[]>('batches', [])

  const branchesWithCounts = demoBranches.map((b) => {
    const branchUsers = users.filter((u: any) => u.branchId === b.id && u.isActive !== false)
    const allBranchStudents = students.filter((s: any) => s.branchId === b.id)
    const activeBranchStudents = allBranchStudents.filter((s: any) => s.status === 'ACTIVE')
    const branchBatches = batches.filter((bt: any) => bt.branchId === b.id && bt.isActive !== false)

    const totalAdmissions = Math.max(b.studentSeq || 0, allBranchStudents.length)
    const outstandingPaise = allBranchStudents.reduce(
      (sum: number, s: any) => sum + (s.outstandingDuesPaise || 0),
      0
    )

    // Admission fee kit ₹1,500 per cadet + monthly training fee ₹2,500
    const admissionFeeCollectedPaise = totalAdmissions * 150000
    const estimatedTotalBilledPaise = totalAdmissions * (150000 + 250000)
    const totalCollectedPaise = Math.max(0, estimatedTotalBilledPaise - outstandingPaise)
    const monthlyFeeCollectedPaise = Math.max(0, totalCollectedPaise - admissionFeeCollectedPaise)
    const totalBilled = totalCollectedPaise + outstandingPaise
    const collectionRate = totalBilled > 0 ? Math.round((totalCollectedPaise / totalBilled) * 100) : 100

    return {
      ...b,
      managerCount: branchUsers.filter((u: any) => u.role === 'MANAGER').length,
      coachCount: branchUsers.filter((u: any) => u.role === 'COACH').length,
      staffCount: branchUsers.length,
      studentCount: activeBranchStudents.length,
      batchCount: branchBatches.length,
      totalAdmissions,
      totalCollectedPaise,
      admissionFeeCollectedPaise,
      monthlyFeeCollectedPaise,
      outstandingPaise,
      collectionRate,
    }
  })

  if (caller.role !== 'ADMIN') {
    return branchesWithCounts.filter((b) => b.id === caller.branchId)
  }
  return branchesWithCounts
}

export async function createBranch(caller: UserContext, input: CreateBranchInput): Promise<BranchRecord> {
  authorize(caller, 'branch:create')

  const upperCode = input.code.trim().toUpperCase()
  if (!/^[A-Z]{2,5}$/.test(upperCode)) {
    throw new Error('Branch code must be 2-5 uppercase letters (e.g. KKP, HBN)')
  }

  let createdBranch: BranchRecord

  if (isDbAvailable()) {
    try {
      const branch = await prisma.branch.create({
        data: {
          code: upperCode,
          name: input.name.trim(),
          type: input.type,
          city: input.city?.trim() || null,
          address: input.address?.trim() || null,
        },
      })

      // Also initialize receipt counter for this branch
      await prisma.receiptCounter.create({
        data: { branchId: branch.id, lastNumber: 0 },
      })

      createdBranch = {
        id: branch.id,
        code: branch.code,
        name: branch.name,
        type: branch.type as any,
        city: branch.city,
        address: branch.address,
        studentSeq: branch.studentSeq,
        isActive: branch.isActive,
        staffCount: 0,
        studentCount: 0,
        batchCount: 0,
        totalAdmissions: 0,
        totalCollectedPaise: 0,
        admissionFeeCollectedPaise: 0,
        monthlyFeeCollectedPaise: 0,
        outstandingPaise: 0,
        collectionRate: 100,
        createdAt: branch.createdAt.toISOString(),
      }
    } catch {
      markDbOffline()
    }
  }
  if (!createdBranch!) {
    // Demo fallback store — brand new branch with 0 members, 0 staff, 0 students
    createdBranch = {
      id: `branch-${upperCode.toLowerCase()}`,
      code: upperCode,
      name: input.name.trim(),
      type: input.type,
      city: input.city?.trim() || null,
      address: input.address?.trim() || null,
      studentSeq: 0,
      isActive: true,
      managerCount: 0,
      coachCount: 0,
      staffCount: 0,
      studentCount: 0,
      batchCount: 0,
      totalAdmissions: 0,
      totalCollectedPaise: 0,
      admissionFeeCollectedPaise: 0,
      monthlyFeeCollectedPaise: 0,
      outstandingPaise: 0,
      collectionRate: 100,
      createdAt: new Date().toISOString(),
    }
    demoBranches.push(createdBranch)
    saveDemoData('branches', demoBranches)
  }

  await logAudit({
    actorId: caller.userId,
    branchId: createdBranch.id,
    action: 'branch.create',
    entityType: 'Branch',
    entityId: createdBranch.id,
    after: { code: createdBranch.code, name: createdBranch.name, type: createdBranch.type },
    reason: `Created branch ${createdBranch.name} (${createdBranch.type})`,
  })

  return createdBranch
}

export async function getNextStudentCode(branchId: string): Promise<{ studentCode: string; branchCode: string }> {
  if (isDbAvailable()) {
    try {
      const updated = await prisma.branch.update({
        where: { id: branchId },
        data: { studentSeq: { increment: 1 } },
        select: { code: true, studentSeq: true },
      })
      return {
        studentCode: `${updated.code}-${String(updated.studentSeq).padStart(6, '0')}`,
        branchCode: updated.code,
      }
    } catch {
      markDbOffline()
    }
  }

  const target = demoBranches.find((b) => b.id === branchId)
  if (!target) {
    throw new RecordNotFoundError('Branch')
  }
  target.studentSeq = (target.studentSeq || 0) + 1
  saveDemoData('branches', demoBranches)
  return {
    studentCode: `${target.code}-${String(target.studentSeq).padStart(6, '0')}`,
    branchCode: target.code,
  }
}

