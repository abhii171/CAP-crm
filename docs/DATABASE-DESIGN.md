# DATABASE-DESIGN — CPA Cricket Academy CRM

Defines entities, fields, relationships, constraints, indexes and storage rules for Phase 1 (MVP). The exact schema is in `prisma/schema.prisma`; this document explains the reasoning and lists the rules Prisma cannot express.

**Stack assumption:** PostgreSQL + Prisma. You have not chosen the database yet; if you pick something else, tell me and I will adapt the schema. Postgres is recommended because the design relies on row locking (receipt numbers), partial indexes and CHECK constraints.

---

## 1. Design principles

1. **Branch scoping everywhere.** Every branch-owned table carries `branchId` (even if it could be derived through a parent). Every query for manager and coach filters by it, so scoping is cheap and hard to forget.
2. **Branch type drives rules.** `Branch.type` (OWNED or FRANCHISE) is the only switch for permissions and fee rules. No code or data refers to a branch by name.
3. **Money is integer paise.** Never floats or decimals in app code. 1 rupee = 100 paise. Currency is INR, so there is no currency column.
4. **Nothing is hard-deleted.** Students are deactivated, users are deactivated, and money is corrected by reversal entries. Foreign keys default to restrict.
5. **Append-only money and audit.** Payments, receipts, allocations and audit rows are never updated or deleted, except cached fields on dues.
6. **Dates vs timestamps.** Calendar facts (date of birth, session date, due date, business date) use `DATE`. Events use `TIMESTAMPTZ` stored in UTC. Display in IST (Asia/Kolkata).
7. **IDs.** Internal primary keys are `cuid` strings. Human-facing IDs are separate: `studentCode` (e.g. `KKP-000123`), receipt numbers (per-branch integer, formatted by the app, e.g. `KKP-R-000045`), and `loginId` for users.
8. **Phone numbers** are stored in E.164 (`+919876543210`).

---

## 2. Entity overview

```
Branch ─┬─ User (role, branchId; admin has none)
        ├─ Guardian ── ConsentRecord
        │      └─ Student ─┬─ Enrollment ── Batch ── BatchCoach ── User(coach)
        │                  ├─ Attendance ── Session ── Batch
        │                  ├─ StudentFeePlan ── FeePlan
        │                  ├─ FeeDue ◄── PaymentAllocation ──► Payment ── Receipt
        │                  └─ PaymentLink
        ├─ ReceiptCounter, DailyClose
        ├─ Message, Notice
        └─ AuditLog
Global: MessageTemplate, GatewayEvent, AuthSession, PasswordResetToken
```

---

## 3. Entities and fields

Types: `str` text, `int` 32-bit integer, `bool`, `date`, `ts` timestamptz, `json`, `enum`, `str[]` text array. "FK" = foreign key. Common columns `createdAt`, `updatedAt` are omitted below unless special.

### 3.1 Branch
| Field | Type | Notes |
|---|---|---|
| id | str PK | |
| code | str unique | Short code used in IDs and receipts |
| name | str | |
| type | enum OWNED/FRANCHISE | Drives permissions and fee rules |
| address, city | str? | |
| studentSeq | int | Last used student sequence; incremented in a transaction |
| isActive | bool | |

### 3.2 User
| Field | Type | Notes |
|---|---|---|
| loginId | str unique | System-issued |
| email | str? unique | Required for admin (reset link and 2FA) |
| name, phone | str, str? | |
| role | enum ADMIN/MANAGER/COACH | |
| branchId | FK Branch? | Null **only** for ADMIN (CHECK) |
| passwordHash | str | Argon2id or bcrypt; never the password |
| mustChangePassword | bool | True after issue or reset |
| isActive | bool | Deactivate instead of delete |
| twoFactorEnabled, twoFactorSecret | bool, str? | Secret encrypted at rest |
| failedLoginCount, lockedUntil | int, ts? | Lockout |
| lastLoginAt, createdById | ts?, FK User? | |

