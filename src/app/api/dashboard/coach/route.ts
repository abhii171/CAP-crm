import { NextRequest, NextResponse } from 'next/server'
import { getCoachDashboard } from '@/modules/phase2/dashboards/dashboard.service'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = req.nextUrl.searchParams
    const date = searchParams.get('date') || undefined

    const dashboard = await getCoachDashboard(user, date)
    return NextResponse.json({ success: true, dashboard })
  } catch (err: any) {
    const statusCode = err.statusCode || 500
    return NextResponse.json({ success: false, error: err.message }, { status: statusCode })
  }
}

