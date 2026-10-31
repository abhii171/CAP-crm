# CPA Cricket Academy CRM — Product Requirements Document

Oct 29, 2026 · @Abhijeeth

## 1. Overview

V1 of the CPA Cricket Academy CRM runs daily operations (students, batches, attendance, fees) across owned and franchise branches, with WhatsApp as the only parent channel. Enquiries, dashboards and the website content manager follow in Phase 2.

**Goals**

- One system for every branch, with data strictly scoped by branch and role
- Coach-marked attendance that triggers a WhatsApp alert to parents within minutes
- Fee records that stand up to disputes: receipts, no edits, reversal entries, full audit trail

**Decisions already made**

- One manager manages exactly one branch
- No parent or student login in v1; parents are reached by WhatsApp only
- Fees are collected both in cash and online
- No sales or front-desk role yet; enquiries are assigned to managers or admin
- Branches are a mix of owned and franchise

**Non-goals for v1**

Parent portal, performance analytics, tournaments, inventory, payroll, and multi-branch managers.

**Assumptions (change if wrong)**

- Web app, mobile-first for coaches; attendance must tolerate weak ground signal
- Currency INR; GST treatment to be confirmed with your CA
- Parent-facing messages in English first, Telugu and Hindi templates later

## 2. Roles, branch types and permissions

Three roles in v1, each with a fixed scope, enforced in backend queries and never only by hiding buttons.

| Role | Scope | Created by | Login |
| --- | --- | --- | --- |
| Admin | All branches | System owner | Email + password, 2FA required |
| Manager | Exactly one branch (`branch_id` fixed on the user) | Admin | Auto-generated ID + password, forced change on first login, 2FA recommended |
| Coach | Own batches only | Admin or own-branch manager | Auto-generated ID + password, forced change on first login |

**Branch types.** Every branch has `branch_type` = owned or franchise. Permissions and fee rules read this field; nothing is hard-coded to a branch name such as Kukatpally.

**Permission matrix.** A = all branches, B = own branch, M = own batches, R = read only, X = no access.

| Action | Admin | Manager | Coach |
| --- | --- | --- | --- |
| Create / edit branches | A | X | X |
| Create managers, assign to branch | A | X | X |
| Create / edit coaches | A | B (owned branch only; franchise = open decision) | X |
| Deactivate coaches | A | B | X |
| Create / edit batches, assign coaches | A | B (owned branch only; franchise = open decision) | X |
| Add students (unique ID auto-generated) | A | B | X |
| View students | A | B | M |
| Deactivate students (never delete) | A | B | X |
| Mark attendance | X (override, logged) | X (override, logged) | M |
| View attendance and percentages | A | B | M |
| Record fee payments | A | B | X |
| View fee records | A | B | X |
| Edit or delete a fee record | X | X | X |
| Reverse a fee entry (with reason) | A | B (up to a limit set by admin) | X |
| View audit log | A | B (own branch) | X |
| Notifications | A | B | X |
| Website content (Phase 2) | A | X | X |

**Rules that cut across modules**

1. A manager cannot change their own branch, role or password reset rights; only admin can.
2. Coaches never see fee data, in any screen or API response.
3. Nothing is deleted. Students, coaches and managers move to Inactive; the audit log keeps who did it and when.
4. Admin and manager overrides on attendance are allowed but always logged with a reason.

## 3. MVP modules

### 3.1 Students

- Unique student ID generated on creation, immutable, never reused (suggested format: branch code + year + sequence, e.g. KUK-26-0001)
- Profile: name, date of birth (age group derived), photo, school, batting/bowling role, skill level, blood group, medical conditions and injuries, kit size
- Parent/guardian: at least one WhatsApp number, a second contact, an emergency contact; siblings linked
- Consent record captured at admission: WhatsApp opt-in and data consent from the parent, with date and who recorded it
- Status: Trial, Active, Inactive (deactivation needs a reason and date); students can be moved between batches and branches with history kept
- Filter by branch, batch, status, age group; search by name, ID or phone; bulk import from Excel/CSV

### 3.2 Batches

- Fields: name, branch, venue/net, days and timings, age group, capacity, fee plan, assigned coach(es)
- Add many students to a batch in one action; one student may be in multiple batches
- Capacity limit with a waitlist; warn on coach double-booking and on ground/net clashes
- Holidays, rain cancellations and make-up sessions are recorded on the session calendar, and trigger a parent notice
- Editable by admin, and by the manager of an owned branch (franchise rule: open decision)

