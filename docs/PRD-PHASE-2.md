# PRD-PHASE-2.md — CPA Cricket Academy CRM

Addendum to the Phase 1 PRD. It does not replace it. Read `00-ARCHITECTURE-DECISIONS-PHASE-2.md` first.

## 1. Purpose

Phase 1 runs the academy: students, attendance, fees, receipts, WhatsApp. Phase 2 helps it **grow and see clearly**:

1. Capture every enquiry and convert more of them into students.
2. Tell staff what needs attention, without them hunting for it.
3. Give each role a fast, trustworthy view of how things stand.
4. Let the academy keep its public content current without a developer.

## 2. Non-goals (Phase 3 or later)

Progress reports, events, inventory, parent portal, student or parent logins, a separate Front Desk or Sales role, payments for trials, marketing campaigns or bulk broadcasts, lead scoring, third-party ad integrations, royalty calculation.

## 3. Users and roles

Same three roles as Phase 1: **admin**, **manager** (one branch, owned or franchise), **coach**. A visitor to the public website is a fourth, unauthenticated actor who can only submit an enquiry. No new roles are added. Enquiries use a generic `assigned_to` so a Front Desk role can be added later without a data change.

## 4. Feature requirements

### 4.1 Enquiry pipeline

| ID | Requirement | Acceptance |
|---|---|---|
| E-1 | Staff can create an enquiry in under 30 seconds with: child name, guardian name, phone, child age, interest, source. | Only name and phone are mandatory. |
| E-2 | The website form creates enquiries in the chosen branch. | Rejected without captcha pass; rate-limited per IP and per phone. |
| E-3 | Duplicate detection by normalised phone against enquiries *and* students. | Staff see a warning with a link to the existing record; they can proceed with a reason, or open the existing one. |
| E-4 | Fixed stages: New, Contacted, Trial scheduled, Trial done, Converted, Lost. | Invalid jumps are rejected by the server. |
| E-5 | Lost requires a reason from a list; lost enquiries can be reopened. | Reopen is recorded in history. |
| E-6 | Each enquiry has an owner (`assigned_to`). New enquiries from the website start unassigned in the branch queue. | Manager can assign and bulk reassign. |
| E-7 | Follow-ups with due date, channel and note; overdue ones are flagged. | A list "My follow-ups today" exists for each user. |
| E-8 | Trial booking into a batch, with attendance outcome (attended, no-show, cancelled). | Trials do not change Phase 1 attendance or capacity. |
| E-9 | One-click conversion into a student using the Phase 1 admission flow with data pre-filled. | Exactly one student is created; the enquiry is locked as Converted. |
| E-10 | WhatsApp messages to enquiries only with recorded consent, an approved template, and suppression check. | A number that sent STOP is never messaged. |
| E-11 | Enquiries of a deactivated owner appear in the branch's "needs owner" list. | Visible to the manager; counted on dashboard. |
| E-12 | Retention: lost or stale enquiries are anonymised after the configured period; erasure requests are handled. | See workflow W2-14. |

### 4.2 Staff notifications

| ID | Requirement |
|---|---|
| N-1 | In-app notification centre with unread count, per user. |
| N-2 | Event catalogue (see `WORKFLOWS-PHASE-2.md`, W2-10). Each event has a default audience by role and branch. |
| N-3 | Users can mute non-critical event types and set quiet hours. Critical events cannot be muted. |
| N-4 | Repeated conditions do not repeat notifications (deduplication). |
| N-5 | Optional daily digest (in-app). |
| N-6 | Staff are never notified about another branch. |

Staff WhatsApp notifications are out of scope in Phase 2 (default decision D-06).

### 4.3 Dashboards

