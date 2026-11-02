# AUTH-AND-PERMISSIONS

CPA Cricket Academy CRM. This document defines how users sign in, how accounts are created and recovered, what each role may do, and which data each role may see. It matches the PRD (v1) and uses its assumed defaults where decisions are still open (marked **[OPEN]**).

---

## 1. Principles

1. **Deny by default.** A request is allowed only if a rule below permits it.
2. **Scope is enforced in the backend.** Every query is filtered by the caller's scope. Hiding a button in the UI is never the control.
3. **No self-registration.** Every account is created by a higher role. There is no public sign-up page.
4. **Nothing is deleted.** Users, students and coaches are deactivated. Fee records are append-only.
5. **Every sensitive action is logged** (who, what, when, why) in an append-only audit log.
6. **Parents and students have no login in v1.** They are reached only by WhatsApp. Nothing in this document grants them access to the system.

---

## 2. Roles and scopes

| Role | Scope | Created by | Count per branch |
| --- | --- | --- | --- |
| Admin | All branches | System owner (first admin) or another admin | n/a |
| Manager | Exactly one branch. `branch_id` is set on the user and cannot be changed by the manager | Admin only | One or more, each tied to one branch |
| Coach | Own batches only, inside one branch | Admin, or the manager of that branch | Many |

Scope vocabulary used below:

- **ALL**: every branch
- **BRANCH**: the user's own branch only
- **OWN**: only batches assigned to that coach (including a one-session substitution)
- **NONE**: no access

A **future Front Desk role** is not built in v1. Enquiry assignment uses a generic `assigned_to` user field so the role can be added later without schema changes.

---

## 3. Account creation (registration)

There is no public registration. Accounts are created inside the CRM.

### 3.1 Creating a manager

1. Admin creates the branch (if new), then creates a manager and selects that branch.
2. The system generates a unique **login ID** (e.g. `MGR-KUK-001`) and a temporary password.
3. The temporary password is shown **once** on screen to the admin and is never stored in plain text.
4. Admin passes the credentials to the manager through a secure channel.
5. The manager's first login forces a password change.
6. The login ID is unique across the system and is never reused, even after the manager is deactivated.

### 3.2 Creating a coach

1. Admin, or the manager of the coach's branch, creates the coach.
2. A unique login ID (e.g. `CCH-KUK-014`) and temporary password are generated as above.
3. A manager can create coaches only for their own branch. **[OPEN]** For franchise branches, the default is that only admin creates coaches.
4. First login forces a password change.

### 3.3 Creating an admin

Only an existing admin can create another admin. Admin accounts use email plus password and require 2FA at setup.

### 3.4 Deactivation instead of deletion

- Managers and coaches are set to **Inactive** with a reason and date.
- An inactive user cannot sign in. Their history, audit entries and records remain.
- Reactivation is by admin (for managers) or admin/branch manager (for coaches), and is logged.

---

## 4. Login

### 4.1 Credentials by role

| Role | Identifier | Secret | Second factor |
| --- | --- | --- | --- |
| Admin | Email | Password | 2FA **required** (authenticator app) |
| Manager | Login ID | Password | 2FA recommended; admin can make it mandatory |
| Coach | Login ID | Password | Not required (use of shared phones handled by session rules) |

### 4.2 Password rules

- Minimum 10 characters, not in a list of common passwords, not equal to the login ID.
- Stored using a slow, salted hash (bcrypt or Argon2). Never stored or logged in plain text.
- Temporary passwords are single-use and expire after 7 days if unused.
- Users cannot reuse their last 5 passwords.

### 4.3 Brute-force protection

- Rate limit sign-in attempts per IP and per login ID.
- After 5 failed attempts the account is locked for 15 minutes. Repeated lockouts alert the admin.
- Error messages never reveal whether the login ID or the password was wrong.
- Every failed and successful login is written to the audit log with IP and device.

### 4.4 Login flow

1. User submits identifier and password.
2. Backend checks: account exists, status is Active, not locked, password matches.
3. If 2FA applies, a one-time code is requested and verified.
4. If `must_change_password` is true, the user is sent to the change-password screen and can do nothing else until it is done.
5. A session is created (section 7) and the user is routed to their home screen: admin dashboard, manager branch dashboard, or coach "today's sessions".

---

## 5. Password reset

There is no email-based self-service reset for managers and coaches in v1, because they sign in with system IDs rather than their own email addresses.

