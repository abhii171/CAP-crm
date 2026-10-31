import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getUnclosedDaysReport } from '@/services/report.service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const branchId = req.nextUrl.searchParams.get('branchId') || undefined
    const report = await getUnclosedDaysReport(user, { branchId })

    return NextResponse.json({ success: true, report })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 400 })
  }
}

