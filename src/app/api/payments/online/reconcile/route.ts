import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { runReconciliationJob } from '@/services/online-payment.service'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Only administrators can run reconciliation jobs' }, { status: 403 })
    }

    const result = await runReconciliationJob()
    return NextResponse.json({ success: true, ...result })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode || 400 })
  }
}