### 3.3 Coaches

- Profile: name, phone, qualifications, assigned branch and batches, status (Active/Inactive, never deleted)
- Unique ID and auto-generated password on creation; password stored hashed, forced change on first login
- Assigned to batches from the coach screen or the batch screen; same rule either way

### 3.4 Attendance

- Coach opens today's session for their own batch and marks each student Present, Absent, Late or Excused; "mark all present" first, then tap exceptions
- Mobile-first, works with weak signal: marks save on the phone and sync when the connection returns
- Saving triggers WhatsApp alerts for absent students after a short hold (suggested 10 minutes) so a coach can fix a mis-tap before a parent is alarmed
- Edit window: the coach can correct same day; later changes need manager or admin, with a logged reason
- Substitute coach can be assigned to a single session and gets access for that session only
- Attendance percentage = (Present + Late) / sessions held; Excused sessions and cancelled sessions are excluded. Confirm this formula with the academy.
- Managers and admin view only, within their scope

### 3.5 Fees

Fees are the highest-risk module, so records are append-only.

- Fee plans per batch or student: monthly, quarterly, annual, plus one-time charges (admission, kit, camps)
- Dues are generated per student with a due date; partial payments and instalments are allowed; overdue status is calculated
- Discounts (sibling, scholarship) and pro-rata for mid-month joining; fee pause for injury or travel with approval
- Payment modes: cash, UPI, card, online gateway (Razorpay or similar), bank transfer
- Every payment gets a receipt with a sequential number per branch, the collector's name, mode and timestamp
- Online payments auto-match to the student's dues; a payment link can be sent over WhatsApp
- No edit, no delete. Mistakes are fixed by a reversal entry (reason required) followed by a corrected entry, both visible in the history
- Daily cash close: each branch manager confirms the day's cash collection total; differences are flagged to admin
- Visibility: coaches never see fees; managers see their own branch; admin sees all (franchise visibility: open decision)
- Automatic WhatsApp reminders before and after the due date

## 4. WhatsApp message flows

Without a parent portal, WhatsApp carries every parent-facing interaction. It needs the official WhatsApp Business API (through a provider), Meta-approved message templates, and recorded parent opt-in. Each message has a per-message cost, so budget it per branch.

| Message | Trigger | Sent to | Notes |
| --- | --- | --- | --- |
| Absence alert | Coach saves attendance with Absent, after the 10-minute hold | Parent WhatsApp | Cancelled automatically if the coach corrects the mark during the hold |
| Fee due reminder | 7 days before due date | Parent | Includes amount, due date and payment link |
| Fee overdue reminder | 1, 7 and 15 days after due date | Parent | Escalates to manager list after 15 days |
| Payment receipt | Payment recorded (cash or online) | Parent | Receipt number and amount; PDF or link |
| Holiday / rain notice | Session cancelled on the calendar | All parents in the batch | Bulk send, one tap by manager |
| Admission welcome | New student created with opt-in | Parent | Batch, timings, coach, branch contact |
| Absence streak | 3 consecutive absences | Manager (in-app) and parent | Helps retention before a student drops out |
| Balance query | Parent replies "balance" | Parent | Automatic reply with outstanding amount and link (Phase 2 if complex) |

**Handling replies.** Parents will reply to these messages. Every inbound message lands in a shared inbox view in the CRM, scoped to the branch, so the manager or office staff can answer. The branch manager owns replies and gets an in-app alert for each new inbound message.

**Absence alert flow**

1. Coach marks attendance and taps Save.
2. Absent students are queued; the 10-minute hold starts.
3. If the coach edits a mark within the hold, the queued message is cancelled or updated.
4. After the hold, the template is sent to each parent's WhatsApp number.
5. Delivery status (sent, delivered, read, failed) is stored against the attendance record.
6. Failed sends fall back to SMS and are listed for the manager.

**Compliance.** Only message parents with recorded opt-in. Provide a STOP reply that flips the opt-in flag. Keep templates short, factual and free of marketing content so approval is fast.

## 5. Entity outline

Every table except `branch` and `user` carries `branch_id`, `created_at`, `created_by`, and `updated_at`. Every query filters by the caller's branch scope.

