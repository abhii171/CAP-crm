# UI-UX-GUIDELINES-PHASE-2.md — CPA Cricket Academy CRM

Extends `UI-UX-GUIDELINES.md`. **All Phase 1 rules still apply and are not changed**: no blue anywhere, fast, responsive, smooth, built to boost productivity. Phase 2 reuses Phase 1 design tokens (colours, spacing, type, components). If a token or component already exists, use it. Do not create a second version.

## 1. Principles for Phase 2

1. **Staff are busy.** A manager at a ground, on a phone, between sessions. Every common action should be reachable in two taps and finish in under 30 seconds.
2. **Answer first, detail on demand.** Dashboards show the number and the trend; tapping shows the list.
3. **Never block on slow data.** Each tile, board column and list loads on its own. Skeletons first, content swaps in without layout jumps.
4. **Quiet by default.** Notifications are useful, not noisy. Only critical items interrupt.
5. **Mistakes are cheap.** Undo for stage changes, confirmation for bulk actions, never a dead end.
6. **Looks identical to Phase 1.** A user should feel it is one product.

## 2. Colour: no blue, including charts

Use the Phase 1 palette tokens. For charts, use only non-blue colours. Suggested chart set (confirm against Phase 1 tokens; replace with the existing ones where they differ):

| Use | Colour idea | Notes |
|---|---|---|
| Primary series | Phase 1 primary | Whatever it is, it must not be blue |
| Positive (collected, converted) | Green | |
| Warning (due soon, follow-up due) | Amber | |
| Negative (overdue, lost, mismatch) | Brick red | |
| Neutral / comparison | Warm grey or sand | |
| Extra series | Olive, terracotta | Avoid teal, indigo, violet and cyan, which read as blue-ish |

Rules: never rely on colour alone (add icons, labels or patterns); check contrast of text on every fill; links and focus rings follow the Phase 1 non-blue tokens.

## 3. Navigation and layout

- New sections appear in the existing nav: **Enquiries**, **Dashboard**, **Notifications** (bell in the header), **Content** (admin and owned-branch managers only). Items are hidden when the feature flag is off or the role has no permission.
- Phone: bottom navigation or the existing Phase 1 pattern; the enquiry board becomes a horizontal stage switcher plus a vertical list, not a wide board.
- Desktop: board with columns per stage, list view toggle, filter bar pinned at top.
- The branch is always visible in the header. Admin has a branch switcher that persists across screens.

## 4. Enquiries

### 4.1 Quick add
- One short form: child name, phone, guardian name (optional), age (optional), interest (optional), source. Phone field uses the numeric keypad and validates as the user types.
- Duplicate warning appears inline under the phone field once the number is complete, with "Open existing" as the primary action.
- Save and "Save and add follow-up" buttons. After save, return to where the user came from.

### 4.2 Pipeline board
- Columns: New, Contacted, Trial scheduled, Trial done, Converted, Lost (Lost collapsed by default).
- Card shows: child name, age, source badge, owner initials, next follow-up chip (amber if due today, red if overdue), possible-duplicate icon.
- Drag and drop on desktop; on phone, a "Move to" action sheet. Only valid transitions are offered. Moving to Lost asks for a reason in a bottom sheet. Moving to Trial scheduled opens the trial booking sheet.
- Undo toast for 8 seconds after a move.
- Counts per column; virtualised lists so 5,000 enquiries do not slow the page.
- Filters: owner (including "Unassigned" and "Needs owner"), source, age range, created date, overdue only. Filters are saved per user.

### 4.3 Enquiry detail
- Top: name, stage badge, owner, quick actions (Call, WhatsApp if allowed, Add follow-up, Book trial, Convert, Mark lost).
- Tabs or sections: Timeline (stage history, follow-ups, trial, messages), Details, Consent.
- The WhatsApp action is disabled with a clear reason when consent is missing or the number is suppressed ("This number has opted out").
- Conversion opens the Phase 1 admission form; a banner reads "Pre-filled from enquiry".

### 4.4 My follow-ups
- A single list sorted by due time; overdue at top. Swipe or tap to mark done with an outcome (quick chips: Spoke, No answer, Call back later, Not interested). "Schedule next" is offered right after.

