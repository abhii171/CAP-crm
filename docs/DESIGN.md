---
name: CPA Cricket Academy CRM
description: Disciplined, athletic, high-contrast operational design system for Cricket Pioneers Academy.
colors:
  primary: "#16794C"
  primary-hover: "#115E3B"
  primary-light: "#E8F5EE"
  accent: "#E8A317"
  accent-light: "#FDF4DC"
  surface: "#FFFFFF"
  surface-subtle: "#F0F0EC"
  bg: "#F7F7F4"
  border: "#E2E2DC"
  text-primary: "#1C1F1D"
  text-muted: "#5C645E"
  success: "#16794C"
  warning: "#B7791F"
  danger: "#C73A2E"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Inter', sans-serif"
    fontSize: "2rem"
    fontWeight: 700
    lineHeight: 1.2
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Inter', sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.25
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Inter', sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Inter', sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Inter', sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "0.02em"
  caption:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Inter', sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.2
  micro:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Inter', sans-serif"
    fontSize: "0.625rem"
    fontWeight: 600
    lineHeight: 1.2
rounded:
  sm: "8px"
  md: "12px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
---

# Design System: CPA Cricket Academy CRM

## Overview

**Creative North Star: "The Matchday Dugout"**

CPA CRM is designed as a disciplined, athletic, high-contrast operational hub engineered for rapid desk throughput. Just as a cricket dugout maintains focused composure during high-tempo match situations, the interface prioritizes immediate scanability, precise batch roll-calls, zero-latency lead triage, and rock-solid financial reconciliation over decorative clutter.

The visual language balances the athletic heritage of cricket with contemporary enterprise software rigor. Rich pitch greens evoke manicured turf grounds, warm golden amber accents signal priority and warnings, while deep charcoal typography on crisp daylight surfaces provides effortless readability across outdoor pavilions and busy front-desk terminals.

**Key Characteristics:**
- **High-Density Utility:** Information is structured for glanceability; tables, badges, and action bars maximize data density without visual overcrowding.
- **Tonal Hierarchy:** Depth is communicated through subtle 1px surface borders and tonal background shifts rather than heavy artificial drop shadows.
- **Strict Brand Integrity:** Pure pitch greens and warm ambers serve functional semantic roles rather than arbitrary decoration.

## Colors

The palette draws directly from the cricket pitch: pristine whites, rich boundary turf greens, and leather-and-crease amber accents.

### Primary
- **Pitch Green 600** (`#16794C`): Core brand action color, used for primary action buttons, active tab indicators, and confirmed student states.
- **Deep Turf 700** (`#115E3B`): Hover and pressed states for primary controls; high-contrast text on light green badges.
- **Crease Tint 50** (`#E8F5EE`): Soft tinted background for success badges, active filters, and table row selections.

### Secondary
- **Warm Amber 500** (`#E8A317`): Accent highlight for pending trials, follow-up deadlines, and franchise branch tags.
- **Amber Crease 50** (`#FDF4DC`): Background tint for pending action badges, warning alerts, and admin oversight tags.

### Neutral
- **Daylight Canvas** (`#F7F7F4`): Neutral app background; softer than pure white to minimize eye strain during all-day desk use.
- **Surface Pure** (`#FFFFFF`): Elevated card and table container background.
- **Surface Subtle** (`#F0F0EC`): Neutral table headers, hover backgrounds, and secondary control surfaces.
- **Divider Gray** (`#E2E2DC`): 1px structural borders dividing table rows and layout panels.
- **Pitch Charcoal** (`#1C1F1D`): Primary body and header text delivering a high contrast ratio (exceeding WCAG AAA 7:1).
- **Muted Slate** (`#5C645E`): Secondary captions, timestamps, and placeholder labels with verified WCAG AA compliance.

### Named Rules
**The Turf-to-Crease Rule.** Primary Pitch Green is strictly reserved for actionable triggers (buttons, primary links) and verified positive status (admitted, completed payment). Informational or pending items must use warm amber or neutral slate.

## Typography

**Display & Body Font:** `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", "Helvetica Neue", Arial, sans-serif`  
**Data & Numbers Font:** System font paired with `font-variant-numeric: tabular-nums` for rock-solid vertical decimal and phone alignment.

**Character:** Disciplined, contemporary, and athletic sans-serif typography engineered for swift comprehension and high legibility.