One manager = one branch is modelled by the single `branchId`. Managers cannot change it; only admin can (enforced in the service layer and logged).

### 3.3 AuthSession and PasswordResetToken
- **AuthSession:** `userId`, `tokenHash` (unique, hash only), `lastActiveAt`, `expiresAt`, `revokedAt`, `userAgent`, `ip`. Idle timeout is checked against `lastActiveAt` (admin 30 min, manager 60 min, coach 8 h). Deactivating a user revokes all sessions.
- **PasswordResetToken:** `userId`, `tokenHash` (unique), `expiresAt`, `usedAt`. Used for the admin email-link reset. Manager and coach resets are done by the supervising role and produce a temporary password, not a token.

### 3.4 Guardian and ConsentRecord
**Guardian:** `branchId`, `name`, `whatsappNumber` (E.164), `altNumber?`, `relationship?`, `whatsappOptIn` (cached current state). One guardian can have several students (siblings).
**ConsentRecord** (append-only history): `guardianId`, `channel` ("WHATSAPP"), `status` GRANTED/REVOKED, `source` (admission form, verbal, STOP reply), `recordedById?` (null if system), `recordedAt`. The cached `whatsappOptIn` must always equal the latest record; update both in one transaction.

### 3.5 Student
| Field | Type | Notes |
|---|---|---|
| studentCode | str unique | Generated from `Branch.code` + `studentSeq` |
| branchId, guardianId | FK | |
| name | str | |
| dob | date | |
| gender | str? | |
| status | enum ACTIVE/INACTIVE | |
| joinedOn | date | |
| deactivatedAt, deactivationReason | ts?, str? | |
| emergencyName, emergencyPhone | str? | The only number coaches may see during a live session |
| notes | str? | |

### 3.6 Batch, BatchCoach, Enrollment
- **Batch:** `branchId`, `name` (unique per branch), `ageGroup?`, `capacity`, `daysOfWeek int[]` (0=Sun..6=Sat), `startTime`/`endTime` ("HH:mm", branch local), `startsOn?`, `endsOn?`, `isActive`.
- **BatchCoach:** `batchId`, `coachId`, `isPrimary`, `assignedFrom`, `assignedTo?`. History is kept; the current coach has `assignedTo = null`.
- **Enrollment:** `studentId`, `batchId`, `startDate`, `endDate?`. A transfer closes the old row and opens a new one, so history is preserved. Capacity is counted from rows where `endDate` is null.

### 3.7 Session and Attendance
- **Session:** `batchId`, `branchId`, `date`, `status` SCHEDULED/COMPLETED/CANCELLED, `cancelReason?`, `attendanceSubmittedAt?`. Unique `(batchId, date)`. Generated ahead of time from the batch schedule (e.g. 14 days rolling by a daily job), and also creatable manually. Cancelled sessions expect no attendance and trigger no alerts.
- **Attendance:** `sessionId`, `studentId`, `status` PRESENT/ABSENT/LATE/EXCUSED, `markedById`, `markedAt`, `isLateEntry`, `editedAt?`. Unique `(sessionId, studentId)`. Before-and-after values of edits go in the audit log. Students without a row are "unmarked".

### 3.8 Fees
- **FeePlan:** `branchId?` (null = global plan), `name`, `amountPaise`, `frequency` (ONE_TIME, MONTHLY, QUARTERLY, HALF_YEARLY, YEARLY), `isActive`. The nullable branch allows franchise-level plans later without a schema change.
- **StudentFeePlan:** `studentId`, `feePlanId`, `startDate`, `endDate?`, `amountOverridePaise?`.
- **FeeDue:** `branchId`, `studentId`, `feePlanId`, `studentFeePlanId?`, `label`, `periodStart`, `periodEnd?`, `dueDate`, `amountPaise`, `paidPaise` (cached), `status` UNPAID/PARTIAL/PAID/WAIVED, `remindersPausedUntil?`, `pauseReason?`, `waivedAt?`, `waiveNote?`. Unique `(studentFeePlanId, periodStart)` stops the generator creating duplicates. OVERDUE is **derived** (`dueDate < today` and status not PAID/WAIVED), not stored.

