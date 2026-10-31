import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { previewNoticeRecipients } from '@/services/notice.service'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { branchId, batchIds } = body

    const targetBranchId = branchId || user.branchId
    if (!targetBranchId) {
      return NextResponse.json({ error: 'branchId is required' }, { status: 400 })
    }

    const preview = await previewNoticeRecipients(user, {
      branchId: targetBranchId,
      batchIds,
    })

    return NextResponse.json({ success: true, preview })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 400 })
  }
}

