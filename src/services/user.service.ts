import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { prisma, isDbAvailable } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { UserContext, authorize, RecordNotFoundError, PermissionDeniedError } from '@/lib/rbac'
import { scopeBranchWhere, assertBranchAccess } from '@/lib/branch-query'
import { listBranches } from './branch.service'
import { loadDemoData, saveDemoData } from '@/lib/demo-storage'

export interface UserSummary {
  id: string
  loginId: string
  email?: string | null
  name: string
  phone?: string | null
  role: 'ADMIN' | 'MANAGER' | 'COACH'
  branchId: string | null
  branchName?: string
  branchCode?: string
  isActive: boolean
  mustChangePassword: boolean
  lastLoginAt?: string | null
  createdAt: string
}

export interface CreateUserInput {
  name: string
  role: 'MANAGER' | 'COACH'
  branchId: string
  email?: string
  phone?: string
}

// Initial demo users seeded across branches
const initialDemoUsers: (UserSummary & { passwordHash: string })[] = [
  {
    id: 'usr-admin-1',
    loginId: 'ADM-001',
    email: 'admin@cpacricket.in',
    name: 'Super Admin',
    role: 'ADMIN',
    branchId: null,
    branchName: 'All Branches',
    branchCode: 'GLOBAL',
    isActive: true,
    mustChangePassword: false,
    passwordHash: bcrypt.hashSync('Admin@12345', 10),
    createdAt: new Date().toISOString(),
  },
  {
    id: 'usr-mgr-kkp',
    loginId: 'MGR-KKP-001',
    name: 'Ramesh Kumar',
    phone: '+919876543201',
    role: 'MANAGER',
    branchId: 'branch-kkp',
    branchName: 'CPA Kukatpally',
    branchCode: 'KKP',
    isActive: true,
    mustChangePassword: false,
    passwordHash: bcrypt.hashSync('Manager@123', 10),
    createdAt: new Date().toISOString(),
  },
  {
    id: 'usr-mgr-hbn',
    loginId: 'MGR-HBN-001',
    name: 'Suresh Reddy',
    phone: '+919876543202',
    role: 'MANAGER',
    branchId: 'branch-hbn',
    branchName: 'CPA Hitech City',
    branchCode: 'HBN',
    isActive: true,
    mustChangePassword: false,
    passwordHash: bcrypt.hashSync('Manager@123', 10),
    createdAt: new Date().toISOString(),
  },
  {
    id: 'usr-cch-1',
    loginId: 'CCH-KKP-001',
    name: 'Arjun Sharma',
    phone: '+919876543203',
    role: 'COACH',
    branchId: 'branch-kkp',
    branchName: 'CPA Kukatpally',
    branchCode: 'KKP',
    isActive: true,
    mustChangePassword: false,
    passwordHash: bcrypt.hashSync('Coach@1234', 10),
    createdAt: new Date().toISOString(),
  },
  {
    id: 'usr-cch-2',
    loginId: 'CCH-KKP-002',
    name: 'Vikram Patel',
    phone: '+919876543204',
    role: 'COACH',
    branchId: 'branch-kkp',
    branchName: 'CPA Kukatpally',
    branchCode: 'KKP',
    isActive: true,
    mustChangePassword: false,
    passwordHash: bcrypt.hashSync('Coach@1234', 10),
    createdAt: new Date().toISOString(),
  },
  {
    id: 'usr-cch-3',
    loginId: 'CCH-HBN-001',
    name: 'Karthik Varma',
    phone: '+919876543205',
    role: 'COACH',
    branchId: 'branch-hbn',
    branchName: 'CPA Hitech City',
    branchCode: 'HBN',
    isActive: true,
    mustChangePassword: false,
    passwordHash: bcrypt.hashSync('Coach@1234', 10),
    createdAt: new Date().toISOString(),
  },
  {
    id: 'usr-cch-4',
    loginId: 'CCH-HBN-002',
    name: 'Anand Mishra',
    phone: '+919876543206',
    role: 'COACH',
    branchId: 'branch-hbn',
    branchName: 'CPA Hitech City',
    branchCode: 'HBN',
    isActive: true,
    mustChangePassword: false,
    passwordHash: bcrypt.hashSync('Coach@1234', 10),
    createdAt: new Date().toISOString(),
  },
]

// Persistent demo users store
export const demoUsersStore: (UserSummary & { passwordHash: string })[] = loadDemoData(
  'users',
  initialDemoUsers
)

