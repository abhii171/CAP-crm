import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ authenticated: false, user: null }, { status: 401 })
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        userId: user.userId,
        loginId: user.loginId,
        role: user.role,
        branchId: user.branchId,
        name: user.name,
        mustChangePassword: user.mustChangePassword,
      },
    })
  } catch (error) {
    console.error('Auth /me error:', error)
    return NextResponse.json({ error: 'Failed to retrieve user status' }, { status: 500 })
  }
}