| ID | Requirement |
|---|---|
| D-1 | Coach: today's batches, attendance still to mark, absentees, trial guests today. |
| D-2 | Manager: today's collections (cash, online), outstanding and overdue, attendance trend, enquiry funnel, follow-ups due, unclosed days, needs-owner count, failed messages. |
| D-3 | Admin: all of the above across branches, owned vs franchise comparison, conversion by branch and source, collection gaps. |
| D-4 | Every tile can drill down to a filtered list; the list total equals the tile. |
| D-5 | Date ranges: today, 7 days, 30 days, this month, custom. |
| D-6 | CSV export of drill-down lists, subject to the user's branch scope. |
| D-7 | Totals must equal Phase 1 reports for the same period (reconciled nightly). |
| D-8 | First paint in under 2 seconds on a mid-range phone on a normal mobile connection; tiles load independently. |

### 4.4 Content manager

| ID | Requirement |
|---|---|
| C-1 | Content types: page, announcement, gallery. Public batch timings come from a visibility list over Phase 1 batches. |
| C-2 | States: draft, published, archived. Optional review step controlled by a setting (default off). |
| C-3 | Every edit creates an immutable revision; rollback is one action. |
| C-4 | Images only (JPG, PNG, WebP), maximum 5 MB, alt text required, location data removed. |
| C-5 | Academy-wide content is admin only. Branch content is editable by the manager of an **owned** branch. Franchise branches cannot edit content (decision D-08). |
| C-6 | Unpublished drafts are never publicly retrievable. |
| C-7 | Public read API is cached and rate-limited. |

## 5. Non-functional requirements

- **Isolation:** with Phase 2 flags off, Phase 1 behaves exactly as before (see architecture file, section 3).
- **Security:** all authenticated endpoints branch-scoped on the server; public endpoints separate, minimal and abuse-resistant.
- **Performance:** pipeline board with 5,000 open enquiries per branch loads in under 2 seconds with filters; dashboard tiles each under 500 ms from snapshots.
- **Privacy:** enquiry data is personal data of parents and children. Collect only what is needed, record consent, honour STOP, anonymise on schedule. Confirm obligations under India's Digital Personal Data Protection Act with whoever advises the academy.
- **Auditability:** every enquiry change, reassignment, conversion, publish and rollback is audited (`p2.` actions).
- **Observability:** metrics for form submissions (accepted, blocked), evaluator runs, notification counts, dashboard query times, reconciliation mismatches.
- **Accessibility and usage:** mobile-first for managers and coaches; keyboard friendly on desktop.

## 6. Success measures for the pilot month

- 100% of walk-in and phone enquiries at the pilot branch recorded.
- Median first-response time tracked (target agreed in decision D-04).
- At least one enquiry converted to a student without re-entering data.
- Zero reconciliation mismatches over 7 consecutive days.
- Zero Phase 1 regressions reported.
- Managers open the dashboard on most working days.

## 7. Decision register

| ID | Decision | Needed before | Default used (mark `TODO(decision)` in code) |
|---|---|---|---|
| D-01 | Enquiry sources list | 2.1 | Walk-in, phone, website, referral, social media, other |
| D-02 | Can franchise managers manage enquiries for their branch? | 2.1 | Yes, own branch only. Confirmed: Phase 1 `AUTH-AND-PERMISSIONS.md` § 6.1 explicitly assigns `BRANCH` access for enquiries to all branch managers. |
| D-03 | Does an unknown inbound WhatsApp number create an enquiry? | 2.1 | No |
| D-04 | First-response target | 2.3 | 24 hours; flagged only, no automatic action |
| D-05 | Trial rules | 2.4 | Free; one trial per enquiry; 3 guests per session soft limit |
| D-06 | Staff notification channels | 2.5 | In-app only |
| D-07 | Dashboard freshness | 2.6 | Live for today, snapshot for history |
| D-08 | Content editing for franchise branches | 2.8 | Not allowed |
| D-09 | Website: separate app or served by CRM | 2.8 | Not chosen; decide before 2.8 |
| D-10 | Enquiry retention | 2.9 | Anonymise 12 months after last activity (placeholder in config) |
| D-11 | Public form: branch selection | 2.1 | Visitor must choose a branch |
| D-12 | Content review step | 2.8 | Off |
| D-13 | Captcha provider | 2.1 | Not chosen; decide before 2.1 |
