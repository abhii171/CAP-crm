# WORKFLOWS-PHASE-2.md — CPA Cricket Academy CRM

Extends `WORKFLOWS.md`. Phase 1 workflows (sections 1 to 9 and beyond) are **not edited**. Phase 2 adds numbered workflows `W2-x`. Admission (Phase 1, section 1) remains the only way a student is created. Conversion calls it; it does not replace it.

Format for each workflow: Actor, Trigger, Steps, Rules, Failure cases, Audit.

---

## W2-1 Create an enquiry (staff)
- **Actor:** admin or manager (own branch).
- **Trigger:** walk-in, phone call or message received.
- **Steps:**
  1. Open "New enquiry". Enter name (child), guardian name, phone, age, interest, source.
  2. Phone is normalised. The system checks existing enquiries and students.
  3. If a match exists, show a warning with a link. Staff can open the existing record, or continue with a short reason.
  4. Save. Status `NEW`. Owner defaults to the creator. An optional first follow-up date can be set.
  5. If the guardian agreed to WhatsApp contact, staff tick consent (recorded as staff-recorded verbal consent).
- **Rules:** only name and phone are mandatory. Branch comes from the session (admin chooses).
- **Failure:** invalid phone → inline error. Duplicate within the same branch and active → strong warning.
- **Audit:** `p2.enquiry.create`.

## W2-2 Website enquiry
- **Actor:** visitor.
- **Steps:**
  1. Visitor selects a branch, fills the form, ticks the consent box (optional) and passes the captcha.
  2. Server validates, rate-limits, checks honeypot, normalises phone.
  3. An enquiry is created: source `website`, status `NEW`, unassigned, in the chosen branch.
  4. Visitor sees a generic thank-you. A `NEW_ENQUIRY_UNASSIGNED` notification goes to that branch's manager.
- **Rules:** the response never reveals whether the phone already exists. A duplicate active enquiry is still created but flagged `possible_duplicate` for the manager to merge or ignore.
- **Failure:** captcha failed or rate limit hit → generic error; counted in metrics. Branch flag off → form hidden or polite message.
- **Audit:** `p2.enquiry.create_public` (no personal data in application logs).

## W2-3 Duplicate handling
- **Trigger:** a flagged duplicate on any creation.
- **Steps:** manager opens the pair side by side and chooses **Keep both**, **Merge into existing** (notes and follow-ups moved, the other becomes `LOST` with reason "duplicate", linked), or **It's an existing student** (open student record).
- **Rules:** merge is irreversible except by reopening the lost record manually; history is kept on both.
- **Audit:** `p2.enquiry.merge`.

## W2-4 Move through the pipeline
- **Actor:** owner or manager.
- **Allowed transitions:**

| From | To |
|---|---|
| NEW | CONTACTED, TRIAL_SCHEDULED, LOST |
| CONTACTED | TRIAL_SCHEDULED, LOST, NEW (undo) |
| TRIAL_SCHEDULED | TRIAL_DONE, CONTACTED (trial cancelled), LOST |
| TRIAL_DONE | CONVERTED (via W2-8 only), CONTACTED, LOST |
| LOST | NEW or CONTACTED (reopen, W2-9) |
| CONVERTED | none |

- **Rules:** `TRIAL_SCHEDULED` needs a booked trial (W2-7). `CONVERTED` can only be set by the conversion workflow. Every move writes a stage-history row. Two simultaneous edits are resolved by the `version` check; the second user is asked to refresh.
- **Audit:** `p2.enquiry.stage_change`.

## W2-5 Follow-ups
- **Steps:**
  1. Add a follow-up: due date and time, channel (call, WhatsApp, visit), note.
  2. On the due time it appears in "My follow-ups today". If not done by end of day it is flagged overdue and a notification is raised (W2-10).
  3. After contact, mark done with an outcome and optionally schedule the next one. Done also moves the enquiry to `CONTACTED` if it was `NEW`.
- **WhatsApp follow-up:** a staff member may send an approved template to an enquiry only if: consent exists, the number is not suppressed in Phase 1 opt-out data, and the branch has the template approved. Sending goes through the Phase 1 queue, so retry and logs apply.
- **Rules:** an enquiry always has at most one *next* follow-up shown; others are history. `next_follow_up_at` is derived.
- **Audit:** `p2.followup.create`, `p2.followup.done`.

## W2-6 Owner left or reassignment
- **Single reassignment:** manager picks a new owner from users of the same branch (admin: any manager or admin).
- **Bulk reassignment:** filter enquiries by owner or status, select, reassign, with confirmation count.
- **Owner deactivated in Phase 1:** nothing happens in Phase 1. A scheduled check finds open enquiries whose owner is inactive, shows them in the branch "needs owner" list and raises a notification. They remain visible to the manager.
- **Audit:** `p2.enquiry.assign`.

## W2-7 Trial booking and outcome
- **Steps:**
  1. From the enquiry, choose a batch and a date matching the batch schedule.
  2. System checks: batch active, date valid, guest soft limit not exceeded (default 3), no existing active trial for the enquiry (default one trial).
  3. Enquiry moves to `TRIAL_SCHEDULED`. If consent exists, a reminder template may be sent per branch setting.
  4. On the day, the coach sees the guest's name and age in the Phase 2 trial list (not in the Phase 1 attendance sheet). The manager or coach marks `ATTENDED` or `NO_SHOW`.
  5. `ATTENDED` moves the enquiry to `TRIAL_DONE`. `NO_SHOW` allows one reschedule if the rule permits, otherwise back to `CONTACTED`.
- **Rules:** trials never create attendance rows or affect batch capacity.
- **Audit:** `p2.trial.book`, `p2.trial.outcome`.

