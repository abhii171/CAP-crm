import { UserContext, RecordNotFoundError, PermissionDeniedError } from './rbac'

/**
 * Attaches the mandatory branchId filter for all queries executed by MANAGER and COACH.
 * Admin can optionally pass a targetBranchId to filter by branch in reports/dashboards.
 */
export function scopeBranchWhere<T extends Record<string, any>>(
  user: UserContext,
  baseWhere?: T,
  adminSelectedBranchId?: string | null
): T & { branchId?: string } {
  const where = { ...(baseWhere || {}) } as T & { branchId?: string }

  if (user.role === 'ADMIN') {
    if (adminSelectedBranchId) {
      where.branchId = adminSelectedBranchId
    }
    return where
  }

  if (!user.branchId) {
    throw new PermissionDeniedError('User has no assigned branch')
  }

  // Force branch scoping for non-admin callers
  where.branchId = user.branchId
  return where
}

/**
 * Validates that an entity with targetBranchId belongs to the caller's authorized scope.
 * If not authorized, throws a RecordNotFoundError (404) to avoid leaking the record's existence.
 */
export function assertBranchAccess(
  user: UserContext,
  targetBranchId: string | null | undefined,
  entityName = 'Record'
): void {
  if (user.role === 'ADMIN') return

  if (!targetBranchId || !user.branchId || user.branchId !== targetBranchId) {
    throw new RecordNotFoundError(entityName)
  }
}

/**
 * Verifies that a coach is assigned to the requested batch.
 * If not, throws a RecordNotFoundError.
 */
export function assertCoachBatchAssignment(
  user: UserContext,
  assignedCoachIds: string[],
  batchName = 'Batch'
): void {
  if (user.role === 'ADMIN' || user.role === 'MANAGER') return

  if (user.role === 'COACH') {
    if (!assignedCoachIds.includes(user.userId)) {
      throw new RecordNotFoundError(batchName)
    }
  }
}

export interface StudentWithRelations {
  [key: string]: any
  guardian?: {
    name?: string
    whatsappNumber?: string
    altNumber?: string
    [key: string]: any
  }
  emergencyPhone?: string
}

/**
 * Sanitizes student records for coach display:
 * - Removes guardian/parent phone numbers (AUTH-AND-PERMISSIONS.md § 8.3)
 * - Emergency phone is only visible if session is currently active
 */
export function sanitizeStudentForRole<T extends StudentWithRelations>(
  student: T,
  role: UserContext['role'],
  isLiveSession = false
): T {
  if (role === 'ADMIN' || role === 'MANAGER') {
    return student
  }

  const sanitized = { ...student } as T

  if (sanitized.guardian) {
    sanitized.guardian = {
      ...sanitized.guardian,
      whatsappNumber: undefined,
      altNumber: undefined,
    }
  }

  // Emergency contact only during live sessions
  if (!isLiveSession) {
    sanitized.emergencyPhone = undefined
  }

  // Strip all fee relations if accidentally included
  delete (sanitized as any).dues
  delete (sanitized as any).payments
  delete (sanitized as any).feePlans
  delete (sanitized as any).paymentLinks
  delete (sanitized as any).outstandingDuesPaise
  delete (sanitized as any).outstandingPaise

  return sanitized
}
