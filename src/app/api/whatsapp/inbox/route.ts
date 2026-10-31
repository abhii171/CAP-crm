import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { listInboxMessages } from '@/services/notice.service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const branchId = req.nextUrl.searchParams.get('branchId') || undefined
    const inboxStatus = (req.nextUrl.searchParams.get('status') as any) || undefined

    const messages = await listInboxMessages(user, {
      branchId,
      inboxStatus,
    })

    return NextResponse.json({ success: true, messages })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 400 })
  }
}

