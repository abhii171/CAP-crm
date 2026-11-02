import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getEnquiryPipelineBoard } from '@/modules/phase2'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const branchId = searchParams.get('branchId') || undefined
    const ownerId = searchParams.get('ownerId') || undefined

    const board = await getEnquiryPipelineBoard(user, { branchId, ownerId })
    return NextResponse.json({ success: true, board })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 500 })
  }
}

