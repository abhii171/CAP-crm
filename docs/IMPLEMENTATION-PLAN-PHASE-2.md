# IMPLEMENTATION-PLAN-PHASE-2.md — CPA Cricket Academy CRM

Extends `IMPLEMENTATION-PLAN.md`. The Phase 1 plan is not edited; its section 3 ("Phase 2") is superseded by this file.
Source documents: the Phase 1 set plus the `-PHASE-2` files. If this plan conflicts with any of them, stop and ask; do not guess.

---

## 0. Rules for the AI assistant (read before every task)

All ten Phase 1 rules still apply. Phase 2 adds:

11. **Phase 1 is read-only.** Do not edit Phase 1 files, tables, columns or tests. The only allowed touchpoints are T1 to T5 and the Prisma back-relations listed in `00-ARCHITECTURE-DECISIONS-PHASE-2.md`. Anything else: stop and ask.
12. **Additive migrations only.** No `ALTER` of a Phase 1 table. Every migration has a down script that drops only its own objects.
13. **Everything is behind a feature flag** (`p2.enquiries`, `p2.notifications`, `p2.dashboards`, `p2.content`). With flags off, behaviour equals Phase 1.
14. **Never write to WhatsApp directly.** Go through the Phase 1 queue. Check consent and suppression by normalised phone first.
15. **One definition per metric.** Dashboards use the metrics layer only.
16. **Never create a student outside the Phase 1 admission service.**
17. **No Phase 3 work:** progress reports, events, inventory, parent portal, bulk campaigns, lead scoring.
18. **Every PR passes the regression gate** (below). A red Phase 1 test means stop, not "fix the test".
19. **Mark default decisions** with `TODO(decision)` and the decision id (for example `TODO(decision D-05)`).
20. **No personal data in logs, notification payloads or metrics.**

### The regression gate (run on every PR)
1. Phase 1 test suite, unmodified, green.
2. Schema guard: no Phase 1 table or column differs from the Phase 1 baseline.
3. Flags-off snapshot: menu, route list and permission matrix equal Phase 1.
4. Branch-isolation tests for any new endpoint.

---

## 1. Dependency overview

```
2.0 Gate + guardrails
   └── 2.1 Enquiry model + capture
          └── 2.2 Pipeline
                 └── 2.3 Follow-ups
                        └── 2.4 Trials + conversion ─────────┐
                                                             ▼
        2.5 Notification framework ◄─ (needs 2.3 events)   2.6 Metrics layer ─► 2.7 Dashboards
                                                             ▲
        2.8 Content manager (independent, parallel) ─────────┘ (only shares auth, audit)

2.9 Hardening + rollout
```

Hard dependencies:
- 2.0 before everything.
- Conversion (2.4) needs the Phase 1 admission service and the enquiry flow before it.
- Metrics (2.6) needs enquiries and trials so funnel numbers exist.
- 2.8 can run in parallel with 2.1 to 2.7 by a second stream; it shares nothing but auth, audit and media storage.
- The public form (inside 2.1) must not go live before 2.9's abuse tests; ship it disabled.

---

## 2. Steps

### Step 2.0 Exit gate and guardrails
- **Deliverables (no feature code):**
  - Phase 1 review: pilot-month defects, WhatsApp failure rate, receipt and daily-close discrepancies, slow screens. Phase 1 blockers fixed or accepted in writing.
  - Decisions D-01 to D-13 recorded (defaults are acceptable if written down).
  - Verification checklist from `DATABASE-DESIGN-PHASE-2.md` section 9 completed (model names, id type, phone normaliser, opt-out store, admission service, business-day boundary).
  - Guardrails in code: `feature_flags` table and helper, schema guard script, flags-off snapshot tests, CI gate, `src/modules/phase2` skeleton with lint rule that forbids Phase 1 modules importing it.
  - Parallel non-code task: submit WhatsApp templates for enquiry follow-ups and trial reminders (marketing or utility category as Meta classifies them). Approval takes time.