### Hierarchy
- **Display** (Bold 700, 2rem / 32px, line-height 1.2): Top-level dashboard overviews and primary page greetings.
- **Headline** (Bold 700, 1.5rem / 24px, line-height 1.25): Modal titles, section banners, and major report headers.
- **Title** (Semibold 600, 1.125rem / 18px, line-height 1.35): Table headers, card headers, and student names in detail views.
- **Body** (Regular 400, 0.875rem / 14px, line-height 1.5): Table row text, lead descriptions, and general UI copy.
- **Label** (Semibold 600, 0.75rem / 12px, letter-spacing 0.02em): Form labels, column headers, and primary filter controls.
- **Caption** (Medium 500, 0.6875rem / 11px, line-height 1.2): Guardian sub-labels, metadata timestamps, and secondary table annotations.
- **Micro** (Semibold 600, 0.625rem / 10px, line-height 1.2): High-density status pills, overdue tags, and compact count badges.

### Named Rules
**The Tabular Precision Rule.** Every phone number, rupee collection amount, timestamp, and roll-call count must explicitly use `tabular-nums` to eliminate horizontal text jitter when numbers change or tables reorder.

## Layout

- **Container Model:** Max-width 1600px centered canvas (`.dashboard-container`) with fluid responsive padding (12px mobile, 24px tablet, 32px desktop).
- **Responsive Navigation:** Fixed top navigation header with rapid branch indicator on desktop and collapsible off-canvas drawer on mobile devices.
- **Table Scaffolds:** Horizontal scroll-protected containers (`.responsive-table-container`) ensuring multi-column rosters remain usable on small tablets without breaking page layout.
- **Spacing Scale:** Standard 8px spatial grid (4px, 8px, 12px, 16px, 24px, 32px) maintaining consistent rhythm across all views.

## Elevation & Depth

**The Tonal Layering Rule.** Surfaces are flat by default. Depth is conveyed strictly through tonal contrast (`--bg` vs `--surface` vs `--surface-2`) and crisp 1px borders (`--border`). Soft shadows (`shadow-xl` / `shadow-2xl`) are strictly reserved for elevated overlay layers such as modals, dropdown popovers, and sticky action toolbars.

### Shadow Vocabulary
- **Modal Overlay** (`shadow-2xl`): `box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25)` paired with `backdrop-blur-xs` for focused task execution.
- **Dropdown / Floating Action Menu** (`shadow-md`): `box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1)` for contextual menus.

## Shapes

- **Corners:** Standardized 8px (`--radius-sm`) for interactive inputs, buttons, and badges. 12px (`--radius-md`) for major container cards and modal dialogs. Pills (`rounded-full`) for high-contrast status badges and avatars.
- **Borders:** Crisp 1px solid borders (`var(--border)`) on all container perimeters. Never use heavy colored borders exceeding 1px.

## Components

### Buttons
- **Shape:** 8px rounded corners (`rounded-sm`).
- **Primary:** Pitch green background (`#16794C`), crisp white text, 8px 16px padding.
- **Hover / Focus:** Deepens to `#115E3B`, visible 2px pitch green outline offset by 2px on keyboard focus (`outline-offset-2`).
- **Secondary / Ghost:** Transparent surface with 1px border (`var(--border)`), hover shifts to `var(--surface-2)`.

### Status Badges & Pills
- **Shape:** Pill shape (`rounded-full`) with 2px 8px padding.
- **New Enquiry:** Neutral charcoal border and subtle gray tint.
- **Trial Scheduled:** Crease tint green border with emerald text.
- **Converted:** Rich emerald background with crisp white text.
- **Overdue / Alert:** Rose border with crimson background and warning clock icon.

### Form Inputs & Dropdowns
- **Shape:** 8px rounded corners with 8px 12px interior padding.
- **Surface:** `var(--surface-2)` with 1px `var(--border)`.
- **Dropdown Option High-Contrast:** Native selects force dark `#111827` text on white background across all OSes to prevent illegible gray text on gray backgrounds.

## Do's and Don'ts

### Do's
- **Do** format all rupee amounts and timestamps with `tabular-nums`.
- **Do** maintain strict 1px subtle borders for structural containment.
- **Do** keep actions within two clicks from the main table view.
- **Do** always provide an immutable audit timestamp for financial or assignment updates.

### Don'ts
- **Don't** use generic blue focus rings or blue buttons; use Pitch Green (`#16794C`).
- **Don't** use heavy artificial card drop shadows at rest; use tonal layering.
- **Don't** use gradient text or decorative banners on operational dashboards.
- **Don't** truncate phone numbers or parent contact details in lead tables.

