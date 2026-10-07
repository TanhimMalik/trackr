# Design System

Trackr should feel like polished productivity software: compact, calm and information-dense, with automation that is always visible and explainable. This document defines the visual language and the layout of the primary surfaces. Exact token values live in `apps/web/src/app/globals.css`.

## Direction

**Aim for:**

- Modern, professional productivity-tool aesthetics
- Compact layouts and high information density
- Persistent left navigation
- Strong typographic hierarchy
- Neutral surfaces with subtle borders
- Restrained color, used for meaning
- Small status indicators
- Minimal shadows
- Responsive layouts
- Equally polished light and dark modes

**Avoid:**

- Glassmorphism
- Decorative gradients
- Oversized cards and typography
- Heavy rounding
- Gratuitous animation
- Colorful, Trello-style boards
- Generic "AI product" decoration (sparkles, glowing accents)

**Visual priority, in order:** applications, automation activity, timeline and history, analytics.

## Layout

### Application shell

- **Sidebar.** 240 px wide on large screens, with the logo and navigation: Overview, Applications, Activity, Analytics, Resumes, Integrations, Settings. It collapses to a 56 px icon rail on medium screens and becomes an off-canvas sheet on small screens.
- **Header.** 56 px tall, with the search trigger (⌘K) on the left, and the notification bell and user menu on the right. The user menu includes account, theme and sign out.
- **Content.** Fluid width with a 24 px gutter, or 16 px on small screens. Page headers use a 22–24 px title with a one-line muted description.

### Overview

```
┌──────────┬──────────────────────────────────────────────────────────────────┐
│ Trackr   │ [⌘K Search applications, companies…]              🔔   Tanhim ▾ │
│          ├──────────────────────────────────────────────────────────────────┤
│ Overview │ Good evening, Tanhim                              Tue, Oct 6     │
│ Applic…  │ Here's what's happening with your job search.                     │
│ Activity │ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐       │
│ Analytics│ │Applications│ │Interviews  │ │Response    │ │Offers      │       │
│ Resumes  │ │63  ↑12% ╱╲ │ │8   ↑33% ╱╲ │ │24% ↑6pt ╱╲ │ │1   —    ── │       │
│ Integr…  │ └────────────┘ └────────────┘ └────────────┘ └────────────┘       │
│ Settings │ ┌ Applications ─────────────────── [Board|Table] [+ Add] ───────┐ │
│          │ │ ● Applied 18  │ ● Assessment 12 │ ● Interview 8 │ ● Offer 1  │ │
│          │ │ ┌──────────┐  │ ┌──────────┐    │ ┌──────────┐  │ ┌────────┐ │ │
│          │ │ │card      │  │ │card      │    │ │card      │  │ │card    │ │ │
│          │ │ └──────────┘  │ └──────────┘    │ └──────────┘  │ └────────┘ │ │
│          │ └───────────────────────────────────────────────────────────────┘ │
│          │ ┌ Recent automation ─┐ ┌ Application funnel ─┐ ┌ Integrations ──┐ │
│          │ │ ● Ramp → Interview │ │ ▇  ▅  ▂  ▁          │ │ Gmail      ●   │ │
│          │ │ ● Datadog assess…  │ │ 63 15  8  1          │ │ Extension  ●   │ │
│          │ │ ● Vercel dup [Rev] │ │                      │ │                │ │
│          │ └────────────────────┘ └──────────────────────┘ └────────────────┘ │
└──────────┴──────────────────────────────────────────────────────────────────┘
```

- **Metrics row:** four cards in one row on wide screens, two on medium and one on small.
- **Applications section:** shows the active stages, as a board or a table. The full board, with the Closed and Saved columns, lives on the Applications page.
- **Bottom row:** three columns on wide screens (`1.25fr 1.25fr 1fr`), two on large screens and stacked on smaller ones. Recent automation lists only updates Trackr made on its own; each item opens the application's drawer. Integrations read "Coming soon" until Gmail and the extension ship.
- **Loading:** each section loads independently with its own skeleton.

### Applications

- **Board/Table toggle and filters** sit in a toolbar under the page header, and their state is kept in the URL.
- **The board scrolls horizontally** when the columns don't fit, with column snapping on touch devices.
- **The detail view** opens in a right-side drawer (46 rem, about 740 px, full width on small screens) over the current view, with a link to the full page.

