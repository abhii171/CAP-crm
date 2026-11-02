
=# WORKFLOWS.md — CPA Cricket Academy CRM

Step-by-step business processes: who does what, what the system does, which WhatsApp messages go out, what changes status, and what happens when something fails.

**Conventions**
- Roles: **Admin**, **Manager** (one branch), **Coach**. Branch scoping and owned/franchise rules come from `AUTH-AND-PERMISSIONS.md`.
- Every state change writes an **audit log** entry (who, when, branch, before/after).
- Nothing is hard-deleted. Students are deactivated; money entries are corrected by reversal.
- WhatsApp is the only parent/student channel in v1. Every outbound message uses a Meta-approved template and requires recorded opt-in.
- Items marked **[Assumption]** are defaults I chose where your answers did not settle the point. Confirm them (see the final section).

---

## 1. Student admission

**Actor:** Manager (or Admin). **Trigger:** a parent joins the academy.

1. Manager opens *New student* in their own branch (branch is auto-filled and locked).
2. Enters: name, date of birth, parent/guardian name, parent WhatsApp number, emergency contact, batch preference.
3. System checks for a duplicate (same parent number plus similar name or date of birth). If a match is found, it warns and asks the manager to confirm it is a different student.
4. Manager records **WhatsApp opt-in** (parent confirms verbally or on a form). System stores consent with timestamp and who recorded it.
5. Manager assigns a **batch** and a **fee plan**.
6. System generates a unique student ID, then sends the WhatsApp **welcome template** (academy name, batch timings, coach name, student ID).
7. System creates the first fee due per the plan (see Workflow 5).

**Status:** `Active`.

**Errors**
| Problem | Handling |
|---|---|
| Invalid WhatsApp number | System validates format; after the first send, a delivery failure flags the student "contact unreachable" on the manager's task list |
| No consent recorded | Student can be saved but no messages are sent; shown with a "No opt-in" badge |
| Batch full | Manager can't assign; offered waitlist or another batch |

---

## 2. Batch and coach management

**Actors:** Admin (all branches); Manager (own branch). **[Assumption]** Franchise managers can view but not edit batches, coaches or content, matching the owned-only rule in the PRD; franchise editing rights are an open decision.

**Create/edit a batch**
1. Name, branch, days, timings, age group, capacity, assigned coach(es).
2. System blocks a coach double-booked in overlapping slots.
3. Changes to timings trigger a WhatsApp **schedule change** notice to the batch's parents (manager confirms before sending).

**Student batch transfer**
1. Manager selects student, then *Move batch*. Effective date is required.
2. History is kept (old batch end date, new batch start date). Past attendance stays under the old batch.
3. Parent receives a confirmation message.

**Coach assignment change**
1. Manager or Admin reassigns the coach. The old coach loses access to that batch immediately. The new coach sees it from the next session.

---

## 3. Attendance (coach-only, mobile-first)

**Actor:** Coach. **Trigger:** a scheduled session.

1. Coach opens the app and sees **only their batches for today**.
2. Opens a session; the student list is pre-filled as *Present* by default or unmarked **[Assumption: unmarked, to avoid false "present" records]**.
3. Marks each student **Present / Absent** (optional: Late, Excused).
4. Coach taps **Submit**. The session locks.
5. For each **Absent** student, the system queues a WhatsApp **absence alert** to the parent (sent after a short delay, e.g. 15 minutes, so a late mark can be corrected).
6. Manager sees a branch attendance summary and any sessions with no attendance submitted.

**Corrections**
- The coach may edit a submitted session **within 7 days** **[Assumption from "before 1 week"]**. Each edit is audit-logged with the old and new value.
- After 7 days only the Manager can correct, with a mandatory reason.
- If a student changes from Absent to Present after an alert was sent, the system does **not** send a retraction automatically; the manager may send a manual note.

**Missed submission**
- If a session has no submission by the end of the day, the manager is notified. Coach can still submit late; it is flagged "late entry".

**Errors**
| Problem | Handling |
|---|---|
| Coach has poor connectivity | App saves the submission locally and retries; the session shows "pending sync" until confirmed |
| Student not on the list | Coach can't add; manager adds or transfers the student |
| Parent not opted in | Alert is skipped and logged as "not sent – no consent" |
| WhatsApp delivery failure | Retry up to 3 times, then add to the manager's "failed messages" list |

