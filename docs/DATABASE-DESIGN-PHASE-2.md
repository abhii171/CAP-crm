# DATABASE-DESIGN-PHASE-2.md — CPA Cricket Academy CRM

Extends `DATABASE-DESIGN.md`. Companion file: `schema.phase2.prisma`.
**No Phase 1 table or column is changed.** Phase 2 adds tables only.

## 1. Rules

1. **Expand-only migrations.** Only `CREATE TABLE`, `CREATE INDEX`, `CREATE TYPE`. No `ALTER` on a Phase 1 table. No `DROP` of anything Phase 1 owns.
2. **Rollback = drop Phase 2 tables.** Nothing in Phase 1 references them.
3. **Prisma relations:** Prisma needs both sides of a relation. Adding back-relation fields to the Phase 1 models `Branch`, `User`, `Student`, `Batch` in `schema.prisma` is allowed because it produces **no SQL**. Proof: `prisma migrate diff` between the Phase 1 database and the new schema must contain only `CREATE` statements for Phase 2 objects.
4. **Naming:** Phase 2 tables and columns are defined in `snake_case` via `@@map` and `@map`. Phase 1 tables in Postgres are PascalCase (`"Branch"`, `"User"`, `"Student"`, `"Batch"`) without `@map`, so raw SQL foreign keys from Phase 2 must reference `"Branch"("id")`, `"User"("id")`, `"Student"("id")`, `"Batch"("id")`. IDs default to `String @default(cuid())` matching Phase 1 models (`AuditLog` is `BigInt`).
5. **Money:** integer paise. **Dates:** timestamps in UTC; business dates as `DATE` in `Asia/Kolkata` terms.
6. **No hard deletes** of business rows. Enquiries are anonymised. Content revisions are immutable.
7. **Every table has** `created_at`; mutable ones have `updated_at`.
8. **Foreign keys use `ON DELETE RESTRICT`** (Prisma default for required relations) so nothing cascades into Phase 1.

## 2. Table overview

| Group | Table | Purpose |
|---|---|---|
| Enquiries | `enquiries` | A prospective student lead |
| | `enquiry_stage_history` | Every stage change |
| | `enquiry_follow_ups` | Follow-up tasks (source of truth) |
| | `enquiry_consents` | Consent to WhatsApp contact for an enquiry |
| | `lost_reasons` | Configurable list of lost reasons |
| | `trial_sessions` | Trial class bookings and outcomes |
| Notifications | `notification_events` | One row per detected condition (deduplicated) |
| | `notifications` | One row per recipient |
| | `notification_preferences` | Per user per event type mute and digest |
| | `notification_user_settings` | Quiet hours and digest time per user |
| Metrics | `metric_daily_branch` | Daily snapshot per branch |
| | `metric_reconciliation_runs` | Result of each nightly comparison |
| Content | `content_pages` | Page, announcement or gallery container |
| | `content_revisions` | Immutable content versions |
| | `content_revision_media` | Media used by a revision |
| | `media_assets` | Uploaded images |
| | `public_batch_listings` | Which Phase 1 batches are shown publicly |
| Platform | `feature_flags` | Module switches, global or per branch |

## 3. Table details

### 3.1 `enquiries`
| Column | Type | Notes |
|---|---|---|
| id | string | PK |
| branch_id | string | FK → branches, required |
| child_name | string | |
| guardian_name | string? | |
| phone | string | As entered |
| phone_normalized | string | E.164, used for duplicates and suppression |
| email | string? | |
| child_age_years | int? | |
| interest | string? | |
| source | enum `EnquirySource` | See D-01 |
| source_detail | string? | |
| created_via | enum `EnquiryCreatedVia` | MANUAL, WEBSITE_FORM |
| status | enum `EnquiryStatus` | Default NEW |
| assigned_to_user_id | string? | FK → users, null = unassigned |
| lost_reason_id | string? | FK → lost_reasons |
| lost_note | string? | |
| next_follow_up_at | timestamp? | **Derived**; maintained with follow-ups |
| last_contacted_at | timestamp? | |
| possible_duplicate | bool | Default false |
| merged_into_id | string? | Self-reference for merges |
| converted_student_id | string? | **Unique**, FK → students |
| converted_at | timestamp? | |
| created_by_user_id | string? | Null for the public form |
| anonymized_at | timestamp? | |
| version | int | Optimistic locking, default 1 |
| created_at, updated_at | timestamp | |