- **Depends on:** Phase 1 exit criteria met.
- **Done when:** CI gate runs green on an empty Phase 2 change; flags exist and default off.

### Step 2.1 Enquiry model and capture
- **Deliverables:** migration `p2_001`, `p2_002`; enquiry create (manual); phone normalisation reuse; duplicate detection across enquiries and students; consent capture; audit entries; permission keys registered (T1); menu entry behind flag (T2); public endpoint built but **flag off** (captcha, rate limit, honeypot, branch code, CORS allowlist, no-personal-data logging).
- **Depends on:** 2.0.
- **Out of scope:** stages beyond NEW, follow-ups, notifications, dashboards.
- **Acceptance checks:**
  - [ ] Enquiry created with only name and phone.
  - [ ] Duplicate against an existing student and an existing enquiry is flagged.
  - [ ] Manager of branch A cannot read branch B enquiries through any endpoint.
  - [ ] Public endpoint response never reveals existing records; rejects missing or failed captcha; rate limit works.
  - [ ] Flags off: routes return 404.

### Step 2.2 Pipeline stages and board
- **Deliverables:** stage enum and state machine (single function), stage history, lost reasons with seed, lost and reopen, board and list views with filters, optimistic locking, undo.
- **Depends on:** 2.1.
- **Done when:** invalid transitions are rejected on the server; concurrent edits return a conflict; board with 5,000 enquiries loads under the target.

### Step 2.3 Follow-ups and assignment
- **Deliverables:** follow-up CRUD, derived `next_follow_up_at` maintained transactionally plus nightly consistency job, "My follow-ups", overdue marking, single and bulk reassignment, "needs owner" list (owner inactive in Phase 1), WhatsApp follow-up through the Phase 1 queue with consent and suppression checks (T5 templates).
- **Depends on:** 2.2, Phase 1 WhatsApp platform.
- **Done when:** a number that sent STOP in Phase 1 cannot be messaged from an enquiry (test); a deactivated owner's enquiries appear in "needs owner".

### Step 2.4 Trials and conversion
- **Deliverables:** migration `p2_003`; trial booking with batch, date and guest-limit checks; outcome marking; coach's trial-guest list (name and age only); conversion that opens the Phase 1 admission form pre-filled (T3) and links the enquiry on success; repair job for the rare half-completed conversion.
- **Depends on:** 2.3, Phase 1 batches and admission.
- **Out of scope:** payments for trials; any change to Phase 1 attendance or capacity.
- **Acceptance checks:**
  - [ ] Trial creates no attendance rows and changes no batch capacity.
  - [ ] Conversion creates exactly one student; second attempt fails cleanly.
  - [ ] Phase 1 admission tests pass unchanged.
  - [ ] If admission validation fails, the enquiry is unchanged.

### Step 2.5 Notification framework
- **Deliverables:** migration `p2_004`; event catalogue in code; evaluators (scheduled, idempotent) for each event in W2-10; recipient resolution by role and branch; in-app centre; preferences, quiet hours, digest; critical events non-mutable.
- **Depends on:** 2.3 (enquiry events). Phase 1 events are read by the evaluators without changing Phase 1.
- **Done when:** running every evaluator twice creates no duplicates; a user never sees another branch's notifications; muting works except for critical events.

### Step 2.6 Metrics layer
- **Deliverables:** migration `p2_005`; metric definitions document in code; computing functions per metric; snapshot builder per `(branch, date)` (idempotent, rebuildable); live computation for today; nightly reconciliation against Phase 1 report queries (step 1.16); index and query-plan review.
- **Depends on:** 2.4 and Phase 1 reports.
- **Done when:** for a set of test days, snapshot totals equal Phase 1 report totals exactly (paise level); a mismatch raises a `RECON` event; running the builder twice gives identical rows.

