import { getIronSession, IronSession } from 'iron-session'
import { cookies } from 'next/headers'

export type UserRole = 'ADMIN' | 'MANAGER' | 'COACH'

export interface SessionData {
  userId: string
  loginId: string
  role: UserRole
  branchId: string | null
  name: string
  mustChangePassword: boolean
  lastActiveAt: number
  createdAt: number
}

// Timeout rules from AUTH-AND-PERMISSIONS.md § 7
export const IDLE_TIMEOUT_MS: Record<UserRole, number> = {
  ADMIN: 30 * 60 * 1000,    // 30 minutes
  MANAGER: 60 * 60 * 1000,  // 60 minutes
  COACH: 8 * 60 * 60 * 1000 // 8 hours
}

export const ABSOLUTE_TIMEOUT_MS: Record<UserRole, number> = {
  ADMIN: 12 * 60 * 60 * 1000,   // 12 hours
  MANAGER: 12 * 60 * 60 * 1000, // 12 hours
  COACH: 24 * 60 * 60 * 1000    // 24 hours
}

const INSECURE_DEFAULT_SECRETS = new Set([
  'replace-with-a-random-32-char-secret-at-least',
  'cpa_production_demo_secret_key_at_least_32_chars_long',
])

export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET environment variable is missing or shorter than 32 characters (must be at least 32 characters).')
  }
  // Enforce strong secrets in true production deployments
  if (process.env.NODE_ENV === 'production' && process.env.DEMO_MODE !== 'true' && INSECURE_DEFAULT_SECRETS.has(secret)) {
    throw new Error('Insecure default SESSION_SECRET detected in production. Please set a unique 32+ character secret in hosting environment variables.')
  }
  return secret
}

export const sessionOptions = {
  get password(): string {
    return getSessionSecret()
  },
  cookieName: 'cpa_crm_session',
  cookieOptions: {
    secure: process.env.COOKIE_SECURE === 'true' || (process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false'),
    httpOnly: true,
    sameSite: 'lax' as const,
    maxAge: 24 * 60 * 60, // 24 hours maximum cookie lifespan
  },
}

export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies()
  const session = await getIronSession<SessionData>(cookieStore, sessionOptions)

  // Verify timeout if session is active
  if (session.userId && session.role) {
    const now = Date.now()
    const idleLimit = IDLE_TIMEOUT_MS[session.role]
    const absoluteLimit = ABSOLUTE_TIMEOUT_MS[session.role]

    const isIdleExpired = session.lastActiveAt && (now - session.lastActiveAt > idleLimit)
    const isAbsoluteExpired = session.createdAt && (now - session.createdAt > absoluteLimit)

    if (isIdleExpired || isAbsoluteExpired) {
      try {
        session.destroy()
      } catch {
        // Cookies are read-only during Server Component rendering
      }
      // Blank out user to treat session as expired/logged-out
      delete (session as any).userId
      return session
    }

    // Update lastActiveAt (saved in Route Handlers, ignored in Server Components)
    session.lastActiveAt = now
    try {
      await session.save()
    } catch {
      // Cookies cannot be modified during Server Component rendering in Next.js App Router
    }
  }

  return session
}
