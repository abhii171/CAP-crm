# UI-UX-GUIDELINES.md — CPA Cricket Academy CRM

Visual style, layout, navigation, components and interaction rules. The goal: a calm, **fast-feeling** interface that helps staff finish daily tasks (attendance, fees, replies) in as few taps as possible.

**Non-negotiables**
- **No blue anywhere** (not in buttons, links, focus rings, charts, badges or the logo area). Palette is green, amber, warm neutrals, and red for danger only.
- **Speed is a feature.** Every tap gets visible feedback in under 100 ms, and common actions never wait on the network to *look* done.
- **Mobile-first for coaches, desktop-friendly for managers and admin.**
- Language: English only in v1.

---

## 1. Design principles

1. **Task first.** Each role's home screen shows what they do most: coach opens to today's sessions; manager to today's collections, unmarked attendance and unread replies; admin to branch totals and exceptions.
2. **Fewest taps.** Attendance for a batch of 20 in under 60 seconds. Recording a cash payment in under 5 taps after opening the student.
3. **Calm, dense, readable.** Plenty of white space on mobile, tighter density on desktop tables. No decoration that doesn't carry information.
4. **Never lose work.** Drafts are preserved, offline submissions queue, destructive actions are undoable or confirmed.
5. **Say what happened.** Every action ends in a clear result (saved, sent, failed and why, what to do next).
6. **One obvious next action** per screen (a single primary button).

---

## 2. Color system

Warm, cricket-pitch green as the brand colour; amber as the highlight. Define as CSS variables; never use raw hex in components.

### 2.1 Light theme tokens
| Token | Hex | Use |
|---|---|---|
| `--bg` | `#F7F7F4` | App background |
| `--surface` | `#FFFFFF` | Cards, tables, sheets |
| `--surface-2` | `#F0F0EC` | Zebra rows, input fills, subtle panels |
| `--border` | `#E2E2DC` | Dividers, input borders |
| `--text` | `#1C1F1D` | Primary text |
| `--text-muted` | `#5C645E` | Secondary text, labels |
| `--primary-50` | `#E8F5EE` | Selected row, soft backgrounds |
| `--primary-600` | `#16794C` | Primary buttons, links, active nav, focus ring |
| `--primary-700` | `#115E3B` | Hover/pressed |
| `--accent-500` | `#E8A317` | Highlights, key numbers, onboarding hints |
| `--accent-50` | `#FDF4DC` | Highlight backgrounds |
| `--success` | `#16794C` | Paid, present, sent (always with a check icon) |
| `--warning` | `#B7791F` on `#FEF3D6` | Partial, late, pending |
| `--danger` | `#C73A2E` on `#FBE9E7` | Overdue, absent, failed, destructive |
| `--neutral-info` | `#5C645E` on `#F0F0EC` | Informational notes (grey, not blue) |

### 2.2 Dark theme (optional, same tokens redefined)
`--bg #121512`, `--surface #1A1E1B`, `--surface-2 #232824`, `--border #2F362F`, `--text #ECEFEA`, `--text-muted #A3ABA4`, `--primary-600 #3FB07A`, `--accent-500 #F0B73B`, `--danger #E5675B`. Follow the system setting; no theme flicker on load.

### 2.3 Rules
- Colour is never the only signal: pair status colours with an **icon and a label** (e.g. "Overdue" with a warning icon).
- Green means *done or go*, red means *needs attention*, amber means *in between*.
- Text contrast at least 4.5:1 (body) and 3:1 (large text and UI borders). Primary green on white passes.
- Charts: use green, amber, a muted terracotta (`#B5573A`), slate grey (`#6B7280`-like neutral, not blue) and a light sage. No blue or purple.
- Focus ring: 2 px `--primary-600` with 2 px offset, visible on every interactive element.

---

## 3. Typography

- **Font:** Inter (variable), falling back to the system UI font. Loaded with `font-display: swap` and subset to Latin; self-hosted to avoid a third-party request.
- **Numbers:** use tabular numerals (`font-variant-numeric: tabular-nums`) for all amounts, dates, receipt numbers and tables, so columns align.
- **Scale (mobile / desktop):**