**Coaches and parent numbers:** coaches don't see parent phone numbers. The emergency contact may be shown only during a live session (see Auth document).

---

## 4. Holiday, rain and ad-hoc notices

**Actor:** Manager (own branch) or Admin (any/all branches).

1. Select scope: whole branch, specific batches, or a date.
2. Choose a template (Holiday / Rain cancellation / Schedule change / General), fill the variables.
3. System shows the recipient count (opted-in parents only) and a preview.
4. Manager confirms. Messages are sent in a throttled queue.
5. If sessions are cancelled, they are marked **Cancelled** so attendance isn't expected and no absence alerts fire.

**Errors:** a bounce or opt-out is recorded against that parent; a sending failure shows a per-recipient report with a *Retry failed* action.

---

## 5. Fee plans, dues and reminders

**Setup (Admin)**
1. Admin defines fee plans (monthly, quarterly, one-time admission fee, kit fee, etc.).
2. **[Assumption]** Plans are global by default, with branch-level overrides allowed for franchises only if you decide so.

**Due generation**
1. When a student is assigned a plan, the system creates dues on a schedule (due date, amount, period).
2. Student fee status: `Paid` / `Partially paid` / `Due` / `Overdue`.

**Reminders (automated via WhatsApp)**
| When | Message |
|---|---|
| 3 days before due date | Friendly reminder with payment link |
| On due date | Due today with payment link |
| 3, 7, 14 days after | Overdue reminders, then stop and flag for manager follow-up |

- Reminders stop automatically once the due is paid. A partially paid due shows the remaining balance.
- The manager can pause reminders for a student (reason required).

**Parent balance query:** the parent sends "balance" (or similar) on WhatsApp; the system replies with the outstanding amount and a payment link. Unrecognized messages go to the reply inbox (Workflow 10).

---

## 6. Cash payment

**Actor:** Manager (or collecting staff user). **[Assumption]** Coaches do not collect fees.

1. Open the student, then *Record payment*, and select **Cash**.
2. Enter the amount. System allocates it to the oldest due first (the manager can change allocation). Partial payments are allowed.
3. System issues a **receipt** with a sequential per-branch number (no gaps, no reuse) and records **collected by**.
4. Receipt is sent on WhatsApp (PDF or link). A copy is stored.
5. The payment is added to the branch's **open daily collection**.

**Daily close**
1. At day end the manager opens *Daily summary*: cash total, online total, count of receipts, list of entries.
2. Manager counts the cash and confirms or records a discrepancy with a note.
3. Manager taps **Close day**. Entries are locked. Admin sees closed totals per branch.

**Errors**
| Problem | Handling |
|---|---|
| Wrong amount or student entered | No edit or delete; use a **reversal** (Workflow 8) |
| Receipt send fails | Retry; receipt can be re-sent or downloaded manually |
| Day not closed | Admin sees "unclosed" branches in reports; manager gets a reminder next morning |
| Cash discrepancy | Recorded with note on the close entry; visible to Admin |

---

## 7. Online payment (Razorpay or similar)

**Trigger:** reminder link, balance query, or a link the manager sends.

1. System creates a payment link tied to the student and specific due(s).
2. Parent pays on the gateway page.
3. Gateway webhook confirms success. System **verifies the signature**, matches the reference to the student, and allocates the payment to the due(s).
4. System issues the receipt (same branch sequence) and sends it on WhatsApp. It is included in the branch daily summary as *Online*.
5. Fee status updates and reminders stop.

**Errors**
| Problem | Handling |
|---|---|
| Payment fails or is abandoned | No change; the due stays open and the next reminder carries a fresh link |
| Webhook delayed or missed | Scheduled reconciliation job polls the gateway and applies missed payments |
| Duplicate webhook | Idempotency key on the gateway payment ID, so it is applied once only |
| Amount doesn't match a due | Applied as partial or advance credit per rule, and flagged for manager review |
| Payment with no matching student | Goes to an *Unmatched payments* queue for Admin |
| Refund needed | Done via gateway by Admin, with a matching reversal entry |

---

## 8. Corrections and reversals

**Actor:** Manager (within a limit) or Admin. **[Assumption]** The manager's reversal limit is open (see decisions).

