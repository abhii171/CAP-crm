# 00-ARCHITECTURE-DECISIONS-PHASE-2.md — CPA Cricket Academy CRM

Read this first. It explains *how* Phase 2 is built so that Phase 1 keeps working exactly as it does today. Every other Phase 2 file follows these decisions.

**Scope of Phase 2:** enquiry pipeline with follow-ups and trials, staff notifications, role dashboards, content manager.
**Phase 1 files are not edited.** Phase 2 lives in its own set of files, all suffixed `-PHASE-2`. If a Phase 2 file conflicts with a Phase 1 file, the Phase 1 file wins and the AI must stop and ask.

---

## 1. The design goal

> Turning every Phase 2 feature off must leave the system byte-for-byte equivalent in behaviour to Phase 1.

Everything below exists to make that sentence true and testable.

## 2. Decisions

### A-01 Isolation by addition only
- New tables only. **No Phase 1 table gets a new column, a changed type, a renamed column or a dropped column.**
- New code lives in its own module folder (`src/modules/phase2/...`). Phase 1 modules never import from it.
- Migrations are *expand-only*. Rolling Phase 2 back means dropping Phase 2 tables, which nothing in Phase 1 depends on.
- Every Phase 2 module sits behind a feature flag (see A-12).

### A-02 One-way dependency, and Phase 2 reads rather than hooks
- Direction is always **Phase 2 → Phase 1**, through Phase 1's existing service functions or read-only queries.
- Phase 1 code is not changed to "emit events" for Phase 2. Instead Phase 2 uses scheduled evaluators that read current state (for example, "which branch days are unclosed?"). This costs a little latency and removes all risk to Phase 1 flows.

### A-03 The only sanctioned Phase 1 touchpoints
Exactly these five. Anything else needs written approval.

| # | Touchpoint | Nature of the change | Safety check |
|---|---|---|---|
| T1 | Permission registry | Register new permission keys; existing role mappings untouched | Phase 1 permission tests pass unchanged |
| T2 | Navigation | New menu items, hidden unless flag is on | Snapshot test with flags off equals Phase 1 menu |
| T3 | Admission form | Accept an optional `initialValues` prop; default behaviour unchanged | Phase 1 admission tests pass unchanged |
| T4 | Audit helper | New action names under the `p2.` prefix; no signature change | Phase 1 audit tests pass unchanged |
| T5 | WhatsApp template registry | Add new template entries; no change to the queue, retry or opt-in code | Phase 1 messaging tests pass unchanged |
| (Prisma) | `schema.prisma` | Back-relation fields on `Branch`, `User`, `Student`, `Batch` (Prisma requires both sides of a relation). **Zero SQL effect.** | `prisma migrate diff` shows only `CREATE` statements |

### A-04 Link enquiry to student from the enquiry side
`enquiries.converted_student_id` (unique, nullable). Phase 1's `students` table is not touched. A student's origin is found by looking up the enquiry, not by a column on the student.

### A-05 Fixed pipeline stages, state machine in code
Stages are a fixed enum: `NEW → CONTACTED → TRIAL_SCHEDULED → TRIAL_DONE → CONVERTED`, plus `LOST` from any open stage. Configurable stages sound friendly but break dashboards, funnels and reports. What *is* configurable: lost reasons, enquiry sources (labels), and follow-up channels. Allowed transitions live in one table-driven function, enforced on the server.

### A-06 Follow-ups have a single source of truth
The `enquiry_follow_ups` table is the truth. `enquiries.next_follow_up_at` is a derived cache, updated in the same transaction as any follow-up change, and rebuilt by a nightly consistency job.

### A-07 Trials never touch Phase 1 attendance
Trial guests are stored in `trial_sessions`. They are not written to the attendance tables and do not count against batch capacity (a soft limit of guests per session applies instead). The coach's attendance screen from 1.9 does not change; trial guests appear on the Phase 2 dashboard instead.

### A-08 Notifications are staff-facing, in-app first, deduplicated
- An *event* is created by a scheduled evaluator with a `dedupe_key` (for example `UNCLOSED_DAY:{branchId}:{date}`). A unique constraint makes re-runs harmless.
- Recipients are resolved from role and branch at event time, then stored as `notifications` rows.
- Parent-facing and enquiry-facing WhatsApp messages still go **only** through the Phase 1 queue. Phase 2 never calls the WhatsApp provider directly.

### A-09 Dashboards read from a metrics layer, never from ad-hoc queries
- One module defines every metric (name, formula, source tables, time zone rule).
- Today's numbers are computed live. Past days come from `metric_daily_branch`, a snapshot rebuilt idempotently per `(branch, date)`.
- **Reconciliation rule:** for any period, dashboard totals must equal the Phase 1 admin reports (step 1.16). A nightly job compares them and raises a notification on mismatch. This is the guard against two versions of the truth.
- Dashboard queries are read-only and use a read replica if one exists.

### A-10 Public endpoints live in their own namespace
The website enquiry form is the first unauthenticated write in the system. It sits at `/public/v1/*`, separate from the authenticated API, with its own rate limits, captcha, CORS allowlist, payload limits and logging rules (no personal data in logs). It can only create an enquiry. It can read nothing.

