/**
 * CPA Cricket Academy CRM — Role-Based Access Control (RBAC) & Scope Enforcement
 * Adheres strictly to AUTH-AND-PERMISSIONS.md, WORKFLOWS.md, and master-prompt (1).md.
 */

export type Role = 'ADMIN' | 'MANAGER' | 'COACH'
export type BranchType = 'OWNED' | 'FRANCHISE'

export interface UserContext {
  userId: string
  loginId: string
  role: Role
  branchId: string | null
  branchType?: BranchType | null
}

export type Action =
  // Branch management
  | 'branch:create'
  | 'branch:edit'
  | 'branch:view_all'
  | 'branch:view'

  // User / staff management
  | 'manager:create'
  | 'manager:reassign'
  | 'coach:create'
  | 'coach:edit'
  | 'coach:view'
  | 'coach:reset_password'

  // Batch management
  | 'batch:create'
  | 'batch:edit'
  | 'batch:view'
  | 'batch:assign_coach'

  // Student management
  | 'student:create'
  | 'student:edit'
  | 'student:view'
  | 'student:deactivate'
  | 'student:transfer_batch'

  // Attendance management
  | 'attendance:mark'
  | 'attendance:edit_recent'
  | 'attendance:override'
  | 'attendance:view'

  // Fees & receipts
  | 'fee:view'
  | 'fee:record_payment'
  | 'fee:reverse'
  | 'daily_close:perform'
  | 'daily_close:view'

  // Messaging & notices
  | 'inbox:view'
  | 'notice:send'

  // Audit
  | 'audit:view'

  // Reports
  | 'report:view'
  | 'report:export'

  // System & Backups (Step 1.17)
  | 'backup:manage'

export class SecurityError extends Error {
  public statusCode: number
  constructor(message: string, statusCode = 403) {
    super(message)
    this.name = 'SecurityError'
    this.statusCode = statusCode
  }
}

/**
 * Thrown whenever an object is not in the caller's scope.
 * We return 404 instead of 403 to prevent data existence leakage (AUTH-AND-PERMISSIONS.md § 9.5).
 */
export class RecordNotFoundError extends SecurityError {
  constructor(entityName = 'Record') {
    super(`${entityName} not found`, 404)
    this.name = 'RecordNotFoundError'
  }
}

export class PermissionDeniedError extends SecurityError {
  constructor(action: string) {
    super(`Permission denied for action: ${action}`, 403)
    this.name = 'PermissionDeniedError'
  }
}

/**
 * Evaluates whether a user can perform an action, considering role and branch type.
 */
export function can(user: UserContext, action: Action, targetBranchType?: BranchType | null): boolean {
  // 1. ADMIN has ALL access across every domain, except coach-only ground attendance marking (attendance:mark)
  if (user.role === 'ADMIN') {
    if (action === 'attendance:mark') {
      // Admin overrides only, not direct attendance marking on the pitch
      return false
    }
    return true
  }

  // 2. MANAGER rules
  if (user.role === 'MANAGER') {
    const isFranchise = (targetBranchType || user.branchType) === 'FRANCHISE'

    switch (action) {
      // Forbidden for any manager
      case 'branch:create':
      case 'branch:edit':
      case 'branch:view_all':
      case 'manager:create':
      case 'manager:reassign':
      case 'attendance:mark': // Coaches mark attendance; managers can only override if required
        return false

      // Owned vs Franchise distinction (AUTH-AND-PERMISSIONS.md § 6.2)
      // Franchise managers have VIEW-ONLY access to batches and coaches
      case 'coach:create':
      case 'coach:edit':
      case 'coach:reset_password':
      case 'batch:create':
      case 'batch:edit':
      case 'batch:assign_coach':
        return !isFranchise // Allowed ONLY for OWNED branches

      // Branch-scoped manager operations (allowed for both Owned & Franchise within their branch)
      case 'branch:view':
      case 'coach:view':
      case 'batch:view':
      case 'student:create':
      case 'student:edit':
      case 'student:view':
      case 'student:deactivate':
      case 'student:transfer_batch':
      case 'attendance:view':
      case 'attendance:override':
      case 'fee:view':
      case 'fee:record_payment':
      case 'fee:reverse':
      case 'daily_close:perform':
      case 'daily_close:view':
      case 'inbox:view':
      case 'notice:send':
      case 'audit:view':
      case 'report:view':
      case 'report:export':
        return true

      default:
        return false
    }
  }

  // 3. COACH rules (AUTH-AND-PERMISSIONS.md § 6, § 8.3)
  if (user.role === 'COACH') {
    switch (action) {
      // Coach is strictly permitted only for their own sessions and attendance
      case 'attendance:mark':
      case 'attendance:edit_recent':
      case 'attendance:view':
      case 'batch:view':
      case 'student:view':
        return true

      // Coaches NEVER see fees, parent phone numbers, other coaches, or admin operations
      case 'fee:view':
      case 'fee:record_payment':
      case 'fee:reverse':
      case 'daily_close:perform':
      case 'daily_close:view':
      case 'branch:create':
      case 'branch:edit':
      case 'branch:view_all':
      case 'branch:view':
      case 'manager:create':
      case 'manager:reassign':
      case 'coach:create':
      case 'coach:edit':
      case 'coach:reset_password':
      case 'coach:view':
      case 'batch:create':
      case 'batch:edit':
      case 'batch:assign_coach':
      case 'student:create':
      case 'student:edit':
      case 'student:deactivate':
      case 'student:transfer_batch':
      case 'attendance:override':
      case 'inbox:view':
      case 'notice:send':
      case 'audit:view':
      default:
        return false
    }
  }

  return false
}

/**
 * Enforces an action check. Throws PermissionDeniedError if denied.
 */
export function authorize(user: UserContext, action: Action, targetBranchType?: BranchType | null): void {
  if (!can(user, action, targetBranchType)) {
    throw new PermissionDeniedError(action)
  }
}

