# IMPLEMENTATION-PLAN.md — CPA Cricket Academy CRM

This plan splits the build into phases and small, testable steps. It also sets the rules for the AI assistant doing the coding, so it never tries to build the whole system in one go.

Source documents: the PRD, `AUTH-AND-PERMISSIONS.md`, `WORKFLOWS.md`. If this plan conflicts with them, stop and ask; do not guess.

---

## 0. Rules for the AI assistant (read before every task)

1. **One step at a time.** Work only on the step the user names. Do not start the next step, even if it looks easy.
2. **Stay inside the phase.** Phase 2 and 3 features (enquiry pipeline, dashboards, content manager, progress reports, events, inventory, parent portal) are out of scope until the user opens that phase.
3. **Before coding a step:** restate the goal, list the files you will create or change, list what you will *not* touch, and wait for a go-ahead if anything is unclear.
4. **After coding a step:** list what was built, how to test it, and known gaps. Do not claim completion without the step's acceptance checks passing.
5. **Never hard-code branches or roles by name.** Use `branch_type` (owned or franchise), `branch_id` and the role field.
6. **Every query is branch-scoped on the server**, not just hidden in the UI. Admin is the only role that sees all branches.
7. **Never hard-delete** students, payments, receipts or attendance. Deactivate or reverse instead.
8. **Do not invent business rules.** If a rule is in the open-decisions list, use the documented default and mark it with a `TODO(decision)` comment.
9. **Keep each change small and reviewable.** Prefer migrations plus tests over large rewrites. Do not refactor unrelated code.
10. **Secrets** (WhatsApp tokens, gateway keys) live in environment variables, never in code.

---

## 1. Dependency overview

```
Foundation (data model, auth, branches)
   ├── Students & Batches & Coaches
   │       └── Attendance ──► WhatsApp absence alerts
   │
   ├── Fees (plans, dues)
   │       ├── Cash payments + receipts + daily close
   │       ├── Online payments (gateway) ──► reconciliation
   │       └── Reversals
   │
   └── WhatsApp platform (opt-in, templates, queue) ──► reminders, receipts, notices, reply inbox

Audit log: built in Foundation, used by every later step
Reports: depend on Fees + Attendance
```

Hard dependencies:
- Nothing ships before **Foundation** (auth, branch scoping, audit log).
- **Attendance alerts** need Students, Batches and the **WhatsApp platform**.
- **Online payments** need Fees and Receipts first. **Reversals** need Receipts.
- **Reports** come last in Phase 1, because they read data from everything else.

---

## 2. Phase 1: MVP

### Step 1.1 Project setup and data model
- **Deliverables:** repository, environments (dev/staging), database schema and migrations for: branches (`branch_type`), users (role, `branch_id`), students, parents/contacts, consent records, batches, coaches, batch assignments, attendance, fee plans, dues, payments, receipts, audit log, message log.
- **Depends on:** nothing.
- **Done when:** migrations run cleanly from scratch; seed data creates 1 owned and 1 franchise branch.

### Step 1.2 Authentication and sessions
- **Deliverables:** login for admin, manager, coach; system-issued IDs; forced password change on first login; session timeouts (admin 30 min, manager 60 min, coach 8 h); password reset flows per `AUTH-AND-PERMISSIONS.md`; admin 2FA.
- **Depends on:** 1.1.
- **Done when:** each role can sign in and out; timeouts work; reset paths work for each role; wrong-password lockout works.

### Step 1.3 Roles, permissions and branch scoping
- **Deliverables:** permission checks as a single reusable layer; one-manager-one-branch rule; manager cannot change own branch; owned vs franchise rules.
- **Depends on:** 1.2.
- **Done when:** automated tests prove a manager and coach cannot read or write another branch's data through any endpoint, and a franchise manager cannot edit what is owned-only.

### Step 1.4 Audit log
- **Deliverables:** a shared audit helper that records who, what, when, branch, before and after; read-only admin view.
- **Depends on:** 1.1, 1.3.
- **Done when:** logins, role changes and data edits from earlier steps appear in the log.

### Step 1.5 Users and branch administration
- **Deliverables:** admin creates branches, managers and reassigns or replaces managers; manager creates and deactivates coaches.
- **Depends on:** 1.3, 1.4.

### Step 1.6 Batches and coaches
- **Deliverables:** create and edit batches (timings, capacity, coach), double-booking check, owned-only editing rule.
- **Depends on:** 1.5.

### Step 1.7 Students and consent
- **Deliverables:** admission form, unique student ID, duplicate check, parent contact, WhatsApp opt-in record, deactivate and reactivate, batch assignment and transfer with history.
- **Depends on:** 1.6.
- **Done when:** the admission, deactivation and transfer workflows in `WORKFLOWS.md` (sections 1, 2, 9) work end to end.