export function findDemoUserForAuth(identifier: string): (UserSummary & { passwordHash: string }) | undefined {
  const trimmed = identifier.trim().toLowerCase()
  return demoUsersStore.find(
    (u) => u.loginId.toLowerCase() === trimmed || (u.email && u.email.toLowerCase() === trimmed)
  )
}

/** Generate a temporary password that satisfies security rules (min 10 chars, mixed case, number, symbol) */
function generateTempPassword(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let str = ''
  for (let i = 0; i < 7; i++) {
    str += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return `Cpa#${str}9!`
}

export async function listUsers(
  caller: UserContext,
  filter?: { role?: 'MANAGER' | 'COACH'; branchId?: string }
): Promise<UserSummary[]> {
  if (isDbAvailable()) {
    try {
      const where = scopeBranchWhere(caller, {
        ...(filter?.role ? { role: filter.role } : {}),
      }, filter?.branchId)

      const users = await prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          branch: { select: { id: true, code: true, name: true } },
        },
      })

      if (users.length > 0) {
        return users.map((u) => ({
          id: u.id,
          loginId: u.loginId,
          email: u.email,
          name: u.name,
          phone: u.phone,
          role: u.role as any,
          branchId: u.branchId,
          branchName: u.branch?.name,
          branchCode: u.branch?.code,
          isActive: u.isActive,
          mustChangePassword: u.mustChangePassword,
          lastLoginAt: u.lastLoginAt?.toISOString(),
          createdAt: u.createdAt.toISOString(),
        }))
      }
    } catch {
      // Database offline, use in-memory demo store
    }
  }

  return demoUsersStore.filter((u) => {
    if (caller.role !== 'ADMIN' && u.branchId !== caller.branchId) return false
    if (filter?.role && u.role !== filter.role) return false
    if (filter?.branchId && u.branchId !== filter.branchId) return false
    return true
  })
}

export async function createUser(
  caller: UserContext,
  input: CreateUserInput
): Promise<{ user: UserSummary; temporaryPassword: string }> {
  // Determine branch details
  const branches = await listBranches(caller)
  const targetBranch = branches.find((b) => b.id === input.branchId)

  if (!targetBranch) {
    throw new RecordNotFoundError('Branch')
  }

  // Permission check taking branch type into account
  if (input.role === 'MANAGER') {
    authorize(caller, 'manager:create')
  } else if (input.role === 'COACH') {
    // Franchise managers cannot create coaches (AUTH-AND-PERMISSIONS.md § 6.2)
    authorize(caller, 'coach:create', targetBranch.type)
    assertBranchAccess(caller, targetBranch.id, 'Branch')
  }

  const prefix = input.role === 'MANAGER' ? 'MGR' : 'CCH'
  const branchCode = targetBranch.code.toUpperCase()

  // Generate sequential/unique system Login ID (e.g. MGR-KKP-002, CCH-KKP-003)
  const existingUsers = await listUsers(caller, { role: input.role, branchId: targetBranch.id })
  const nextSeq = existingUsers.length + 1
  const loginId = `${prefix}-${branchCode}-${String(nextSeq).padStart(3, '0')}`

  const tempPassword = generateTempPassword()
  const passwordHash = await bcrypt.hash(tempPassword, 12)

  let createdUser: UserSummary | null = null

  if (isDbAvailable()) {
    try {
      const user = await prisma.user.create({
        data: {
          loginId,
          name: input.name.trim(),
          role: input.role,
          branchId: targetBranch.id,
          email: input.email?.trim() || null,
          phone: input.phone?.trim() || null,
          passwordHash,
          mustChangePassword: true,
          createdById: caller.userId,
        },
      })

      createdUser = {
        id: user.id,
        loginId: user.loginId,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role as any,
        branchId: user.branchId,
        branchName: targetBranch.name,
        branchCode: targetBranch.code,
        isActive: user.isActive,
        mustChangePassword: user.mustChangePassword,
        createdAt: user.createdAt.toISOString(),
      }
    } catch {}
  }

  if (!createdUser) {
    createdUser = {
      id: `usr-${prefix.toLowerCase()}-${Date.now()}`,
      loginId,
      name: input.name.trim(),
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      role: input.role,
      branchId: targetBranch.id,
      branchName: targetBranch.name,
      branchCode: targetBranch.code,
      isActive: true,
      mustChangePassword: true,
      createdAt: new Date().toISOString(),
    }
    demoUsersStore.push({ ...createdUser, passwordHash })
    saveDemoData('users', demoUsersStore)
  }

  await logAudit({
    actorId: caller.userId,
    branchId: targetBranch.id,
    action: input.role === 'MANAGER' ? 'manager.create' : 'coach.create',
    entityType: 'User',
    entityId: createdUser.id,
    after: { loginId: createdUser.loginId, name: createdUser.name, role: createdUser.role, branchId: targetBranch.id },
    reason: `Created ${input.role.toLowerCase()} ${createdUser.name} (${createdUser.loginId}) for ${targetBranch.name}`,
  })

  return {
    user: createdUser,
    temporaryPassword: tempPassword,
  }
}

