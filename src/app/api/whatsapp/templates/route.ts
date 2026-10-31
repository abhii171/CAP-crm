import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { listTemplates } from '@/services/whatsapp.service'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const templates = listTemplates()
    return NextResponse.json({ success: true, templates })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

