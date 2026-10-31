import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getCollectionsReport } from '@/services/report.service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const branchId = req.nextUrl.searchParams.get('branchId') || undefined
    const startDate = req.nextUrl.searchParams.get('startDate') || undefined
    const endDate = req.nextUrl.searchParams.get('endDate') || undefined

    const report = await getCollectionsReport(user, { branchId, startDate, endDate })

    return NextResponse.json({ success: true, report })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 400 })
  }
}