| Who forgot | Who resets | How |
| --- | --- | --- |
| Coach | Manager of the coach's branch, or admin | Generates a new temporary password, shown once. Forces change on next login |
| Manager | Admin | Same process |
| Admin | Another admin, or the recovery procedure for the owner account | Email-based reset link (valid 30 minutes, single use) plus 2FA verification |

Rules:

- A manager cannot reset another manager's password and cannot reset their own through any admin-level path.
- A reset invalidates all existing sessions for that user.
- Every reset is logged with the actor, the target user and the time.
- Admin can never view an existing password, only issue a new temporary one.
- Users can change their own password while signed in (requires the current password).

---

## 6. Role-based access control (RBAC)

### 6.1 Permission matrix

Legend: ALL, BRANCH, OWN as defined in section 2. R = read only.

| Capability | Admin | Manager | Coach |
| --- | --- | --- | --- |
| Create or edit branches | ALL | NONE | NONE |
| View branch overview (students, fees pending, etc.) | ALL | BRANCH | NONE |
| Create managers and assign to a branch | ALL | NONE | NONE |
| Create or edit coaches | ALL | BRANCH (owned branches) | NONE |
| Deactivate coaches | ALL | BRANCH | NONE |
| Reset a coach password | ALL | BRANCH | NONE |
| Create or edit batches; assign coaches | ALL | BRANCH (owned branches) | NONE |
| Add multiple students to a batch | ALL | BRANCH (owned branches) | NONE |
| Create students (unique ID auto-generated) | ALL | BRANCH | NONE |
| Edit students | ALL | BRANCH | NONE |
| View students | ALL | BRANCH | OWN |
| Deactivate students | ALL | BRANCH | NONE |
| Mark attendance | NONE (override only, logged) | NONE (override only, logged) | OWN |
| View attendance and percentages | ALL | BRANCH | OWN |
| Record a fee payment | ALL | BRANCH | NONE |
| View fee records | ALL | BRANCH | NONE |
| Edit or delete a fee record | NONE | NONE | NONE |
| Reverse a fee entry (reason required) | ALL | BRANCH, subject to an approval limit **[OPEN]**: until set, admin approves every reversal | NONE |
| Close daily cash for a branch | ALL | BRANCH | NONE |
| View WhatsApp inbox and message log | ALL | BRANCH (manager handles parent replies) | NONE |
| View notifications | ALL | BRANCH | NONE |
| View audit log | ALL | BRANCH | NONE |
| Enquiries and follow-ups (Phase 2) | ALL | BRANCH | NONE |
| Website content manager (Phase 2) | ALL | NONE | NONE |
| Bulk import | ALL | BRANCH | NONE |

### 6.2 Branch type rules (owned vs franchise)

Every branch has `branch_type` = `owned` or `franchise`. Permissions read this field. Defaults until decided **[OPEN]**:

| Capability | Owned branch manager | Franchise branch manager |
| --- | --- | --- |
| Create or edit batches | Yes | View only; admin edits |
| Create or edit coaches | Yes | View only; admin edits |
| Set own fee amounts | No, global fee plans | No, global fee plans |
| View branch fee data | Yes | Yes |
| Admin sees franchise fee data | Yes, flagged as franchise | Yes, flagged as franchise |

### 6.3 Attendance rules

- Only the coach assigned to a batch can mark attendance for it. Managers and admin can view only.
- A **substitute coach** is assigned to a single session by a manager or admin and gets access to that session's student list for that session only.
- The coach can edit their own marks on the same day. Later corrections need a manager or admin, with a logged reason.
- Manager or admin overrides are allowed but always logged with a reason, the old value and the new value.
- Absence WhatsApp alerts are triggered by the coach's saved attendance, never by a manager's or admin's view.

### 6.4 Fee rules

- Coaches never see fee data: not in screens, exports, search results or API responses.
- Fee records are append-only. Corrections are a reversal entry followed by a corrected entry.
- Receipt numbers are sequential per branch and cannot be edited.
- Online payments recorded by the gateway are reconciled automatically and cannot be altered by any role.

### 6.5 Overrides and emergency access

- Admin can act on any branch. Every admin action that changes data is audit-logged, including the branch it touched.
- There is no hidden super-user bypass. Support access, if ever needed, is a time-limited admin account that is logged.

---

## 7. Session handling