## Typography

| Role          | Size / weight          | Use                                       |
| ------------- | ---------------------- | ----------------------------------------- |
| Page title    | 22–24 px / 600         | One per page                              |
| Section title | 16 px / 600            | Card and section headers                  |
| Body          | 14 px / 400            | Default text                              |
| Secondary     | 13 px / 400, muted     | Roles, descriptions, table secondary text |
| Meta          | 12 px / 400–500, muted | Dates, counts, badges, signal lines       |
| Metric value  | 24–28 px / 600         | Summary metrics only                      |

- **Typeface:** Inter, loaded with `next/font`.
- **Tabular figures** for every number in metrics, tables, counts and dates.
- **Sentence case** everywhere, including buttons and headings.

## Spacing, shape and elevation

- **Spacing:** a 4 px base scale. Cards use 12 px inner padding (16 px for section containers), and gaps are 8, 12 or 16 px.
- **Radius:** the base `--radius` is 6 px, used by controls, inputs and badges (`rounded-lg`). Cards, panels and the drawer use `rounded-xl` (about 8 px). Nothing is pill-shaped except status dots, avatars and count badges.
- **Borders:** 1 px borders carry the structure. Surfaces are separated by borders, not shadows.
- **Shadows:** only on overlays (drawer, popovers, menus, the dragged card), and kept subtle.
- **Density:** table rows are 36–40 px. Board columns are at least 272 px wide.

## Color

### Tokens

Token names follow the shadcn/ui conventions, so generated components pick them up, and are exposed to Tailwind as color utilities (`bg-card`, `text-primary-text`, …).

| Token                                     | Purpose                                                         |
| ----------------------------------------- | --------------------------------------------------------------- |
| `--background`                            | App background                                                  |
| `--card`, `--popover`                     | Cards and panels; menus and overlays                            |
| `--muted`                                 | Board columns, table header, icon tiles                         |
| `--accent`                                | Neutral hover and focus backgrounds (menus, ghost buttons)      |
| `--border`, `--input`                     | Default borders; form control borders                           |
| `--foreground`, `--muted-foreground`      | Primary and secondary text                                      |
| `--primary`, `--primary-foreground`       | Blue fill for primary buttons and the logo mark                 |
| `--primary-soft`                          | Blue-tinted background: active navigation, selected toggles     |
| `--primary-text`                          | Blue text and icons on any surface (tuned separately per theme) |
| `--ring`                                  | Focus rings                                                     |
| `--success`, `--warning`, `--destructive` | Positive deltas, review items, destructive actions              |

The brand color is a single blue. Everything else is neutral gray (zinc family). Color is used for meaning, not decoration. Blue fills and blue text use separate tokens because no single blue gives readable text and accessible white-on-blue buttons in both themes. All text pairs meet WCAG AA (4.5:1) in both themes.

### Status palette

Status colors appear only as small dots, badge text and column-header markers, and are always paired with a text label.

| Status                      | Token                 | Hue     |
| --------------------------- | --------------------- | ------- |
| Saved, Unknown              | `--status-neutral`    | Gray    |
| Applied                     | `--status-applied`    | Slate   |
| Assessment                  | `--status-assessment` | Amber   |
| Recruiter screen, Interview | `--status-interview`  | Blue    |
| Final round                 | `--status-final`      | Violet  |
| Offer                       | `--status-offer`      | Emerald |
| Rejected                    | `--status-rejected`   | Rose    |
| Withdrawn                   | `--status-withdrawn`  | Gray    |

Each token has separately tuned light and dark values that meet WCAG AA contrast against their surface.

## Components

### Summary metric card

An icon tile (32 px, muted surface), a label (13 px, muted) and a value (24–28 px, tabular). Beside the value is a delta (12 px: success color with an up arrow, danger color with a down arrow, or a muted dash when unchanged) and a sparkline of about 64 × 24 px drawn as a 1.5 px muted accent stroke. Counts compare in percent and rates in percentage points.

### Board column

A neutral `--muted` background, never tinted by status. The header shows a status dot, the column name and a count badge. Cards stack with 8 px gaps. A grouped column (Interview contains Recruiter screen, Interview and Final round; Closed contains Rejected and Withdrawn) shows each card's specific status as a small badge.

### Application card