| Entity | Key fields | Relationships |
| --- | --- | --- |
| branch | id, name, code, branch\_type (owned/franchise), address, status | has many users, batches, students |
| user | id, login\_id, password\_hash, role (admin/manager/coach), branch\_id, status, must\_change\_password, last\_login | manager: one branch; coach: one branch |
| student | id, student\_code (unique), name, dob, photo, school, role, skill\_level, medical\_notes, status, joined\_on, branch\_id | has many guardians, enrolments, attendance, fee\_dues |
| guardian | id, student\_id, name, relation, whatsapp\_number, is\_primary, opt\_in, opt\_in\_at | belongs to student; siblings linked by shared guardian |
| consent | id, student\_id, guardian\_id, type, given\_at, recorded\_by | belongs to student |
| batch | id, branch\_id, name, venue, days, start\_time, end\_time, age\_group, capacity, fee\_plan\_id, status | has many enrolments, sessions, coach assignments |
| batch\_coach | batch\_id, coach\_user\_id, from\_date, to\_date | links batch and coach, with history |
| enrolment | id, student\_id, batch\_id, joined\_on, left\_on, status (active/waitlist/left) | links student and batch |
| session | id, batch\_id, date, status (held/cancelled/makeup), cancel\_reason, coach\_user\_id | has many attendance rows |
| attendance | id, session\_id, student\_id, status (present/absent/late/excused), marked\_by, marked\_at, edited\_by, edit\_reason, notification\_status | belongs to session and student |
| fee\_plan | id, name, amount, frequency, branch\_id or global | used by batches and students |
| fee\_due | id, student\_id, plan\_id, amount, due\_date, discount, status (open/partial/paid/overdue) | has many payments |
| payment | id, due\_id, amount, mode, receipt\_no (sequential per branch), collected\_by, collected\_at, gateway\_ref | append-only |
| reversal | id, payment\_id, amount, reason, approved\_by, created\_at | append-only; offsets a payment |
| cash\_close | id, branch\_id, date, expected, counted, closed\_by, variance | one per branch per day |
| message\_log | id, to\_number, template, student\_id, status, sent\_at, provider\_ref | audit of every WhatsApp/SMS |
| inbound\_message | id, from\_number, guardian\_id, body, received\_at, handled\_by | shared inbox |
| audit\_log | id, actor\_id, action, entity, entity\_id, before, after, reason, ip, at | append-only, immutable |

**Design rules**

- Soft state only: students, coaches and managers have a status, never a delete.
- `payment` and `reversal` rows are never updated; the current balance is derived from them.
- Receipt numbers are allocated inside a transaction to avoid gaps and duplicates per branch.
- Phone numbers are stored in E.164 format and checked for duplicates.

## 6. Phased scope

Phase 1 is what the academy cannot run without; each later phase builds on stable data from the one before.

| Phase | Scope | Exit check |
| --- | --- | --- |
| 1. MVP | Roles and branch scoping, branch types, students with consent, batches, coaches, coach attendance with WhatsApp absence alerts, fees (plans, cash + online, receipts, reversals, reminders), audit log, outstanding-fee and collection reports, bulk import | One owned branch runs a full month on the system, with fee totals matching the old records |
| 2. Growth | Enquiry pipeline, dashboards, notifications, content manager, WhatsApp shared inbox improvements | Every new lead has an owner and a next follow-up date; admin dashboard matches the branch reports |
| 3. Differentiators | Progress reports and skill assessments, events and tournaments, kit inventory, optional parent portal | Parents receive a monthly progress report; portal only if WhatsApp alone proves insufficient |

### Phase 2 detail

- **Enquiries:** status pipeline (New, Contacted, Trial booked, Trial done, Joined, Lost with reason); source tracking (website, walk-in, Instagram, referral, ads); follow-up reminders and overdue alerts; duplicate detection by phone; one-click conversion from lead to student; website form feeds directly in. Admin sees all branches, a manager sees their own. Assignment uses a generic "assigned to" field so a Front Desk role can be added later at no cost.
- **Dashboard:** total students, fees pending, new leads, lead conversion, branch summary. Admin sees all branches; manager sees their own. Definitions are fixed up front: an active student is one with status Active and at least one active enrolment; conversion = joined / new leads in the period.
- **Notifications:** events are new lead, follow-up due, fee overdue, absence streak, new admission, failed WhatsApp send. Channels are in-app first, then email or push. Visible to admin and the manager of that branch only.
- **Content manager:** admin controls website blogs, photos, achievements, programme timings and batch listings. Franchise listing rules are an open decision.