### 3.9 Payment, PaymentAllocation, Receipt, ReceiptCounter
- **Payment:** `branchId`, `studentId`, `entryType` PAYMENT/REVERSAL, `method` CASH/ONLINE, `amountPaise` (always positive; reversals subtract by type), `businessDate`, `receivedAt`, `collectedById?` (null for online), `approvedById?`, `gatewayPaymentId?` (unique), `paymentLinkId?`, `reversalOfId?` (unique, set only on reversals), `reason?` (required on reversals), `note?`.
- **PaymentAllocation:** `paymentId`, `dueId`, `amountPaise` (negative for reversal rows). Unique `(paymentId, dueId)`. `FeeDue.paidPaise` equals the sum of its allocations and is updated in the same transaction.
- **Receipt:** `branchId`, `number` (int), `paymentId` (unique), `issuedAt`, `pdfUrl?`. Unique `(branchId, number)`. Reversals get their own receipt number.
- **ReceiptCounter:** one row per branch with `lastNumber`. Issued inside the payment transaction with `SELECT ... FOR UPDATE` (or `UPDATE ... RETURNING`), so numbers are gapless even under concurrency. If the transaction rolls back, the counter rolls back with it.

### 3.10 DailyClose
`branchId`, `businessDate`, `expectedCashPaise`, `countedCashPaise`, `discrepancyPaise`, `onlinePaise`, `receiptCount`, `note?`, `closedAt`, `closedById`. Unique `(branchId, businessDate)`. Once a day is closed, no new payment may carry that `businessDate`; later corrections are booked on the current open day (see `WORKFLOWS.md` section 8).

### 3.11 Online payments
- **PaymentLink:** `branchId`, `studentId`, `gateway`, `gatewayLinkId` (unique), `shortUrl`, `amountPaise`, `dueIds str[]`, `status` CREATED/PAID/EXPIRED/CANCELLED, `expiresAt?`.
- **GatewayEvent:** raw webhook log. `gateway`, `eventId`, `type`, `gatewayPaymentId?`, `payload json`, `status` RECEIVED/APPLIED/UNMATCHED/IGNORED/FAILED, `paymentId?`, `error?`, `receivedAt`, `processedAt?`. Unique `(gateway, eventId)` gives webhook idempotency, and `gatewayPaymentId` on Payment is the second guard. The "unmatched payments" queue is `status = UNMATCHED`.

### 3.12 WhatsApp
- **MessageTemplate:** `name` (unique, matches the Meta template), `language`, `category`, `bodyPreview`, `metaStatus` DRAFT/SUBMITTED/APPROVED/REJECTED, `isActive`. Only APPROVED templates may be queued.
- **Notice:** `branchId?` (null for an all-branch notice by admin), `type`, `templateName`, `scopeBatchIds str[]`, `noticeDate?`, `createdById`.
- **Message:** both directions in one table. Key fields: `branchId`, `guardianId?`, `studentId?`, `direction`, `templateName?`, `body?`, `status` (QUEUED, SENT, DELIVERED, READ, FAILED, SKIPPED, RECEIVED), `skipReason?` (e.g. "no consent"), `attempts`, `nextAttemptAt?`, `providerMessageId?` (unique), `error?`, `inboxStatus?` (UNREAD/IN_PROGRESS/RESOLVED, inbound only), links to `attendanceId?`, `noticeId?`, or `relatedType/relatedId` (fee due, payment), `sentById?` (null = system). The queue worker polls `status = QUEUED AND nextAttemptAt <= now()`. The failed-messages screen is `status = FAILED` after 3 attempts.

