import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import {
  getStudentsForBatch,
  bulkAssignStudentsToBatch,
  bulkAdmitStudentsToBatch,
  removeStudentFromBatch,
} from '@/services/student.service'
import { RecordNotFoundError, PermissionDeniedError } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await getStudentsForBatch(user, params.id)
    return NextResponse.json({ success: true, ...data })
  } catch (err: any) {
    if (err instanceof RecordNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 })
    }
    if (err instanceof PermissionDeniedError) {
      return NextResponse.json({ error: err.message }, { status: 403 })
    }
    console.error('Failed to get batch students:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { action } = body

    if (action === 'assign_existing' || (Array.isArray(body.studentIds) && body.studentIds.length > 0)) {
      const studentIds = body.studentIds || []
      if (!Array.isArray(studentIds) || studentIds.length === 0) {
        return NextResponse.json({ error: 'studentIds must be a non-empty array' }, { status: 400 })
      }
      const result = await bulkAssignStudentsToBatch(user, params.id, studentIds, body.effectiveDate)
      return NextResponse.json({ success: true, ...result })
    }

    if (action === 'bulk_admit' || (Array.isArray(body.students) && body.students.length > 0)) {
      const students = body.students || []
      if (!Array.isArray(students) || students.length === 0) {
        return NextResponse.json({ error: 'students array is required' }, { status: 400 })
      }
      const result = await bulkAdmitStudentsToBatch(user, params.id, students)
      return NextResponse.json({ success: true, ...result })
    }

    if (action === 'remove') {
      const { studentId } = body
      if (!studentId) {
        return NextResponse.json({ error: 'studentId is required to remove student' }, { status: 400 })
      }
      const result = await removeStudentFromBatch(user, params.id, studentId)
      return NextResponse.json({ success: true, ...result })
    }

    return NextResponse.json({ error: 'Invalid action or payload' }, { status: 400 })
  } catch (err: any) {
    if (err instanceof RecordNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 })
    }
    if (err instanceof PermissionDeniedError) {
      return NextResponse.json({ error: err.message }, { status: 403 })
    }
    console.error('Failed to modify batch students:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