| Style | Size / line height | Weight | Use |
|---|---|---|---|
| Display | 28/34 → 32/40 | 700 | Rare, KPI numbers |
| H1 | 22/28 → 24/32 | 650 | Page title |
| H2 | 18/24 | 600 | Section |
| H3 | 16/22 | 600 | Card title |
| Body | 16/24 (mobile), 14/20 (dense desktop tables) | 400 | Default |
| Small | 13/18 | 400 | Helper text, timestamps |
| Label | 12/16, uppercase optional | 600 | Table headers |

- Minimum 16 px for inputs on mobile (prevents zoom on iOS).
- Amounts: `₹12,500` using Indian digit grouping (`12,50,000`), right-aligned in tables. Store in paise, format only at display.
- Dates: `29 Oct 2026` (long) and `29/10/26` (dense). Times in 12-hour format with am/pm, IST.

---

## 4. Spacing, shape, elevation

- **Spacing scale (4 px base):** 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.
- **Page padding:** 16 px mobile, 24 px tablet, 32 px desktop. Max content width 1200 px (tables may go full width).
- **Radius:** 8 px (inputs, buttons), 12 px (cards, sheets), 999 px (chips, avatars).
- **Elevation:** prefer borders over shadows. One soft shadow level for dropdowns, dialogs and bottom sheets (`0 4px 16px rgba(0,0,0,0.08)`).
- **Touch targets:** minimum 44×44 px; 48 px for coach attendance buttons and payment amount keys.

---

## 5. Layout and navigation

### 5.1 Breakpoints
| Name | Width | Layout |
|---|---|---|
| Mobile | < 640 px | Single column, bottom tab bar |
| Tablet | 640–1023 px | Single column with wider cards, bottom bar or collapsed rail |
| Desktop | ≥ 1024 px | Left sidebar (240 px, collapsible to 64 px icon rail) + content |

### 5.2 Navigation per role
Only items a role may use are shown (never greyed-out forbidden items). Items follow `AUTH-AND-PERMISSIONS.md`.

| Role | Mobile bottom bar (max 5) | Desktop sidebar |
|---|---|---|
| Coach | Today · Batches · Profile | Same three; no sidebar needed |
| Manager | Home · Students · Fees · Inbox · More | Home, Students, Batches, Attendance, Fees, Daily close, Inbox, Notices, Reports, Users (coaches) |
| Admin | Home · Branches · Fees · Reports · More | Home, Branches, Users, Students, Fees, Reports, Messages, Audit log, Settings |

- The **branch** is shown in the header for managers (fixed, not switchable). Admin has a branch switcher with an "All branches" option; the selection persists and is always visible.
- **Global search** (`/` or `Ctrl/Cmd+K` on desktop, search icon on mobile): finds students by name, student ID, parent number and receipt number; results in under 300 ms as the user types.
- **Breadcrumbs** on desktop detail pages; a clear **back arrow** on mobile.
- The inbox tab shows an **unread count badge** (amber).

### 5.3 Page structure
Header (title, primary action) → filters/tabs → content → sticky footer actions on mobile forms. Primary action is top-right on desktop and a sticky bottom button on mobile.

---

## 6. Perceived speed and smoothness

These rules are part of the UI spec, not optional polish.

| Rule | Target |
|---|---|
| Visual response to any tap or click | < 100 ms |
| Navigation between screens | Content or skeleton appears < 150 ms |
| Search results | < 300 ms after typing pauses (150 ms debounce) |
| Screen fully loaded on 4G mid-range phone | < 2.5 s (first load), < 1 s (repeat) |
| Animations | 120–200 ms, ease-out; never block input |

