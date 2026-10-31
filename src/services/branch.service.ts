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
        return branches.map((b) => ({
          id: b.id,
          code: b.code,
          name: b.name,
          type: b.type as any,
          city: b.city,
          address: b.address,
          studentSeq: b.studentSeq,
          isActive: b.isActive,
          studentCount: b._count.students,
          staffCount: b._count.users,
          createdAt: b.createdAt.toISOString(),
        }))
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
    const branchStudents = students.filter((s: any) => s.branchId === b.id && s.status === 'ACTIVE')
    const branchBatches = batches.filter((bt: any) => bt.branchId === b.id && bt.isActive !== false)

    return {
      ...b,
      managerCount: branchUsers.filter((u: any) => u.role === 'MANAGER').length,
      coachCount: branchUsers.filter((u: any) => u.role === 'COACH').length,
      staffCount: branchUsers.length,
      studentCount: branchStudents.length,
      batchCount: branchBatches.length,
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