```
┌──────────────────────────────────┐
│ [SC]  Stripe                  ⋯  │
│       Software Engineer          │
│       Applied Apr 22             │
│       ✉ Gmail detected           │
└──────────────────────────────────┘
```

- **Avatar:** 32 px company avatar with 6 px radius. The company's logo on a white tile (in both themes, so dark marks stay visible), loaded through Trackr's logo route. Initials on a neutral tint are the fallback when there is no domain or no logo.
- **Text:** company (14 px, 600), role (13 px), applied date (12 px, muted).
- **Signal line:** the single most informative recent signal, with a 14 px icon. Examples: "Gmail detected", "Assessment received", "Interview scheduled", "Offer received", or the job source.
- **Actions:** the overflow menu appears on hover and focus. The card itself is a link that opens the detail drawer.

### Activity feed item

A company avatar, a sentence ("Ramp moved Applied → Interview"), a relative time, and a trailing state dot:

| Dot   | Meaning                             |
| ----- | ----------------------------------- |
| Green | Applied automatically               |
| Amber | Needs review, with a "Review" badge |
| Gray  | Manual change                       |
| Red   | Processing failed                   |

### Timeline item

A date column, an event icon, a label, a source chip (Gmail, Extension, Manual or System) and, when the status changed, a transition chip (Applied → Interview). Items that came from email can expand to show the sender, subject, detected update and confidence. Reverted events stay visible, struck through.

### Funnel

Four vertical bars for applications, responses, interviews and offers. Bars use the accent at decreasing opacity, with the count above each bar and the percentage below. It has a period selector (last 30 days, 90 days, all time).

### Integration row

A provider mark, the name, a status dot and label (Connected, Active, Reconnect needed, Not connected), a one-line description, and a chevron that opens Integrations.

## Automation transparency

Automatic behavior must always be visible and reversible:

- **Every automatic change states its source:** "Status updated automatically from Gmail" or "Detected by the browser extension".
- **Auto-classified updates carry a small "Auto" badge with the confidence** ("Auto · 82%"). LLM-classified updates are labelled as such in the detail view.
- **Undo** is offered in the confirmation toast and in the timeline for every automatic change.
- **Review items** use the warning color and a clear call to action ("Review"), never a silent change.
- **Iconography** uses source icons (mail, puzzle piece, pencil) rather than "AI" symbolism.

## Content style

- **Dates:** "Apr 22" in the current year, "Apr 22, 2025" otherwise. Relative times ("14 min ago", "2 days ago") for the last seven days, absolute dates after that.
- **Percentages:** whole numbers in metrics ("24%"), one decimal place in tables ("9.6%").
- **Wording:** plain and specific. "No response for 16 days. Consider following up." rather than generic encouragement.
- **Empty states:** explain what will appear and how it gets there, such as connecting Gmail or installing the extension. They should never be merely decorative.

## Motion

- 150 ms ease-out for hover and press feedback, and about 200 ms for the drawer and popovers.
- Drag-and-drop uses a lifted card with a subtle shadow and no bounce.
- `prefers-reduced-motion` disables non-essential transitions.

## Dark mode

- Class-based theming with a system default and a manual override in the user menu.
- Backgrounds are near-black neutrals, never pure black. Elevation comes from slightly lighter surfaces plus borders.
- Borders are a little more visible than in light mode. Status and accent colors are re-tuned for contrast, not inverted.
- Every UI change is checked in both themes.

## Accessibility

- All interactive elements are reachable by keyboard, with visible focus rings in the accent color.
- Board drag-and-drop supports the keyboard and announces moves through a live region.
- Color is never the only carrier of meaning: statuses always have text labels.
- Text and essential UI meet WCAG AA contrast in both themes.
- The drawer and dialogs trap focus, restore it on close and close with Escape.

## Responsive behavior

| Breakpoint  | Behavior                                                                                                                |
| ----------- | ----------------------------------------------------------------------------------------------------------------------- |
| < 768 px    | Sidebar as a sheet. One-column metrics and bottom row. Board scrolls horizontally with snapping. Drawer is full screen. |
| 768–1279 px | Icon-rail sidebar. Two-column metrics. Stacked bottom row.                                                              |
| ≥ 1280 px   | Full sidebar. Four-column metrics. Three-column bottom row.                                                             |