### Phase 3 detail

- **Progress reports:** skill assessments, coach remarks, fitness tests and match stats, delivered to parents monthly by WhatsApp as a PDF or link.
- **Events:** camps, trials, matches and registrations.
- **Inventory:** kit and equipment per branch.
- **Parent portal:** only if needed; read-only attendance, fees and reports.

## 7. Security, audit and compliance

**Access and credentials**

- Passwords are generated by the system, shown once, stored hashed, and must be changed on first login; admin can reset but never view them
- Login rate limiting and lockout after repeated failures; 2FA mandatory for admin and recommended for managers
- Row-level branch filtering in the backend for every read and write; automated tests cover cross-branch access attempts
- Sessions expire; coach sessions on shared phones are cleared on logout

**Audit log**

Records who did what, on which record, when, and why, for: logins, fee entries and reversals, attendance edits, student, coach and manager status changes, batch changes, and permission changes. It is append-only and visible to admin (all) and managers (own branch).

**Children's data (India)**

The academy stores personal data of minors. The Digital Personal Data Protection Act, 2023 requires verifiable parental consent for processing a child's data. The CRM records consent at admission, stores a consent history, and supports a withdrawal request. Have a lawyer confirm the consent wording and retention rules before launch.

**Retention and erasure**

Deactivation keeps data for reporting and fee disputes. Define a retention period (suggested: fee records per your accountant's advice, other personal data erased or anonymised on request once dues are settled). Erasure requests are logged.

**Backups and availability**

Daily automated backups, tested restores, and a documented recovery time. Fee and attendance data should survive a coach's phone failure because marks sync to the server.

**Data migration**

Bulk import from Excel or CSV for students, guardians, batches and opening fee balances, with a dry-run that reports duplicates and bad phone numbers before anything is saved. Opening balances are imported as dated entries, not edits.

## 8. Open decisions

The franchise questions block the permission rules for batches, coaches, fees and content. The defaults below are what this PRD assumes until you decide.

| Question | Why it matters | Assumed default |
| --- | --- | --- |
| Who owns student data and fee money at a franchise? | Decides whether admin sees franchise fee details | Admin sees all data; franchise money is tracked but flagged as franchise |
| Is there a royalty or revenue share? | Needs calculation and a per-franchise report | None in v1 |
| Can a franchise set its own fee amounts? | Fee plans may be branch-level or global | Global plans only in v1 |
| Can a franchise manager edit batches and coaches? | Your spec lets only owned-branch managers do this | Franchise managers can view only; admin edits |
| Does the website list franchise branches? | Affects the content manager | Yes, listing controlled by admin |

**Other items to confirm**

- [x] Who monitors parent WhatsApp replies: manager, office staff or a shared inbox?
- [x] Attendance percentage formula (section 3.4)
- [x] Length of the absence-alert hold (suggested 10 minutes)
- [x] Overdue fee reminder schedule (suggested 3 days before, then 1, 7 and 15 days after)
- [x] GST applicability on fees (ask your CA)
- [x] Maximum reversal amount a manager may approve without admin
- [ ] WhatsApp provider and monthly message budget
- [x] Languages needed for parent messages beyond English
- [x] Data retention period for inactive students
- [x] Whether a front-desk or sales role is needed before Phase 2

**Confirmed answers (29 Oct 2026)**

- Parent WhatsApp replies are handled by the branch manager
- Attendance percentage formula confirmed as written in section 3.4
- Fee reminder goes out 1 week before the due date (overdue reminders after the due date stay at 1, 7 and 15 days unless you change them)
- GST applies to fees: receipts need GSTIN, GST rate and tax breakup; confirm rates and invoice format with your CA
- Manager reversal limit: decide later; until then every reversal needs admin approval
- Parent messages in English only for now

**Still need your answer**

- Absence-alert hold: you answered "no" to 10 minutes. Should the alert go instantly, or after a different delay?
- WhatsApp provider and monthly message budget
- Data retention period for inactive students
- Whether a front-desk or sales role is needed before Phase 2
