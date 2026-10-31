import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getAuditLogs } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Coaches cannot view audit logs (AUTH-AND-PERMISSIONS.md § 8.3)
    if (user.role === 'COACH') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const action = searchParams.get('action') || null
    const requestedBranchId = searchParams.get('branchId') || null
    const limit = parseInt(searchParams.get('limit') || '50', 10)

    // Branch scoping
    let effectiveBranchId: string | null = null

    if (user.role === 'ADMIN') {
      effectiveBranchId = requestedBranchId // Admin can filter by branch or view all
    } else if (user.role === 'MANAGER') {
      effectiveBranchId = user.branchId // Manager is strictly scoped to own branch
    }

    const logs = await getAuditLogs({
      branchId: effectiveBranchId,
      action,
      limit,
    })

    return NextResponse.json({
      success: true,
      logs,
      scope: user.role === 'ADMIN' ? (effectiveBranchId || 'ALL') : effectiveBranchId,
    })
  } catch (error) {
    console.error('Audit query error:', error)
    return NextResponse.json({ error: 'Failed to retrieve audit log' }, { status: 500 })
  }
}

