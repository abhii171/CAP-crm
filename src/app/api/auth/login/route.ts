import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma, isDbAvailable } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { logAudit } from '@/lib/audit'
import { findDemoUserForAuth } from '@/services/user.service'

// In-memory lockout tracker for demo resilience
const failedAttemptsMap = new Map<string, { count: number; lockedUntil: number }>()

interface DemoUser {
  id: string
  loginId: string
  email?: string
  name: string
  role: 'ADMIN' | 'MANAGER' | 'COACH'
  branchId: string | null
  passwordPlain: string
  mustChangePassword?: boolean
}

const DEMO_USERS: DemoUser[] = [
  {
    id: 'demo-user-admin',
    loginId: process.env.DEMO_ADMIN_LOGIN_ID || 'ADM-001',
    email: process.env.DEMO_ADMIN_EMAIL || 'admin@cpacricket.in',
    name: 'Super Admin',
    role: 'ADMIN',
    branchId: null,
    passwordPlain: process.env.DEMO_ADMIN_PASSWORD || 'Admin@12345',
    mustChangePassword: false,
  },
  {
    id: 'demo-user-mgr-kkp',
    loginId: process.env.DEMO_MANAGER_KKP_LOGIN_ID || 'MGR-KKP-001',
    name: 'Ramesh Kumar (Manager - Kukatpally)',
    role: 'MANAGER',
    branchId: 'branch-kkp',
    passwordPlain: process.env.DEMO_MANAGER_KKP_PASSWORD || 'Manager@123',
    mustChangePassword: false,
  },
  {
    id: 'demo-user-mgr-hbn',
    loginId: process.env.DEMO_MANAGER_HBN_LOGIN_ID || 'MGR-HBN-001',
    name: 'Suresh Reddy (Manager - Hitech City)',
    role: 'MANAGER',
    branchId: 'branch-hbn',
    passwordPlain: process.env.DEMO_MANAGER_HBN_PASSWORD || 'Manager@123',
    mustChangePassword: false,
  },
  {
    id: 'demo-user-cch-1',
    loginId: process.env.DEMO_COACH_1_LOGIN_ID || 'CCH-KKP-001',
    name: 'Arjun Sharma (Senior Coach)',
    role: 'COACH',
    branchId: 'branch-kkp',
    passwordPlain: process.env.DEMO_COACH_1_PASSWORD || 'Coach@1234',
    mustChangePassword: false,
  },
  {
    id: 'demo-user-cch-2',
    loginId: process.env.DEMO_COACH_2_LOGIN_ID || 'CCH-KKP-002',
    name: 'Vikram Patel (Coach)',
    role: 'COACH',
    branchId: 'branch-kkp',
    passwordPlain: process.env.DEMO_COACH_2_PASSWORD || 'Coach@1234',
    mustChangePassword: false,
  },
]

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { identifier, password } = body
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1'

    if (!identifier || !password) {
      return NextResponse.json(
        { error: 'Identifier and password are required' },
        { status: 400 }
      )
    }

    const trimmedId = String(identifier).trim()
    const now = Date.now()

    // 1. Check lockout status
    const lockout = failedAttemptsMap.get(trimmedId.toLowerCase())
    if (lockout && lockout.lockedUntil > now) {
      const remainingMinutes = Math.ceil((lockout.lockedUntil - now) / 60000)
      return NextResponse.json(
        { error: `Account locked due to 5 failed attempts. Please retry in ${remainingMinutes} minute(s).` },
        { status: 423 }
      )
    }

    let authenticatedUser: {
      id: string
      loginId: string
      role: 'ADMIN' | 'MANAGER' | 'COACH'
      branchId: string | null
      name: string
      mustChangePassword: boolean
    } | null = null

    // 2. Try DB authentication first if available
    let dbSuccess = false
    if (isDbAvailable()) {
      try {
        const dbUser = await prisma.user.findFirst({
        where: {
          OR: [
            { loginId: trimmedId },
            { email: trimmedId.toLowerCase() },
          ],
        },
      })

      if (dbUser) {
        if (!dbUser.isActive) {
          await logAudit({
            actorId: dbUser.id,
            branchId: dbUser.branchId,
            action: 'user.login_blocked',
            entityType: 'User',
            entityId: dbUser.id,
            reason: 'Account is deactivated',
            ip,
          })

          return NextResponse.json(
            { error: 'Account has been deactivated. Please contact an administrator.' },
            { status: 403 }
          )
        }

        if (dbUser.lockedUntil && dbUser.lockedUntil.getTime() > now) {
          const remaining = Math.ceil((dbUser.lockedUntil.getTime() - now) / 60000)
          return NextResponse.json(
            { error: `Account locked. Please try again in ${remaining} minute(s).` },
            { status: 423 }
          )
        }

        const matches = await bcrypt.compare(password, dbUser.passwordHash)
        if (matches) {
          dbSuccess = true
          authenticatedUser = {
            id: dbUser.id,
            loginId: dbUser.loginId,
            role: dbUser.role as any,
            branchId: dbUser.branchId,
            name: dbUser.name,
            mustChangePassword: dbUser.mustChangePassword,
          }

          // Reset failed attempts in DB
          await prisma.user.update({
            where: { id: dbUser.id },
            data: {
              failedLoginCount: 0,
              lockedUntil: null,
              lastLoginAt: new Date(),
            },
          })
        } else {
          // Increment DB failed attempts
          const newFailed = dbUser.failedLoginCount + 1
          const lock = newFailed >= 5 ? new Date(now + 15 * 60 * 1000) : null
          await prisma.user.update({
            where: { id: dbUser.id },
            data: { failedLoginCount: newFailed, lockedUntil: lock },
          })
        }
      }
    } catch {
      // Database not reachable, fallback to demo mode
    }
  }

    // 3. Fallback to Demo Credentials strictly if DEMO_MODE is enabled
    const isDemoMode = process.env.DEMO_MODE === 'true'
    if (!dbSuccess && isDemoMode) {
      const demoUser = DEMO_USERS.find(
        (u) =>
          u.loginId.toLowerCase() === trimmedId.toLowerCase() ||
          (u.email && u.email.toLowerCase() === trimmedId.toLowerCase())
      )

      if (demoUser && demoUser.passwordPlain === password) {
        authenticatedUser = {
          id: demoUser.id,
          loginId: demoUser.loginId,
          role: demoUser.role,
          branchId: demoUser.branchId,
          name: demoUser.name,
          mustChangePassword: demoUser.mustChangePassword ?? false,
        }
        failedAttemptsMap.delete(trimmedId.toLowerCase())
      } else if (!demoUser) {
        // Also check persistent user store (e.g. for created coaches / managers)
        const storeUser = findDemoUserForAuth(trimmedId)
        if (storeUser && storeUser.isActive) {
          const matches = bcrypt.compareSync(password, storeUser.passwordHash)
          if (matches) {
            authenticatedUser = {
              id: storeUser.id,
              loginId: storeUser.loginId,
              role: storeUser.role,
              branchId: storeUser.branchId,
              name: storeUser.name,
              mustChangePassword: storeUser.mustChangePassword ?? false,
            }
            failedAttemptsMap.delete(trimmedId.toLowerCase())
          }
        }
      }
    }

    // 4. Handle authentication failure
    if (!authenticatedUser) {
      const prev = failedAttemptsMap.get(trimmedId.toLowerCase()) || { count: 0, lockedUntil: 0 }
      const newCount = prev.count + 1
      const isLocked = newCount >= 5

      failedAttemptsMap.set(trimmedId.toLowerCase(), {
        count: newCount,
        lockedUntil: isLocked ? now + 15 * 60 * 1000 : 0,
      })

      // Audit log failed attempt / lockout
      await logAudit({
        actorId: null,
        branchId: null,
        action: isLocked ? 'user.lockout' : 'user.login_failed',
        entityType: 'User',
        entityId: trimmedId,
        reason: isLocked ? 'Locked for 15m after 5 failed attempts' : `Failed attempt #${newCount}`,
        ip,
      })

      if (isLocked) {
        return NextResponse.json(
          { error: 'Account locked for 15 minutes due to 5 consecutive failed attempts.' },
          { status: 423 }
        )
      }

      return NextResponse.json(
        { error: 'Invalid identifier or password. Please verify your credentials.' },
        { status: 401 }
      )
    }

    // 5. Establish Iron Session
    const session = await getSession()
    session.userId = authenticatedUser.id
    session.loginId = authenticatedUser.loginId
    session.role = authenticatedUser.role
    session.branchId = authenticatedUser.branchId
    session.name = authenticatedUser.name
    session.mustChangePassword = authenticatedUser.mustChangePassword
    session.lastActiveAt = now
    session.createdAt = now

    await session.save()

    // 6. Audit log successful sign in
    await logAudit({
      actorId: authenticatedUser.id,
      branchId: authenticatedUser.branchId,
      action: 'user.login',
      entityType: 'User',
      entityId: authenticatedUser.id,
      after: { role: authenticatedUser.role, branchId: authenticatedUser.branchId },
      reason: 'User signed in successfully',
      ip,
    })

    return NextResponse.json({
      success: true,
      user: {
        id: authenticatedUser.id,
        loginId: authenticatedUser.loginId,
        role: authenticatedUser.role,
        name: authenticatedUser.name,
        branchId: authenticatedUser.branchId,
        mustChangePassword: authenticatedUser.mustChangePassword,
      },
      redirectTo:
        authenticatedUser.role === 'ADMIN'
          ? '/admin'
          : authenticatedUser.role === 'MANAGER'
          ? '/manager'
          : '/coach',
    })
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { error: 'An unexpected authentication error occurred' },
      { status: 500 }
    )
  }
}
