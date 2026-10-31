import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import {
  getStudentById,
  deactivateStudent,
  reactivateStudent,
  transferStudentBatch,
} from '@/services/student.service'
import { RecordNotFoundError, PermissionDeniedError, SecurityError } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const caller = await getCurrentUser()
  if (!caller?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const student = await getStudentById(caller, params.id)
    return NextResponse.json(student)
  } catch (err) {
    if (err instanceof RecordNotFoundError) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (err instanceof PermissionDeniedError || err instanceof SecurityError)
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    console.error('GET /api/students/[id]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const caller = await getCurrentUser()
  if (!caller?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { action } = body
  if (!action) {
    return NextResponse.json({ error: 'action is required' }, { status: 400 })
  }

  try {
    if (action === 'deactivate') {
      const { reason } = body
      if (!reason || typeof reason !== 'string' || reason.trim().length < 3) {
        return NextResponse.json({ error: 'reason is required (min 3 chars)' }, { status: 400 })
      }
      const result = await deactivateStudent(caller, params.id, reason.trim())
      return NextResponse.json({ ok: true, outstandingDuesPaise: result.outstandingDuesPaise })
    }

    if (action === 'reactivate') {
      const { batchId } = body
      if (!batchId) {
        return NextResponse.json({ error: 'batchId is required for reactivation' }, { status: 400 })
      }
      await reactivateStudent(caller, params.id, batchId)
      return NextResponse.json({ ok: true })
    }

    if (action === 'transfer-batch') {
      const { targetBatchId, effectiveDate } = body
      if (!targetBatchId || !effectiveDate) {
        return NextResponse.json({ error: 'targetBatchId and effectiveDate are required' }, { status: 400 })
      }
      await transferStudentBatch(caller, params.id, targetBatchId, effectiveDate)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (err) {
    if (err instanceof RecordNotFoundError) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (err instanceof PermissionDeniedError || err instanceof SecurityError)
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (err instanceof Error) return NextResponse.json({ error: err.message }, { status: 400 })
    console.error('PATCH /api/students/[id]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

