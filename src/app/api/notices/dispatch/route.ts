import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { dispatchNotice } from '@/services/notice.service'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { branchId, batchIds, headline, details, cancelSessions, sessionDate, templateName } = body

    const targetBranchId = branchId || user.branchId
    if (!targetBranchId || !headline || !details) {
      return NextResponse.json({ error: 'branchId, headline, and details are required' }, { status: 400 })
    }

    const result = await dispatchNotice(user, {
      branchId: targetBranchId,
      batchIds,
      headline,
      details,
      cancelSessions,
      sessionDate,
      templateName,
    })

    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 400 })
  }
}
