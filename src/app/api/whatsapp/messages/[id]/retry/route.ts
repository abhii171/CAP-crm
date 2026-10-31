import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { retryFailedMessage } from '@/services/whatsapp.service'
import { RecordNotFoundError, PermissionDeniedError } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const updated = await retryFailedMessage(user, params.id)
    return NextResponse.json({ success: true, message: updated })
  } catch (err: any) {
    if (err instanceof RecordNotFoundError) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }
    if (err instanceof PermissionDeniedError) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json({ error: err.message }, { status: 400 })
  }
}