### 3.13 AuditLog
`id` (bigint, auto-increment for ordering), `actorId?` (null = system), `branchId?`, `action` (e.g. `payment.create`), `entityType`, `entityId?`, `before json?`, `after json?`, `reason?`, `ip?`, `createdAt`. Append-only. Written in the same transaction as the change it records. Never store passwords, tokens or full card data in `before`/`after`.

---

## 4. Relationship rules

| Relationship | Rule |
|---|---|
| Branch → everything | Restrict delete; branches are deactivated |
| Guardian → Student | One guardian, many students; guardian and student must share a branch (service check) |
| Student → Enrollment | A student has at most one open enrollment per batch (partial unique index) |
| Payment → Receipt | One-to-one |
| Payment → Payment (reversal) | A payment can be reversed at most once (`reversalOfId` unique) |
| Payment → Due | Many-to-many through PaymentAllocation |
| Message → Attendance | An absence alert links to the attendance row that triggered it |

---

## 5. Indexes (beyond primary and unique keys)

| Table | Index | Serves |
|---|---|---|
| User | (branchId, role) | Branch user lists |
| Student | (branchId, status), (branchId, name), (guardianId) | Student lists, search, duplicate check |
| Guardian | unique (branchId, whatsappNumber), (branchId, name) | Duplicate check, inbound matching |
| Enrollment | (batchId, endDate), (studentId, endDate) | Roster, capacity |
| BatchCoach | (coachId, assignedTo), (batchId, assignedTo) | "My batches today" |
| Session | unique (batchId, date), (branchId, date) | Today's sessions, missed submissions |
| Attendance | unique (sessionId, studentId), (studentId, markedAt) | Marking, student history |
| FeeDue | (branchId, status, dueDate), (studentId, status) | Outstanding report, reminder scheduler |
| Payment | (branchId, businessDate), (studentId, receivedAt) | Daily summary, student ledger |
| Receipt | unique (branchId, number) | Gapless numbering |
| Message | (branchId, direction, inboxStatus), (status, nextAttemptAt), (guardianId, createdAt) | Inbox, send worker, conversation view |
| GatewayEvent | unique (gateway, eventId), (status, receivedAt) | Idempotency, unmatched queue |
| AuditLog | (branchId, createdAt), (entityType, entityId), (actorId, createdAt) | Audit views |

---

## 6. Constraints Prisma cannot express (raw SQL migration)

```sql
-- Admin has no branch; manager and coach must have one
ALTER TABLE "User" ADD CONSTRAINT user_role_branch_chk
  CHECK ((role = 'ADMIN' AND "branchId" IS NULL) OR (role <> 'ADMIN' AND "branchId" IS NOT NULL));

-- Money sanity
ALTER TABLE "Payment" ADD CONSTRAINT payment_amount_chk CHECK ("amountPaise" > 0);
ALTER TABLE "FeeDue" ADD CONSTRAINT due_amount_chk CHECK ("amountPaise" >= 0 AND "paidPaise" >= 0);
ALTER TABLE "FeePlan" ADD CONSTRAINT plan_amount_chk CHECK ("amountPaise" >= 0);
ALTER TABLE "Batch"   ADD CONSTRAINT batch_capacity_chk CHECK (capacity > 0);

-- Reversal rules: a reversal must reference an original and give a reason
ALTER TABLE "Payment" ADD CONSTRAINT payment_reversal_chk CHECK (
  ("entryType" = 'PAYMENT'  AND "reversalOfId" IS NULL) OR
  ("entryType" = 'REVERSAL' AND "reversalOfId" IS NOT NULL AND reason IS NOT NULL));

-- Online payments carry a gateway ID; cash payments have a collector
ALTER TABLE "Payment" ADD CONSTRAINT payment_method_chk CHECK (
  (method = 'ONLINE' AND "gatewayPaymentId" IS NOT NULL) OR
  (method = 'CASH'   AND "collectedById" IS NOT NULL));

-- Only one open enrollment per student per batch
CREATE UNIQUE INDEX enrollment_open_uniq ON "Enrollment" ("studentId", "batchId") WHERE "endDate" IS NULL;

-- Only one current primary assignment per coach per batch
CREATE UNIQUE INDEX batchcoach_open_uniq ON "BatchCoach" ("batchId", "coachId") WHERE "assignedTo" IS NULL;

-- Append-only tables: block UPDATE and DELETE
CREATE FUNCTION forbid_change() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'Table % is append-only', TG_TABLE_NAME; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER audit_no_change    BEFORE UPDATE OR DELETE ON "AuditLog"          FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER payment_no_change  BEFORE UPDATE OR DELETE ON "Payment"           FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER alloc_no_change    BEFORE UPDATE OR DELETE ON "PaymentAllocation" FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER receipt_no_change  BEFORE UPDATE OR DELETE ON "Receipt"           FOR EACH ROW EXECUTE FUNCTION forbid_change();
```

