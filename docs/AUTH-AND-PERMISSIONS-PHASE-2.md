# AUTH-AND-PERMISSIONS-PHASE-2.md — CPA Cricket Academy CRM

Extends `AUTH-AND-PERMISSIONS.md`. **Nothing in the Phase 1 file changes.** Login, sessions, timeouts, password flows, 2FA and the one-manager-one-branch rule stay exactly as they are. This file only adds permission keys and rules for Phase 2 modules.

Where this file and the Phase 1 file disagree, stop and ask.

## 1. Principles carried over

1. Server-side branch scoping on every query. Admin is the only role that sees all branches.
2. Permissions are checked in the single reusable layer from step 1.3. Phase 2 *registers* keys there; it does not add parallel checks.
3. No role or branch is hard-coded by name. Use role, `branch_id`, `branch_type`.
4. A user's own branch comes from the session, never from a request parameter.
5. Every write is audited with a `p2.` action name.

## 2. Permission matrix

Legend: **A** = admin, **M-O** = manager of an owned branch, **M-F** = manager of a franchise branch, **C** = coach, **P** = public (unauthenticated).
Scope: "own" = the user's own branch; "all" = all branches; "assigned" = records where the user is `assigned_to`.

### 2.1 Enquiries

| Permission key | A | M-O | M-F | C | P |
|---|---|---|---|---|---|
| `enquiry:create` (manual) | all | own | own (D-02) | no | no |
| `enquiry:create_public` | no | no | no | no | yes (create only) |
| `enquiry:read` | all | own | own | no | no |
| `enquiry:update` (details) | all | own | own | no | no |
| `enquiry:change_stage` | all | own | own | no | no |
| `enquiry:assign` / bulk reassign | all | own | own | no | no |
| `enquiry:mark_lost` / `reopen` | all | own | own | no | no |
| `enquiry:convert` | all | own | own | no | no |
| `enquiry:export` | all | own | own | no | no |
| `enquiry:anonymise` (retention, erasure) | all | no | no | no | no |
| `followup:manage` | all | own | own | no | no |
| `trial:manage` | all | own | own | no | no |
| `trial:view_own_batches` | all | own | own | own batches | no |

Notes:
- A manager sees *all* enquiries in their branch, not only the ones assigned to them. Visibility is by branch; ownership is for workload.
- Coaches have no access to enquiry data. They see only a count and names of trial guests for their own batches on the trial day (name and child age, no phone number).
- Phase 2 does not add a Front Desk role. If it is added later, the key set above is reused with a new role mapping.

### 2.2 Notifications

| Permission key | A | M-O | M-F | C |
|---|---|---|---|---|
| `notification:read_own` | yes | yes | yes | yes |
| `notification:preferences_own` | yes | yes | yes | yes |
| `notification:catalogue_manage` (defaults, critical flags) | yes | no | no | no |

Users only ever read their own notifications. There is no endpoint to read another user's.

### 2.3 Dashboards

| Permission key | A | M-O | M-F | C |
|---|---|---|---|---|
| `dashboard:coach` | yes | no | no | own batches |
| `dashboard:manager` | all (choose a branch) | own | own | no |
| `dashboard:admin` (cross-branch, comparison) | all | no | no | no |
| `dashboard:export` | all | own | own | no |
| `metrics:reconciliation_view` | yes | no | no | no |

Franchise managers see their own branch's dashboard. They do not see comparisons with other branches or any royalty figure (no royalty in v1).

### 2.4 Content manager

| Permission key | A | M-O | M-F | C | P |
|---|---|---|---|---|---|
| `content:read_draft` | all | own branch | no (D-08) | no | no |
| `content:create` / `edit` | all (incl. academy-wide) | own branch only | no | no | no |
| `content:publish` / `unpublish` / `rollback` | all | own branch only | no | no | no |
| `content:archive` | all | own branch | no | no | no |
| `media:upload` | all | own branch | no | no | no |
| `media:delete` (soft) | all | own | no | no | no |
| `publiclisting:manage` (batch timings visibility) | all | own branch | no | no | no |
| `content:read_published` | yes | yes | yes | yes | yes (public API) |

Academy-wide content (`scope_key = global`) is admin only. If decision D-12 turns on the review step, managers submit and admin publishes.
Note: Phase 1 `AUTH-AND-PERMISSIONS.md` § 6.1 initially marked Content Manager as `Manager: NONE`. Phase 2 intentionally adopts the rule from Phase 1 `WORKFLOWS.md` § 12: owned branch managers (`M-O`) may manage content for their own branch, while franchise managers (`M-F`) remain `no`.

### 2.5 Feature flags

| Permission key | A | Others |
|---|---|---|
| `flags:manage` | yes | no |

## 3. Special cases

1. **Manager replaced or deactivated.** Phase 1 reassigns the manager (step 1.5). Phase 2 does not hook into that. Enquiries assigned to a deactivated user appear in the branch "needs owner" list. The new manager or admin reassigns them.
2. **Manager role on two branches.** Not allowed (Phase 1 rule). Phase 2 relies on it and adds no exception.
3. **Coach moved between batches.** Trial visibility follows current batch assignment.
4. **Admin impersonation.** Not provided; not added.
5. **Franchise to owned conversion of a branch.** Permissions follow `branch_type` at request time. Existing content and enquiries keep their branch id.

## 4. The public endpoint (the one unauthenticated surface)

Namespace: `/public/v1/`.

| Endpoint | Method | Purpose |
|---|---|---|
| `/public/v1/enquiries` | POST | Create an enquiry |
| `/public/v1/branches` | GET | List branches that accept enquiries (public display name and id only) |
| `/public/v1/content/*` | GET | Read published content |
| `/public/v1/batches` | GET | Read publicly listed batch timings |

Rules:
1. **No authentication, but not unprotected:** captcha on POST, rate limit per IP and per phone number, honeypot field, payload size limit, strict input validation, JSON only.
2. **Branch input:** a public branch code (not the internal id). Unknown code → rejected.
3. **Create only:** the POST response contains a generic success message and no record data. It does not reveal whether the phone number already exists.
4. **CORS:** allowlist of the academy's website origins.
5. **Logs:** no names, phone numbers or free text in logs; only a request id and outcome.
6. **Consent:** the form shows the consent text and stores the text version with the checkbox value. WhatsApp contact only if the checkbox is ticked.
7. **Kill switch:** the `p2.enquiries` flag per branch disables the endpoint for that branch without a deploy.
8. **Read endpoints** return only published, non-archived content and only fields meant to be public. Drafts, revision history and internal ids are never returned.

## 5. Sessions and timeouts

Unchanged from Phase 1 (admin 30 min, manager 60 min, coach 8 h). Phase 2 screens use the same session. No new tokens, roles or login methods.

## 6. Tests required (added to the permission sweep in step 1.17 style)

- A manager from branch A gets 403 or 404 on every Phase 2 endpoint for a branch B record (enquiry, follow-up, trial, notification, dashboard, content, media).
- A coach gets 403 on all enquiry and content endpoints.
- A franchise manager gets 403 on all content write endpoints.
- With flags off, Phase 2 routes return 404 and the permission matrix equals the Phase 1 snapshot.
- The public endpoint cannot return any record, and drafts are unreachable.
- Notification list for user X never contains rows for user Y.