### Step 1.8 WhatsApp platform
- **Deliverables:** provider integration, template registry, outbound message queue with retry (3 attempts), delivery status tracking, opt-in and STOP enforcement, message log, failed-messages screen.
- **Depends on:** 1.7. **Parallel task (non-code):** submit templates to Meta now, since approval takes time.
- **Done when:** a test message sends to an opted-in number, is skipped for a non-opted-in one, and failures are retried and listed.

### Step 1.9 Coach attendance and absence alerts
- **Deliverables:** mobile-first coach view (own batches only), mark and submit, offline save and sync, 7-day coach edit window, manager corrections with reason, late-entry flag, absence alerts through the WhatsApp queue, missed-submission notice to manager.
- **Depends on:** 1.6, 1.7, 1.8.
- **Done when:** workflow section 3 passes, including offline submission and a cancelled session sending no alerts.

### Step 1.10 Fee plans and dues
- **Deliverables:** admin fee plans, plan assignment, due generation, fee status (paid, partial, due, overdue).
- **Depends on:** 1.7.

### Step 1.11 Cash payments, receipts and daily close
- **Deliverables:** record cash payment with allocation to dues, partial payments, per-branch sequential receipt numbers, collected-by, receipt over WhatsApp, daily summary, manager close-out with discrepancy note, locking.
- **Depends on:** 1.8, 1.10.
- **Done when:** receipt numbers are gapless under concurrent requests, and a closed day cannot be edited.

### Step 1.12 Reversals
- **Deliverables:** reverse a payment with reason, negative linked entry, manager limit with admin approval, due status recalculated.
- **Depends on:** 1.11.

### Step 1.13 Online payments
- **Deliverables:** payment links tied to dues, webhook with signature check, idempotency, reconciliation job, unmatched-payments queue, receipts through WhatsApp, refund-linked reversal.
- **Depends on:** 1.11, 1.12.
- **Done when:** a duplicate webhook is applied once, and a missed webhook is recovered by the reconciliation job.

### Step 1.14 Fee reminders and balance queries
- **Deliverables:** reminder scheduler (3 days before, due date, then 3/7/14 days after), stop on payment, pause by manager, "balance" auto-reply with payment link.
- **Depends on:** 1.8, 1.13.

### Step 1.15 Reply inbox and notices
- **Deliverables:** shared reply inbox per branch (unread, in progress, resolved, escalation), holiday and rain notices with recipient preview.
- **Depends on:** 1.8.

### Step 1.16 Admin reports
- **Deliverables:** outstanding fees, collections by branch (cash vs online), unclosed days, attendance summary; export to CSV.
- **Depends on:** 1.9 to 1.14.

### Step 1.17 Hardening and launch
- **Deliverables:** security review, permission test sweep, load test on attendance and webhooks, backups and restore test, error monitoring, user guides for admin, manager, coach, pilot at one owned branch, then roll out.
- **Depends on:** all above.

**Phase 1 exit criteria:** pilot branch runs a full month: admissions, attendance with alerts, cash and online fees with receipts, daily close, and a correct outstanding-fees report.

---

## 3. Phase 2 (do not start until Phase 1 exit)
- Enquiry pipeline with follow-ups (generic `assigned_to` field, so a Front Desk role can be added later)
- Dashboards
- Notifications beyond core alerts
- Content manager (website content, owned branches only unless decided otherwise)

## 4. Phase 3
- Progress reports (PDF or link over WhatsApp)
- Events
- Inventory
- Parent portal (optional)

---

## 5. Step template (use for every step)

```
Step: <number and name>
Goal: <one sentence>
Files to create or change: <list>
Out of scope: <list>
Acceptance checks:
  - [ ] ...
Tests: <what was run and the result>
Known gaps / decisions needed: <list>
```

## 6. Open decisions that affect the build

| Decision | Needed before | Default used |
|---|---|---|
| Franchise data visibility, fee-plan overrides, editing rights, royalty | 1.3, 1.10 | Franchise manager views only; global fee plans; no royalty |
| Manager reversal limit | 1.12 | Placeholder value in config |
| Manager 2FA required or not | 1.2 | Not required |
| Attendance default state (unmarked or present) | 1.9 | Unmarked |
| Who monitors WhatsApp inbox | 1.15 | Manager (branch); admin sees all |
| Who can collect cash | 1.11 | Manager only |
| WhatsApp provider and payment gateway choice | 1.8, 1.13 | Not chosen yet; decide before those steps |
| Hosting and database | 1.1 | Not chosen yet; decide before step 1.1 |