export async function deactivateUser(
  caller: UserContext,
  targetUserId: string,
  reason: string
): Promise<void> {
  const users = await listUsers(caller)
  const target = users.find((u) => u.id === targetUserId)
  if (!target) {
    throw new RecordNotFoundError('User')
  }

  if (target.role === 'MANAGER') {
    authorize(caller, 'manager:create') // Only admin can deactivate managers
  } else if (target.role === 'COACH') {
    assertBranchAccess(caller, target.branchId, 'Coach')
  }

  let dbUpdated = false
  if (isDbAvailable()) {
    try {
      await prisma.user.update({
        where: { id: targetUserId },
        data: { isActive: false },
      })
      dbUpdated = true
    } catch {}
  }
  if (!dbUpdated) {
    const memoryUser = demoUsersStore.find((u) => u.id === targetUserId)
    if (memoryUser) {
      memoryUser.isActive = false
      saveDemoData('users', demoUsersStore)
    }
  }

  await logAudit({
    actorId: caller.userId,
    branchId: target.branchId,
    action: 'user.deactivate',
    entityType: 'User',
    entityId: target.id,
    before: { isActive: true },
    after: { isActive: false },
    reason: reason || 'Deactivated by supervisor',
  })
}

export async function reactivateUser(
  caller: UserContext,
  targetUserId: string
): Promise<void> {
  const users = await listUsers(caller)
  const target = users.find((u) => u.id === targetUserId)
  if (!target) {
    throw new RecordNotFoundError('User')
  }

  if (target.role === 'MANAGER') {
    authorize(caller, 'manager:create')
  } else if (target.role === 'COACH') {
    assertBranchAccess(caller, target.branchId, 'Coach')
  }

  let dbReactivated = false
  if (isDbAvailable()) {
    try {
      await prisma.user.update({
        where: { id: targetUserId },
        data: { isActive: true },
      })
      dbReactivated = true
    } catch {}
  }
  if (!dbReactivated) {
    const memoryUser = demoUsersStore.find((u) => u.id === targetUserId)
    if (memoryUser) {
      memoryUser.isActive = true
      saveDemoData('users', demoUsersStore)
    }
  }

  await logAudit({
    actorId: caller.userId,
    branchId: target.branchId,
    action: 'user.reactivate',
    entityType: 'User',
    entityId: target.id,
    before: { isActive: false },
    after: { isActive: true },
    reason: 'Account reactivated by supervisor',
  })
}

export async function resetUserPassword(
  caller: UserContext,
  targetUserId: string
): Promise<{ temporaryPassword: string }> {
  const users = await listUsers(caller)
  const target = users.find((u) => u.id === targetUserId)
  if (!target) {
    throw new RecordNotFoundError('User')
  }

  if (target.role === 'MANAGER') {
    authorize(caller, 'manager:create') // Admin resets manager
  } else if (target.role === 'COACH') {
    authorize(caller, 'coach:reset_password')
    assertBranchAccess(caller, target.branchId, 'Coach')
  }

  const tempPassword = generateTempPassword()
  const passwordHash = await bcrypt.hash(tempPassword, 12)

  let dbReset = false
  if (isDbAvailable()) {
    try {
      await prisma.user.update({
        where: { id: targetUserId },
        data: {
          passwordHash,
          mustChangePassword: true,
        },
      })
      dbReset = true
    } catch {}
  }
  if (!dbReset) {
    const memoryUser = demoUsersStore.find((u) => u.id === targetUserId)
    if (memoryUser) {
      memoryUser.passwordHash = passwordHash
      memoryUser.mustChangePassword = true
      saveDemoData('users', demoUsersStore)
    }
  }

  await logAudit({
    actorId: caller.userId,
    branchId: target.branchId,
    action: 'user.reset_password',
    entityType: 'User',
    entityId: target.id,
    reason: `Temporary password re-issued for ${target.loginId}`,
  })

  return { temporaryPassword: tempPassword }
}