### Step 2.7 Role dashboards
- **Deliverables:** coach, manager and admin dashboards per `UI-UX-GUIDELINES-PHASE-2.md`; independent tiles; drill-downs; date ranges; CSV export; non-blue chart palette; skeletons and error states.
- **Depends on:** 2.6, 2.5.
- **Done when:** every tile's drill-down total equals the tile; each role sees only its scope; tile query times within budget on realistic data (load test with at least 12 months of generated data for 10 branches).

### Step 2.8 Content manager (parallel stream)
- **Deliverables:** migration `p2_006`; pages, announcements, gallery; immutable revisions; publish, unpublish, rollback; Markdown sanitisation; media upload with byte-level type check, EXIF stripping, resizing, soft delete; public batch listing; public read API with caching; permissions (admin, owned-branch managers, none for franchise).
- **Depends on:** 2.0 only (plus D-09 website decision).
- **Done when:** drafts unreachable from the public API; XSS payloads are neutralised on write and render; rollback never loses a revision; a franchise manager is refused on all write endpoints.

### Step 2.9 Hardening and rollout
- **Deliverables:**
  - Security: permission sweep over all Phase 2 endpoints; public form abuse tests (bots, replay, oversized payloads); upload tests; dependency scan.
  - Privacy: retention job and erasure tool (W2-14); consent text reviewed; confirm DPDP obligations with the academy's adviser.
  - Performance: load test dashboards, pipeline board and public endpoints; Phase 1 screens re-timed with Phase 2 on and off to prove no slowdown.
  - Operations: monitoring and alerts for evaluators, reconciliation, form blocks; backup and restore test including Phase 2 tables; runbook for disabling each flag.
  - Training: short guides for manager, coach, admin.
  - Rollout: enable flags at the pilot owned branch only (`scope_key` = that branch), run a month, then expand branch by branch. Enable the public form last.
- **Depends on:** all above.

**Phase 2 exit criteria:** the pilot branch runs a full month with every enquiry recorded, follow-ups worked, at least one conversion without re-entry, daily dashboard use by the manager, seven consecutive nights of zero reconciliation mismatches, no Phase 1 regression, and one real content update published and rolled back successfully in a test.

---

## 3. Rollback plan

| Situation | Action |
|---|---|
| A Phase 2 module misbehaves | Turn its flag off (global or per branch). Data stays. No deploy. |
| Dashboard numbers suspicious | Turn `p2.dashboards` off; Phase 1 reports remain the source of truth. Investigate the `RECON` event. |
| Public form attacked | Turn `p2.enquiries` off for the branch, or the public endpoint only; staff entry continues. |
| A migration is bad | Run its down script (drops only Phase 2 objects). |
| Everything must go | Flags off, then drop Phase 2 tables in reverse order. Phase 1 is unaffected by design. |

## 4. Step template (use for every step)

```
Step: <number and name>
Goal: <one sentence>
Files to create or change: <list>
Phase 1 touchpoints used (T1–T5): <list or "none">
Out of scope: <list>
Acceptance checks:
  - [ ] ...
Regression gate: <Phase 1 suite result, schema guard, flags-off snapshot>
Tests: <what was run and the result>
Known gaps / decisions needed: <list>
```

## 5. Estimated order of effort (for planning, not commitment)

| Step | Relative size |
|---|---|
| 2.0 | S |
| 2.1 | M |
| 2.2 | M |
| 2.3 | M |
| 2.4 | M to L |
| 2.5 | M |
| 2.6 | L |
| 2.7 | L |
| 2.8 | M to L (parallel) |
| 2.9 | M |

S = a few days, M = about 1 to 2 weeks, L = about 2 to 3 weeks for one experienced developer. Adjust after step 2.1 gives real velocity.

## 6. Decisions

See the register in `PRD-PHASE-2.md` section 7 (D-01 to D-13). The ones that block code: **D-13** (captcha provider) before 2.1, **D-09** (website approach) before 2.8, and any change to **D-02** (franchise enquiry rights) before 2.1.