| Setting | Value |
| --- | --- |
| Session type | Server-issued session token in an HTTP-only, Secure, SameSite cookie (or short-lived access token plus refresh token for the mobile web app) |
| Idle timeout | Admin 30 minutes, manager 60 minutes, coach 8 hours (ground use, but cleared at end of day) |
| Absolute lifetime | Admin 12 hours, manager 12 hours, coach 24 hours |
| Concurrent sessions | Up to 3 per user; the oldest is ended when a fourth starts |
| Logout | Ends the session on the server, not just in the browser |
| Password change or reset | Ends all other sessions |
| Deactivation | Ends all sessions immediately |
| Shared phones | Coach sessions show a prominent Log out button; the last session token is cleared on logout |

Offline attendance:

- Marks are stored on the coach's device and synced when the connection returns.
- Sync requests are authenticated like any other. If the session has expired, the marks stay on the device and the coach is asked to sign in again before they sync. Marks are not discarded.
- Each synced mark carries its original timestamp and the coach ID, so the audit trail shows when it was really taken.

---

## 8. What data each user can access

### 8.1 Admin

- All branches, students, guardians, batches, coaches, managers, attendance, fees, receipts, WhatsApp logs, notifications, enquiries and the audit log.
- Can create and deactivate managers, create branches, reset manager and coach passwords.
- Cannot edit or delete fee records. Cannot view any user's password.

### 8.2 Manager

- Everything in their own branch: students, guardians, batches, coaches, attendance, fees, receipts, WhatsApp inbox and logs, notifications, enquiries (Phase 2) and branch audit entries.
- Never sees another branch's data, including in lists, dropdowns, search, reports and exports. A request for another branch's record returns "not found", not "forbidden".
- Cannot change their own branch assignment, role or login ID.
- Cannot create managers or branches.

### 8.3 Coach

| Data | Access |
| --- | --- |
| Students in their own batches: name, age group, photo, batting/bowling role, medical and injury notes, attendance history | Yes |
| Guardian phone numbers | Not shown. Absence alerts are sent by the system, so the coach does not need the number |
| Fee data of any kind (dues, payments, receipts, balances, discounts) | No |
| Students in other batches or branches | No |
| Other coaches' details, salary or payout | No |
| Enquiries, dashboards, WhatsApp inbox, audit log | No |
| Their own profile and assigned batch and session list | Yes |

**[OPEN]** Whether coaches see guardian phone numbers for emergencies. Default: shown only for the emergency contact of a student in a session that is currently running.

### 8.4 Parents and students

No access to the CRM. They receive WhatsApp messages only (absence alerts, fee reminders, receipts, notices). If a parent portal is added later (Phase 3), it will have its own role with read-only access limited to that parent's linked children.

---

## 9. Implementation notes

1. Store `role` and `branch_id` on the user. Derive scope from them on every request, never from values sent by the client.
2. Apply the branch filter in a single place (a repository or query layer, or database row-level security) so a missing filter cannot happen in one endpoint.
3. Check object-level access too: loading `/students/123` must verify that student 123 belongs to the caller's scope.
4. Fee and attendance tables have no update or delete endpoints for protected fields. Enforce this at the database level where possible (no UPDATE/DELETE grants on `payment` and `reversal`).
5. Return the same response for "does not exist" and "not in your scope" to avoid leaking record existence.
6. Exports, reports, search, autocomplete and notifications go through the same scope filter.
7. Write automated tests for cross-branch access attempts (manager A reading branch B), coach access to fees, and attendance edits by non-coaches.
8. Log every denied access attempt on sensitive resources (fees, other branches) for admin review.

---

## 10. Audit log events

| Event | Logged details |
| --- | --- |
| Login success or failure, lockout | Login ID, IP, device, time |
| Account created, deactivated, reactivated | Actor, target, reason |
| Password reset or change | Actor, target (no password values) |
| Role or branch assignment change | Actor, target, old value, new value |
| Attendance edit after the same day, or by manager/admin | Actor, student, session, old and new status, reason |
| Fee payment, reversal, cash close | Actor, student, amount, mode, receipt number, reason |
| Student or batch status change | Actor, record, old and new value |
| Denied access to a protected resource | Actor, resource, time |

The audit log is append-only. No role can edit or delete entries. Admin views all entries; a manager views entries for their own branch.

---

## 11. Open items affecting this document

- [ ] Franchise branches: can their managers edit batches and coaches? (default: no)
- [ ] Manager reversal approval limit (default: all reversals need admin approval)
- [ ] Whether coaches should see parent phone numbers in emergencies
- [ ] Whether managers must use 2FA (default: recommended, not required)
- [ ] Whether a Front Desk role is needed before Phase 2