### A-11 Consent and suppression are shared by phone number
If a parent replied STOP in Phase 1, the same phone number must never receive an enquiry follow-up. Enquiry consent is recorded separately (`enquiry_consents`), but **before any send, the suppression check uses the normalised phone number against the Phase 1 opt-out data**. This is the most likely place for a compliance bug, so it has its own acceptance test.

### A-12 Feature flags with per-branch rollout
A `feature_flags` table (`key`, `scope_key`, `enabled`), with keys `p2.enquiries`, `p2.notifications`, `p2.dashboards`, `p2.content`. `scope_key` is `global` or a branch id. This allows: pilot at one owned branch, instant disable, and no redeploy.

### A-13 Content is immutable-revision based
A published page points to one immutable revision. Editing creates a new revision. Rollback moves the pointer. Nothing is overwritten, so a bad edit cannot destroy the live version. Body is Markdown, sanitised on write and again on render. Raw HTML is not accepted.
Postgres treats NULL as distinct in unique indexes, so slug uniqueness uses a `scope_key` string (`global` or branch id) instead of a nullable `branch_id`.

### A-14 Public batch timings are a separate listing
Phase 1 `batches` has no "show on website" flag and will not get one. Phase 2 has `public_batch_listings` (batch id, visible, display name, note). Timings shown publicly are read live from the batch, so they cannot drift.

### A-15 Conventions (inherit from Phase 1; do not change)
- Money in integer paise. Time zone `Asia/Kolkata` for business days; timestamps stored in UTC. The "day" boundary for dashboards equals the one used by daily close in step 1.11.
- Never hard-delete business records. Enquiries are anonymised, not deleted (see retention workflow).
- Secrets in environment variables.
- Optimistic locking (`version` column) on enquiries, because two staff may edit one lead.

## 3. The regression gate (non-negotiable)

Every Phase 2 pull request must pass, in CI:

1. The **entire Phase 1 test suite, unmodified.**
2. A **schema guard script:** diff of the database against the Phase 1 baseline shows no changes to Phase 1 tables or columns.
3. A **flags-off test:** with all `p2.*` flags off, the menu, API route list and permission matrix equal the Phase 1 snapshots.
4. For Phase 2 endpoints: a branch-isolation test (a user from branch A cannot read or write branch B data).

## 4. Risks, in order of likelihood

| Risk | Mitigation |
|---|---|
| Dashboard numbers disagree with Phase 1 reports | A-09 reconciliation job and one metrics layer |
| STOP ignored for enquiry contacts | A-11, dedicated test |
| Public form spam or abuse | A-10, captcha, rate limit, honeypot, branch-level kill switch |
| Heavy dashboard queries slow Phase 1 screens | Snapshots, read replica, query time budgets, indexes, flag per module |
| Enquiry data kept forever | Retention job and anonymisation workflow |
| Scope creep into Phase 3 | Master prompt forbids it; plan lists non-goals |

## 5. Verified Phase 1 Assumptions & Codebase Facts

Audited and verified against `prisma/schema.prisma` and `src/` codebase:

- **Model names:**
  - `Branch`, `User`, `Student`, `Batch`, `Payment`, `AuditLog` match exactly.
  - The dues model is **`FeeDue`** (not `Due`).
  - The message log model is **`Message`** (not `MessageLog`).
  - Opt-out / consent: Stored as boolean **`Guardian.whatsappOptIn`** with append-only audit trail in **`ConsentRecord`**; there is no separate `OptOut` model.
- **IDs & PK types:**
  - Standard entities (`Branch`, `User`, `Student`, `Batch`, `FeeDue`, `Payment`, etc.) use `String` (`cuid`).
  - **Exception:** `AuditLog.id` is **`BigInt`** (`autoincrement`). `ReceiptCounter` uses `branchId String @id`.
- **Database table & column conventions:**
  - Phase 1 does **not** use `@map` or `@@map`.
  - In PostgreSQL, Phase 1 tables are PascalCase (`"Branch"`, `"User"`, `"Student"`) and columns are camelCase (`"branchId"`, `"createdAt"`).
  - Foreign keys in migrations referencing Phase 1 must target `"Branch"("id")`, `"User"("id")`, `"Student"("id")`, etc.
- **Phone normalisation & duplicate queries:**
  - No central normalisation function exists in Phase 1 (only `isValidE164(phone)` in `src/lib/utils.ts` and ad-hoc `.replace(/\D/g, '')` in services). Phase 2 must provide its own E.164 normaliser helper.
  - Students do not have a direct `phone` column. Duplicate detection must query **`Guardian.whatsappNumber`** (and `Student.emergencyPhone`).
- **Opt-out (STOP) suppression checks:**
  - Queryable via `isOptedIn(phone, branchId?)` in `src/services/whatsapp.service.ts` or directly against `prisma.guardian.findFirst({ where: { whatsappNumber } })`. Phone must be in exact E.164 format.
- **Student admission service function:**
  - **`admitStudent(caller: UserContext, input: AdmitStudentInput): Promise<StudentListItem>`** in `src/services/student.service.ts`.
  - Note: `AdmitStudentInput` currently requires `batchId: string`.
- **Daily close business-day boundary:**
  - Daily close in `src/services/payment.service.ts` uses inline UTC date string (`new Date().toISOString().split('T')[0]`), while `src/lib/utils.ts` has `todayIST(): Date`. Phase 2 metrics must use a dedicated IST helper.