Indexes: `(branch_id, status)`, `(branch_id, assigned_to_user_id, status)`, `(assigned_to_user_id, next_follow_up_at)`, `(phone_normalized)`, `(branch_id, created_at)`, `(source, created_at)`.
Constraint: unique `converted_student_id` (nullable unique, so many nulls allowed in Postgres).

### 3.2 `enquiry_stage_history`
`id`, `enquiry_id`, `from_status?`, `to_status`, `changed_by_user_id?`, `note?`, `created_at`. Append-only. Index `(enquiry_id, created_at)`.

### 3.3 `enquiry_follow_ups`
`id`, `enquiry_id`, `due_at`, `channel` (CALL, WHATSAPP, VISIT), `note?`, `outcome?`, `done_at?`, `done_by_user_id?`, `cancelled_at?`, `created_by_user_id`, `created_at`. Index `(enquiry_id, done_at)` and `(due_at)` where `done_at IS NULL AND cancelled_at IS NULL` (partial index in the migration SQL).

### 3.4 `enquiry_consents`
`id`, `enquiry_id`, `channel` (WHATSAPP), `granted_at`, `capture_method` (FORM_CHECKBOX, STAFF_RECORDED), `text_version`, `recorded_by_user_id?`, `revoked_at?`, `created_at`. Latest row wins. Revocation never deletes.

### 3.5 `lost_reasons`
`id`, `code` (unique), `label`, `sort_order`, `active`. Seeded: price, location or distance, timing mismatch, joined elsewhere, not interested, no response, duplicate, other.

### 3.6 `trial_sessions`
`id`, `enquiry_id`, `batch_id`, `session_date` (DATE), `status` (SCHEDULED, ATTENDED, NO_SHOW, CANCELLED), `outcome_marked_by_user_id?`, `outcome_marked_at?`, `note?`, `created_by_user_id`, `created_at`, `updated_at`.
Indexes: `(batch_id, session_date)`, `(enquiry_id)`. Unique `(enquiry_id, batch_id, session_date)`.

### 3.7 `notification_events`
`id`, `type`, `branch_id?`, `dedupe_key` (**unique**), `severity` (INFO, WARNING, CRITICAL), `payload` (JSON, ids and counts only, no personal data), `created_at`.

### 3.8 `notifications`
`id`, `event_id`, `recipient_user_id`, `read_at?`, `dismissed_at?`, `created_at`. Unique `(event_id, recipient_user_id)`. Index `(recipient_user_id, read_at, created_at)`.

### 3.9 `notification_preferences` and `notification_user_settings`
Preferences: `user_id`, `event_type`, `in_app` (bool), `in_digest` (bool); unique `(user_id, event_type)`.
Settings: `user_id` (unique), `quiet_start?`, `quiet_end?`, `digest_time?`.

### 3.10 `metric_daily_branch`
Unique `(branch_id, business_date)`.
Columns (all integer unless noted): `collections_cash_paise`, `collections_online_paise`, `reversals_paise`, `outstanding_paise`, `overdue_paise`, `active_students`, `attendance_sessions_marked`, `attendance_present`, `attendance_absent`, `enquiries_created`, `enquiries_contacted`, `enquiries_converted`, `enquiries_lost`, `trials_attended`, `computed_at` (timestamp), `source_version` (int, bump when a formula changes so old rows can be rebuilt).

### 3.11 `metric_reconciliation_runs`
`id`, `business_date`, `branch_id?`, `status` (OK, MISMATCH), `details` (JSON with metric, dashboard value, report value), `created_at`.

### 3.12 Content tables
- `content_pages`: `id`, `scope_key` (`global` or branch id), `branch_id?` (FK, null for global), `slug`, `type` (PAGE, ANNOUNCEMENT, GALLERY), `status` (DRAFT, PUBLISHED, ARCHIVED), `published_revision_id?` (unique, FK), `created_by_user_id`, `created_at`, `updated_at`, `archived_at?`. Unique `(scope_key, slug)`.
- `content_revisions`: `id`, `page_id`, `revision_number`, `title`, `body_markdown`, `summary?`, `created_by_user_id`, `created_at`. Unique `(page_id, revision_number)`. Immutable: the application never updates or deletes; optionally enforce with a database trigger.
- `content_revision_media`: `revision_id`, `media_id`, `sort_order`; primary key `(revision_id, media_id)`.
- `media_assets`: `id`, `scope_key`, `branch_id?`, `storage_key` (unique), `mime_type`, `size_bytes`, `width`, `height`, `alt_text`, `uploaded_by_user_id`, `created_at`, `deleted_at?`.
- `public_batch_listings`: `batch_id` (PK, FK → batches), `visible`, `display_name?`, `note?`, `updated_by_user_id`, `updated_at`.