Notes:
- `Receipt.pdfUrl` is updated after creation. If you want strict immutability, keep the PDF URL out of Receipt (derive it from the number) or create the Receipt trigger as `BEFORE DELETE` only.
- Rules the database cannot enforce and the service layer **must**: guardian and student share a branch; a payment cannot be dated on a closed `businessDate`; a manager's branch matches every record they touch; only APPROVED templates are queued; no overallocation of a due.
- Database-level row security (Postgres RLS) by `branchId` is a worthwhile hardening step for Phase 1.17 but is not required for launch.

---

## 7. Key transactions

1. **Admission:** increment `Branch.studentSeq`, create Guardian (or reuse), ConsentRecord, Student, Enrollment, StudentFeePlan, first FeeDue, audit row, queue welcome message. All in one transaction except the message send, which is queued and sent by the worker.
2. **Record payment:** lock `ReceiptCounter`, create Payment, allocations, update `FeeDue.paidPaise` and `status`, create Receipt, audit row, queue the WhatsApp receipt.
3. **Online webhook:** insert `GatewayEvent` (unique conflict means a duplicate and the work stops), verify the signature, then run the same steps as 2 with `method = ONLINE`.
4. **Reversal:** create a REVERSAL Payment, negative allocations, adjust dues, new Receipt number, audit row, and an approval check if over the manager limit.
5. **Daily close:** compute totals from Payments for `(branchId, businessDate)`, then insert DailyClose. A unique-key conflict means the day was already closed.

---

## 8. Data retention and privacy

- Students are a minor-heavy dataset. Store only what the workflows need (no school, ID or medical fields in v1).
- Keep financial records and audit logs for at least the period required by Indian tax and accounting rules (commonly 8 years); confirm the exact period with your accountant.
- Messages: keep metadata and template names long-term; free-form `body` text can be purged after a set period (suggest 12 months).
- Deactivated students stay in the database. Anonymisation or erasure on request, if needed, must keep the financial rows intact and blank out personal fields only.
- Backups: daily automated backups, point-in-time recovery enabled, and a tested restore (step 1.17).

---

## 9. Seed data for development

- 1 admin, 1 owned branch with 1 manager and 2 coaches, 1 franchise branch with 1 manager.
- 3 batches, 20 students with guardians (some without opt-in, one with siblings).
- 2 global fee plans, dues in each state (paid, partial, overdue), cash and online payments, one reversal, one closed day.
- Approved and draft message templates.

---

## 10. Open items affecting the schema

| Item | Impact | Default in schema |
|---|---|---|
| Franchise fee plans | Whether `FeePlan.branchId` is used | Supported, off by default (global plans) |
| Royalty or revenue share | Would add a Royalty table | Not included |
| Manager reversal limit | Config value, not a column | Env/config |
| Content manager, enquiries, events, inventory, progress reports | Phase 2 and 3 tables | Not included; `assignedTo` pattern planned for enquiries |
| Database and hosting choice | Postgres features used here | PostgreSQL assumed |