1. **Optimistic updates:** marking attendance, resolving a message, pausing reminders and similar low-risk actions update the UI instantly, then sync; roll back with a clear message on failure. Money actions (recording payments, reversals, closing a day) are **not** optimistic: show a button spinner, then the confirmed receipt.
2. **Skeleton screens** that match the final layout, instead of spinners, for lists and cards. No full-page spinners.
3. **Prefetch** the next likely screen (student detail on row hover/focus, today's rosters when the coach app opens).
4. **Cache and revalidate:** show cached data immediately and refresh in the background (stale-while-revalidate). Show "updated 2 min ago" for dashboards.
5. **Virtualise** long lists and tables (render only visible rows) once beyond about 100 rows; paginate server-side beyond 50 rows per page by default.
6. **Offline for coaches:** the roster for today's sessions is cached; attendance saves locally and syncs with a visible "Saved on phone · will sync" state. A small connection chip shows Online / Offline / Syncing.
7. **No layout shift:** reserve space for images, badges and async content.
8. **Keep bundles small:** route-level code splitting, no heavy chart library on coach screens, images and avatars lazy-loaded. Target under 200 KB gzipped JS for the coach app's first load.
9. **Debounce and cancel** stale requests when filters change quickly.
10. **Motion respects** `prefers-reduced-motion`: replace slides and fades with instant changes.

### Motion vocabulary
- Press: scale 0.98 and darker fill (80 ms).
- Sheets and dialogs: fade and 8 px rise (160 ms).
- List item added or removed: height and fade (150 ms).
- Success: a brief check mark draw (200 ms). No bouncing, confetti or long loaders.

---

## 7. Core components

### 7.1 Buttons
- **Primary** (filled green), **Secondary** (outlined green), **Tertiary** (text), **Danger** (filled red, only for destructive actions).
- One primary button per view. Height 44 px (48 px on mobile key actions).
- Loading state: label stays, spinner replaces the icon, button is disabled to prevent double submit.
- Labels are verbs: "Record payment", "Submit attendance", "Send reminder".

### 7.2 Inputs
- Label above the field (never placeholder-only). Helper text below. Error text replaces helper text, in red with an icon.
- Correct input types and keyboards: `tel` for phone numbers, `numeric` for amounts, date pickers with typing allowed.
- Phone fields default to `+91`, validated on blur; amount fields format as the user types (`12,500`).
- Autofocus the first field on forms; Enter submits when safe.

### 7.3 Status chips
Small rounded chips with icon and text: Paid (green), Partial (amber), Due (grey), Overdue (red), Present (green), Absent (red), Late (amber), Excused (grey), Active (green), Inactive (grey), Opted out (amber), No opt-in (amber), Failed (red).

### 7.4 Cards, sheets, dialogs
- Cards group one idea. Mobile uses **bottom sheets** for secondary actions and filters; desktop uses side panels or small dialogs.
- Dialogs are for confirmation only. Destructive dialogs name the thing and state the consequence ("Reverse receipt R-000045 for ₹2,000? This cannot be edited later.").

### 7.5 Toasts and banners
- Toasts: bottom on mobile, bottom-left on desktop, auto-dismiss in 4 s, with **Undo** where reversible. Errors do not auto-dismiss.
- Banners (top of screen) for persistent states: offline, unclosed days, templates not approved.

### 7.6 Empty, loading and error states
- **Empty:** a short line of what this is, plus the one action to fill it ("No students in this batch yet. Add student").
- **Error:** what failed, what the user can do, and a Retry button. No raw error codes shown, but include a short reference ID for support.
- **Offline:** actions that need the network are disabled with a reason; offline-capable actions continue to work.

---

## 8. Tables and lists

**Desktop tables**
- Sticky header, 44 px rows (36 px in a "compact" density toggle), zebra rows optional, right-aligned numbers, left-aligned text.
- Column controls: sort, show/hide, resize on large tables. Remember the choices per user.
- **Filters** live in a bar above the table; active filters appear as removable chips. **Saved views** ("Overdue > 14 days", "Today's absentees") are one click.
- Row click opens the detail; row hover shows quick actions (Record payment, Message parent).
- **Bulk actions** appear in a bar when rows are selected (e.g. send reminder, pause reminders). Always show the count and a confirmation preview for messaging actions.
- Pagination bar with page size 25/50/100 and total count; keep scroll position when returning from a detail page.
- Export to CSV from admin and manager reports (respects branch scope).

**Mobile lists**
- Tables collapse into **cards**: name and status on the first line, key amount or time on the second, one quick action at the right.
- Pull to refresh; infinite scroll with a "Back to top" button.
- Swipe actions only where undo exists (e.g. swipe to mark message resolved).

---

## 9. Forms

1. **Single-column** layouts, grouped with clear section headings.
2. **Smart defaults:** branch auto-filled and locked, joined date = today, country code +91, current batch pre-selected where possible.
3. **Inline validation** on blur; summary of errors at submit with a jump-to-first-error link. Never clear user input on error.
4. **Autosave drafts** for long forms (student admission) locally; restore on return.
5. **Admission form** is a short stepper on mobile (Student → Parent and consent → Batch and fee plan → Review) and a single scrolling page with a sticky summary on desktop. The consent checkbox is explicit, unchecked by default, with plain wording.
6. **Duplicate warning** appears inline as soon as the phone number and name are entered, with "Open existing" and "This is a different student" options.
7. **Destructive or irreversible steps** (close day, reverse payment, deactivate student) require a reason field and a confirmation dialog.
8. Disable submit only while saving, not while the form is incomplete (show what is missing instead).

---

## 10. Key screens

### 10.1 Coach: Today
- Header: date and branch. List of today's sessions as large cards (batch name, time, student count, status: Not started / Submitted / Late).
- Tap a card opens **Attendance**:
  - Student rows 56 px high with name and a two-button toggle: **Present** (green) / **Absent** (red). Optional "Late" and "Excused" under a "more" menu.
  - Header shows progress: "14 of 20 marked". A **Mark all present** shortcut, then tap exceptions.
  - Sticky **Submit attendance** button with a confirmation summary ("3 absent. Parents will be notified.").
  - Offline chip and "Saved on phone" status.
  - Emergency contact available through an info icon on a student row during a live session only.

### 10.2 Manager: Home
Layout (desktop three-zone grid, mobile stacked):
1. **Needs attention** strip: unmarked sessions, unread replies, failed messages, unclosed days (each a tappable count).
2. **Today's collections:** cash, online, receipt count, button "Daily close".
3. **Outstanding fees:** total, overdue count, top 5 students with quick "Send reminder".
4. **Today's sessions:** attendance status per batch.
Phase 1 keeps this to simple counts and lists; richer dashboards arrive in Phase 2.

### 10.3 Student detail
Header with name, student ID, status chip, batch, parent (masked number with a reveal-on-tap for permitted roles), quick actions (Record payment, Message, Move batch). Tabs: Overview · Attendance · Fees · Messages · Activity. The Fees tab shows a clear ledger (dues, payments, reversals, balance) with the balance prominent.

### 10.4 Record payment (fast path)
Bottom sheet or side panel: amount (large numeric keypad on mobile), method toggle (Cash / Send payment link), allocation preview ("Applied to: Nov fee ₹1,500"), **Collect** button. Result screen shows the receipt number, with Send on WhatsApp / Print / Done. Whole flow is designed for one hand.

### 10.5 Daily close
Summary card (expected cash, online, receipt count), editable "counted cash" field, live discrepancy, note field (required if discrepancy), "Close day" with confirmation. After closing, the page becomes read-only with a "Closed by … at …" banner.

### 10.6 Inbox (WhatsApp)
Two panes on desktop (conversation list + thread), full-screen thread on mobile. List sorted by unread then newest; filter chips (Unread, In progress, Resolved). Thread shows the student and balance at the top, quick replies (templates), and a banner if the 24-hour free-reply window has closed ("Use a template to reply").

### 10.7 Admin reports
Filters bar (branch, date range, owned/franchise), summary tiles, then a table; export button. Charts are secondary and use the palette in 2.3.

---

## 11. Interaction patterns

- **Confirm only what hurts:** no confirmation for marking attendance or switching tabs; confirmation for sending a bulk message, reversing, closing a day, deactivating.
- **Undo** (5–10 s) for resolved messages, attendance edits and removed filters.
- **Keyboard shortcuts (desktop):** `/` search, `g h` home, `g s` students, `g f` fees, `n` new (context), `Esc` close panels. A `?` shows the shortcut list.
- **Sticky context:** keep filters and scroll position when navigating back.
- **Permissions:** hide actions a role cannot use; if an action is blocked by state (day closed, window expired), show it disabled with a reason tooltip or text.
- **Sensitive data:** parent numbers masked by default (`+91 98•••• ••10`), reveal logged to the audit log for roles that may see them; coaches never see them.
- **Session timeout:** a gentle warning 2 minutes before logout, with "Stay signed in"; unsaved drafts are kept.

---

## 12. Microcopy

- Plain, short, active voice: "Attendance submitted. 3 parents will be notified."
- Errors say what to do: "Couldn't send to +91 98••• ••10. We'll retry twice. See failed messages."
- Avoid jargon (no "idempotent", "payload", "webhook" in UI).
- Use the academy's words: *batch*, *session*, *due*, *receipt*, *daily close*.
- Currency always with ₹; negative amounts in reversals shown as `−₹2,000` with the label "Reversal".

---

## 13. Accessibility

- WCAG 2.1 AA target. Full keyboard navigation, visible focus, logical tab order.
- Semantic HTML, labelled inputs, ARIA only where needed; announce toasts through a live region.
- Tap targets ≥ 44 px, no hover-only functionality, no information by colour alone.
- Supports browser zoom to 200% and system text scaling without clipping.
- Respect reduced motion and dark mode settings.

---

## 14. Responsive behaviour summary

| Pattern | Mobile | Desktop |
|---|---|---|
| Navigation | Bottom tab bar | Left sidebar / icon rail |
| Tables | Cards | Dense table with filters |
| Filters | Bottom sheet | Inline filter bar |
| Forms | Stepper, sticky bottom button | Single page, sticky summary |
| Detail secondary actions | Bottom sheet | Side panel |
| Inbox | List then thread | Two panes |
| Daily close and payments | Full-screen sheet | Side panel |

Design and test at 360 px width first. Test on a mid-range Android phone on a throttled 4G connection, since that is the realistic coach device.

---

## 15. Implementation notes

- **Stack suggestion:** React with Tailwind CSS and a headless component library (Radix UI or similar) so styling is fully controlled and no default blue theme leaks in. Remove or override any library default colours.
- **Tokens:** define colours as CSS variables (section 2) and map them in the Tailwind config. Components use tokens only.
- **Icons:** one outline icon set (e.g. Lucide) at 20 px, 1.75 px stroke.
- **Data layer:** a query cache (TanStack Query or similar) for stale-while-revalidate, optimistic updates and request cancellation.
- **PWA:** installable app for coaches and managers, with a service worker caching the app shell and today's roster.
- **Performance budget in CI:** fail the build when the coach app's first-load JS exceeds the budget or Lighthouse mobile performance drops below 85.

```css
:root{
  --bg:#F7F7F4; --surface:#fff; --surface-2:#F0F0EC; --border:#E2E2DC;
  --text:#1C1F1D; --text-muted:#5C645E;
  --primary-50:#E8F5EE; --primary-600:#16794C; --primary-700:#115E3B;
  --accent-500:#E8A317; --accent-50:#FDF4DC;
  --warning:#B7791F; --warning-bg:#FEF3D6;
  --danger:#C73A2E; --danger-bg:#FBE9E7;
  --radius-sm:8px; --radius-md:12px;
}
```

---

## 16. Rules for the AI assistant building the UI

1. Use only the tokens above. Do not introduce blue, purple or new accent colours, and remove library defaults that are blue.
2. Build the **coach attendance screen and the record-payment flow first**; they set the standard for speed.
3. Every list needs loading (skeleton), empty and error states before it is considered done.
4. Every form needs inline validation, a loading state on submit and keyboard support.
5. Do not build Phase 2 dashboards or charts during Phase 1; use the simple counts defined in 10.2.
6. Check each screen at 360 px and 1280 px widths, and with keyboard only.
7. If a pattern here conflicts with `WORKFLOWS.md` or `AUTH-AND-PERMISSIONS.md`, stop and ask.

---

## 17. Open decisions

| Item | Default used |
|---|---|
| Brand logo and exact brand colours | Pitch green and amber above (replace if the academy has brand colours without blue) |
| Dark mode in v1 | Supported by tokens; can be postponed |
| Compact table density toggle | Included for desktop |
| Keyboard shortcuts | Included for desktop; low priority |
| Install as PWA | Yes, for coaches and managers |
