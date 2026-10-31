import { getSession, SessionData } from './session'

export type AuthUser = SessionData

/** Get the current authenticated user. Returns null if not signed in. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const session = await getSession()
    if (!session || !session.userId) return null
    return {
      userId: session.userId,
      loginId: session.loginId,
      role: session.role,
      branchId: session.branchId,
      name: session.name,
      mustChangePassword: session.mustChangePassword,
      lastActiveAt: session.lastActiveAt,
      createdAt: session.createdAt,
    }
  } catch (err) {
    console.error('getCurrentUser error:', err)
    return null
  }
}

/** Require authentication. Throws if not signed in. */
export async function requireAuth(): Promise<AuthUser> {
  const user = await getCurrentUser()
  if (!user) throw new Error('UNAUTHORIZED')
  return user
}

/**
 * Require a specific role. Throws if the user lacks the role.
 * For branch-scoped queries, also verify the branchId matches.
 */
export function requireRole(user: AuthUser, ...roles: AuthUser['role'][]): void {
  if (!roles.includes(user.role)) {
    throw new Error('FORBIDDEN')
  }
}

/**
 * All queries for MANAGER and COACH must be filtered by this branch ID.
 * ADMIN gets null (sees all branches).
 */
export function getBranchScope(user: AuthUser): string | null {
  if (user.role === 'ADMIN') return null
  return user.branchId
}