## W2-8 Convert to student
- **Actor:** owner or manager. **Precondition:** status `TRIAL_DONE` (manager may override to convert from `CONTACTED` with a reason).
- **Steps:**
  1. Click Convert. The Phase 1 admission form opens with name, guardian, phone, age and consent pre-filled (touchpoint T3).
  2. Staff complete the remaining admission fields and the batch assignment as usual.
  3. On successful admission (Phase 1 service), the enquiry is updated in one transaction: status `CONVERTED`, `converted_student_id` set, `converted_at` set.
  4. If step 3's update fails after the student exists, a repair job links them by the stored pending reference; the student is never created twice.
- **Rules:** Phase 1 admission rules (duplicate check, unique student ID, capacity) apply unchanged. The enquiry cannot be converted twice (unique constraint). Consent given for enquiry contact is copied into the Phase 1 consent record only if the guardian confirms at admission; it is not assumed.
- **Failure:** admission validation fails → the enquiry stays as it was.
- **Audit:** `p2.enquiry.convert`, plus the Phase 1 admission audit.

## W2-9 Lost and reopen
- **Lost:** any open stage → `LOST`, reason required, optional note. Pending follow-ups are cancelled and pending trials are cancelled.
- **Reopen:** admin or manager returns it to `NEW` or `CONTACTED`; the reason is recorded; the enquiry gets a fresh follow-up.
- **Rule:** an enquiry lost because the number sent STOP stays suppressed for messaging even if reopened.
- **Audit:** `p2.enquiry.lost`, `p2.enquiry.reopen`.

## W2-10 Staff notifications
Evaluators run on a schedule (every 5 to 15 minutes depending on the event) and create events with a deduplication key. Recipients are resolved by role and branch.

| Event | Key pattern | Default audience | Critical |
|---|---|---|---|
| New unassigned website enquiry | `ENQ_NEW:{enquiryId}` | Manager of the branch | no |
| Follow-up overdue | `FU_OVERDUE:{followUpId}:{date}` | Owner, then manager next day | no |
| Enquiry needs owner | `ENQ_NO_OWNER:{branchId}:{date}` | Manager | no |
| Trial today | `TRIAL_TODAY:{trialId}` | Coach of the batch, manager | no |
| Day not closed | `UNCLOSED_DAY:{branchId}:{date}` | Manager, admin after 24 h | yes |
| Failed WhatsApp messages above threshold | `MSG_FAILED:{branchId}:{date}` | Manager | no |
| Unmatched online payment pending | `PAY_UNMATCHED:{branchId}:{date}` | Admin | yes |
| Reversal awaiting approval | `REV_PENDING:{reversalId}` | Admin | yes |
| Reconciliation mismatch (dashboard vs report) | `RECON:{date}` | Admin | yes |
| Batch near capacity | `CAPACITY:{batchId}:{week}` | Manager | no |

- **Rules:** unique `dedupe_key` makes reruns harmless. Users can mute non-critical types and set quiet hours; critical ones always arrive. Digest bundles unread non-critical items once per day.
- **Phase 1 untouched:** evaluators only read Phase 1 tables.

## W2-11 Dashboard use
- On open, each tile requests its own metric with the user's scope. Tiles render independently with loading skeletons.
- Today's values: live. Previous days: snapshots.
- Drill-down passes the same filters to a list. If the list total differs from the tile, a reconciliation alert is raised (this should never happen).
- **Nightly job:** rebuild yesterday's `metric_daily_branch` for each branch, then compare with the Phase 1 report queries for the same day; mismatch → event `RECON`.
- **Rebuild:** the snapshot for any `(branch, date)` can be recomputed safely and repeatedly.

## W2-12 Content: draft, publish, rollback
1. Author creates a page (type, slug, title, body). Revision 1 is saved as draft. Slug is unique within the scope (branch or academy-wide).
2. Edits create new revisions; the published pointer does not move.
3. Publish: choose a revision; the pointer moves; the public cache is refreshed.
4. Rollback: choose an earlier revision to publish; the pointer moves. No revision is deleted.
5. Unpublish: pointer cleared; the page becomes draft again.
6. Archive: hidden from lists; recoverable by admin.
- **Rules:** body is sanitised Markdown. Raw HTML and scripts are stripped on write and on render. Publishing a page that references a deleted media item is blocked.
- **If review is on (D-12):** author submits, admin approves, then it publishes.
- **Audit:** `p2.content.create`, `.edit`, `.publish`, `.rollback`, `.archive`.

## W2-13 Media upload
- Allowed: JPG, PNG, WebP up to 5 MB. Server checks content type from the file bytes, not the file name. Location metadata is stripped. Large images are resized and a thumbnail is created. Alt text is mandatory. Stored in object storage under a random key and served through the CDN.
- Delete is soft; media used by a published revision cannot be deleted until unpublished or replaced.

## W2-14 Retention and erasure of enquiry data
- **Scheduled retention (D-10):** a monthly job finds enquiries (lost, or stale and unconverted) with no activity for the configured period. It anonymises them: name and contact details replaced with a marker, free-text notes cleared, phone replaced by a salted hash (so duplicate detection still works without the number). Stage history and counts remain for reporting.
- **Erasure request:** admin searches by phone, confirms identity per the academy's process, runs "Anonymise now". Related consent records are anonymised too. The student record, if converted, follows Phase 1 rules and is not touched here.
- **Never** delete rows; anonymise. Audit entries keep ids only.
- **Audit:** `p2.enquiry.anonymise`.

## Cross-workflow rules
1. All Phase 2 writes happen inside a transaction with the audit entry.
2. Time rules use `Asia/Kolkata` for "today" and "overdue".
3. A flag turned off hides the feature and stops its evaluators; data is retained.