### 4.5 Bulk actions
- Multi-select, then Reassign. A confirmation shows the number and the target owner.

## 5. Dashboards

### 5.1 Layout
- A top row of 4 to 6 headline tiles, then trend charts, then lists ("Follow-ups due", "Unclosed days"). On phone the tiles scroll vertically in priority order.
- Each tile: label, big number, small delta versus the previous period, and a sparkline where it helps. Tap opens a drill-down list with the same filters.
- Date range control: Today, 7 days, 30 days, This month, Custom. Remembered per user.

### 5.2 Role views
- **Coach:** today's sessions as large cards ("Mark attendance" button deep-links to Phase 1 screen), absentees, trial guests today.
- **Manager:** collections today (cash and online), overdue fees, attendance trend, enquiry funnel, follow-ups due, unclosed days, failed messages, needs-owner count.
- **Admin:** branch comparison table and chart, owned vs franchise, conversion by branch and source, reconciliation status.

### 5.3 Loading and trust
- Each tile has its own skeleton and its own retry on failure. A failed tile does not break the page.
- Show "Updated at hh:mm" on tiles built from snapshots.
- A small "Data check passed" or "Data check failed" indicator for admin links to the reconciliation result.
- Empty states say what the number means and what to do next, not just "No data".

### 5.4 Charts
- Few types: line (trend), bar (comparison), stacked bar (cash vs online), funnel (as a horizontal bar list). No pie charts with more than 4 slices.
- Axes labelled; values formatted in rupees with Indian digit grouping; tooltips on hover and tap.
- Respect reduced-motion settings; keep animation short.

## 6. Notifications

- Bell in the header with an unread count. The panel groups by Today and Earlier. Each item: icon by severity, one-line message, branch (admin only), time, deep link to the relevant screen.
- Critical items are pinned at the top and carry a distinct icon and label, not just colour.
- Mark all read; mute this type (not available for critical).
- Settings page: toggles per event type, quiet hours, digest time.
- No sound or push in Phase 2 unless Phase 1 already has it; no full-screen interruptions.

## 7. Content manager

- List of pages and announcements with status chips (Draft, Published, Archived) and "Last edited".
- Editor: title, slug (auto, editable until published), Markdown editor with a live preview and a formatting toolbar; image picker from the media library; autosave of drafts every few seconds with "Saved" indicator.
- Revisions panel: list of versions with author and time; "Compare" and "Publish this version".
- Publish button shows what will become public and warns if an image is missing alt text.
- Media library: grid, upload with progress, alt text required before the file can be used.
- Public batch timings: a table of batches with a visibility toggle and optional display name.

## 8. Forms, errors and states (all Phase 2 screens)

- Inline validation, messages in plain language ("Enter a 10-digit mobile number"), keep what the user typed.
- Buttons show a loading state and are disabled while saving; the page does not jump.
- Optimistic UI only where a failure can be rolled back cleanly (stage moves, marking follow-ups done).
- Conflict message for simultaneous edits: "Someone else updated this enquiry. Refresh to see the latest."
- Empty, loading, error and no-permission states exist for every list.

## 9. Performance budgets

| Item | Target |
|---|---|
| Dashboard first meaningful paint (mobile) | under 2 s |
| Each dashboard tile | under 500 ms after request |
| Board interaction (move card) | feels instant; server confirms in under 300 ms |
| List scroll | 60 fps with virtualisation |
| Notification bell poll | at most once a minute, or server push if Phase 1 has it |
| Public content page | served from cache, under 1 s |

Also: lazy load charts and the Markdown editor; keep Phase 2 code out of the Phase 1 bundles so Phase 1 pages are not slower.

## 10. Accessibility

Keyboard-operable board and dialogs, visible focus, labels for all inputs, colour never the only signal, minimum touch target 44 px, screen-reader names for icons and chart summaries ("Collections up 8 percent versus last week").

## 11. Copy and language

English, short and direct. Use the same terms as Phase 1 (branch, batch, student, manager). Say "enquiry", not "lead". Dates as "12 Nov 2026"; times in 12-hour format with am or pm; amounts as "₹12,500".
