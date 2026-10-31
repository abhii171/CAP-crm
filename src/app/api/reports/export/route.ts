import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import {
  getOutstandingFeesReport,
  getCollectionsReport,
  getUnclosedDaysReport,
  getAttendanceSummaryReport,
  exportReportToCsv,
} from '@/services/report.service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const type = req.nextUrl.searchParams.get('type') as
      | 'OUTSTANDING_FEES'
      | 'COLLECTIONS'
      | 'UNCLOSED_DAYS'
      | 'ATTENDANCE'
    const branchId = req.nextUrl.searchParams.get('branchId') || undefined
    const startDate = req.nextUrl.searchParams.get('startDate') || undefined
    const endDate = req.nextUrl.searchParams.get('endDate') || undefined

    if (!type) {
      return NextResponse.json({ error: 'Report type is required' }, { status: 400 })
    }

    let reportData: any
    let filename = `cpa-report-${type.toLowerCase()}-${new Date().toISOString().split('T')[0]}.csv`

    switch (type) {
      case 'OUTSTANDING_FEES':
        reportData = await getOutstandingFeesReport(user, { branchId })
        break
      case 'COLLECTIONS':
        reportData = await getCollectionsReport(user, { branchId, startDate, endDate })
        break
      case 'UNCLOSED_DAYS':
        reportData = await getUnclosedDaysReport(user, { branchId })
        break
      case 'ATTENDANCE':
        reportData = await getAttendanceSummaryReport(user, { branchId, startDate, endDate })
        break
      default:
        return NextResponse.json({ error: 'Invalid report type' }, { status: 400 })
    }

    const csvContent = exportReportToCsv(type, reportData)

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 400 })
  }
}