1. Open the original payment and choose *Reverse*.
2. Select a reason (wrong student, wrong amount, duplicate, refund) and add a note.
3. If the amount is over the manager's limit, the request goes to **Admin approval**; otherwise it applies immediately.
4. System creates a **negative entry** linked to the original. The original is never altered.
5. The due returns to unpaid or partially paid, and a corrected payment can be recorded.
6. Both receipts are retained; the reversal gets its own number. If the day is already closed, the reversal is booked on the current open day and refers to the original.
7. The parent can be notified (optional, manager's choice).

---

## 9. Student deactivation and reactivation

**Deactivate**
1. Manager selects *Deactivate* and a reason (left academy, moved, non-payment, other).
2. System checks for outstanding dues and shows them. Manager may waive (Admin approval) or leave them open.
3. Student leaves batch lists, attendance expectation and reminders stop. All history is kept.

**Reactivate**
1. Manager selects *Reactivate*, assigns a batch and fee plan, and confirms consent is still valid.
2. Status returns to `Active`. Old dues are preserved and visible.

**Parent opt-out:** if a parent replies STOP, the system disables messaging for that number immediately and shows the manager an "opted out" flag. The student remains active.

---

## 10. Inbound WhatsApp replies

**[Assumption]** The **manager** monitors replies through a shared inbox view in the CRM for their branch; Admin sees all.

1. Parent replies to any outbound message.
2. System matches the number to a student (or students, for siblings).
3. Keyword handling: *balance* gets an automatic reply; *STOP* means opt-out; anything else goes to the inbox as **Unread**.
4. Manager replies from the CRM. Within WhatsApp's 24-hour window free-form replies are allowed; after that only approved templates.
5. Status: `Unread`, `In progress`, `Resolved`.
6. Messages unread for 24 hours are escalated to the manager's task list and to Admin after 48 hours.

---

## 11. User account lifecycle

**Create manager/coach**
1. Admin creates a manager and assigns exactly **one branch** (the manager cannot change it).
2. A manager creates coaches in their branch. System issues IDs and temporary passwords; first login forces a password change.

**Reset (summary)**: manager resets coaches, Admin resets managers, Admin reset uses an email link plus 2FA. Full rules are in `AUTH-AND-PERMISSIONS.md`.

**Replace a manager**
1. Admin deactivates the old manager (sessions are ended immediately) and creates or assigns the new one.
2. Open tasks, replies and unclosed daily summaries are reassigned to the new manager or Admin.

**Coach leaves**
1. Manager deactivates the coach. Their batches are flagged "no coach" and must be reassigned. Historical attendance remains attributed to them.

---

## 12. Owned vs franchise branches

Driven by the `branch_type` field, never by branch names.

| Area | Owned | Franchise (defaults, to confirm) |
|---|---|---|
| Student and fee data | Admin sees all | Admin sees reports; detail access is a decision |
| Fee plans | Global | Global unless overrides allowed |
| Batches, coaches, content | Admin and manager edit | View only for the franchise manager |
| Daily close | Required | Required |
| Royalty or revenue share | n/a | Not calculated in v1 unless you confirm |

---

## 13. Error handling and audit summary

- **Idempotency:** payments, receipts and webhooks never apply twice.
- **No gaps:** receipt numbers are sequential per branch and are never reused or deleted.
- **Failed messages:** retried 3 times, then listed on the manager's "failed messages" screen.
- **Offline coach app:** local save and sync, with clear pending status.
- **Locks:** submitted attendance (after 7 days), closed days and receipts are immutable; changes happen by correction entries.
- **Audit log** covers logins, resets, role/branch changes, attendance edits, payments, reversals, day closes, consent changes, deactivations and message sends.

---

## Open decisions to confirm

1. Attendance edit window: 7 days for coaches (assumed from "before 1 week").
2. Default attendance state: unmarked vs pre-filled Present.
3. Who monitors the WhatsApp inbox: manager (assumed), front desk, or both.
4. Manager reversal limit (amount above which Admin approval is needed).
5. Franchise rules: data visibility, fee-plan overrides, editing rights, royalty.
6. Who may collect cash: managers only (assumed) vs additional staff.
7. Reminder schedule (3 days before, due date, then 3/7/14 days after).
8. Whether parents are notified automatically on reversals.