### 3.13 `feature_flags`
`id`, `key`, `scope_key` (`global` or branch id), `enabled`, `updated_by_user_id?`, `updated_at`. Unique `(key, scope_key)`. A branch value overrides the global one.

## 4. Relationship notes (Phase 1 side)

| Phase 2 table | References Phase 1 | On delete |
|---|---|---|
| enquiries | branches, users (assigned, created), students (converted) | RESTRICT |
| enquiry_* children | enquiries, users | RESTRICT |
| trial_sessions | batches, enquiries, users | RESTRICT |
| notifications | users | RESTRICT |
| metric_daily_branch | branches | RESTRICT |
| content_pages, media_assets | branches, users | RESTRICT |
| public_batch_listings | batches | RESTRICT |

Back-relation fields to add in Phase 1 models (Prisma level only): see the comment block at the end of `schema.phase2.prisma`.

## 5. Query patterns and index justification

| Screen | Query | Index |
|---|---|---|
| Pipeline board | enquiries in branch grouped by status | `(branch_id, status)` |
| My follow-ups | follow-ups due today for me | `(assigned_to_user_id, next_follow_up_at)` and partial follow-up index |
| Duplicate check | enquiries and students by normalised phone | `(phone_normalized)`; Phase 1 student phone index must exist (verify) |
| Needs owner | open enquiries whose owner is inactive | `(branch_id, assigned_to_user_id, status)` joined to users |
| Notification bell | unread for me | `(recipient_user_id, read_at, created_at)` |
| Dashboard tile | one metric for branch and range | `metric_daily_branch (branch_id, business_date)` |
| Public page | page by slug published | `(scope_key, slug)` then pointer |

## 6. Data lifecycle

| Data | Retention | Method |
|---|---|---|
| Enquiries | Configurable (D-10), default 12 months after last activity | Anonymise (W2-14) |
| Stage history, follow-ups | Kept with the enquiry; text notes cleared at anonymisation | Anonymise |
| Notifications | 90 days | Delete is allowed here because they carry no business value and no personal data beyond user ids |
| Notification events | 180 days | Same |
| Metric snapshots | Indefinitely | Rebuildable |
| Content revisions | Indefinitely | Immutable |
| Media | Soft delete; physical removal after 30 days if unreferenced | Job |

## 7. Migration plan

1. `p2_001_flags_and_enums`: enums, `feature_flags`.
2. `p2_002_enquiries`: enquiries, history, follow-ups, consents, lost reasons (with seed).
3. `p2_003_trials`.
4. `p2_004_notifications`.
5. `p2_005_metrics`.
6. `p2_006_content`.

Each migration: runs on an empty database and on a copy of production data; has a documented down script that only drops its own objects; passes the schema guard (no Phase 1 object changed).

## 8. Seed data

- Lost reasons (list above).
- Feature flags: all `p2.*` keys, `global`, disabled.
- Notification catalogue defaults (code constants, not database rows).
- Development: a few enquiries in the seeded owned and franchise branches.

## 9. Items verified against Phase 1

Model names, id type, phone normalisation, opt-out store, duplicate source, and daily-close boundary function verified:

- [x] Branch / User / Student / Batch model names confirmed. (`FeeDue` is the dues model; `Message` is the message log model).
- [x] Id type confirmed: `String @default(cuid())` for business entities; `AuditLog.id` is `BigInt @default(autoincrement())`.
- [x] Phone normaliser: None centralized in Phase 1 (only regex `isValidE164`). Phase 2 creates its own helper. Student duplicate source is `Guardian.whatsappNumber`.
- [x] Opt-out store located: `Guardian.whatsappOptIn` boolean & `ConsentRecord` table. Queryable by exact E.164 phone string.
- [x] Admission service function located: `admitStudent(caller: UserContext, input: AdmitStudentInput)` in `src/services/student.service.ts`.
- [x] Business-day boundary function: Payment service uses inline UTC date string (`new Date().toISOString().split('T')[0]`); Phase 2 metrics uses a dedicated IST day helper.
