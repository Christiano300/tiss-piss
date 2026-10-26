# Group Schedule Overview — Design Spec
Date: 2026-10-04
Status: draft for review

## 1. Outcome and users
- Primary user: student choosing one group out of up to 40 in a course.
- Task: compare when groups meet against each other and against own availability, then verify 2–3 finalists including week-to-week variations, teacher, room/location, language, seats left.
- Success: discard clashing groups in seconds, recognize identical groups without reading every time, verify exact times of finalists across weeks.

## 2. Constraints (locked)
- Up to 40 groups per course. Every student is in exactly one group. Each group has its own schedule.
- Schedules may be identical, partially overlapping, or fully different. Same count of total hours per group over the period; distribution differs (same day/different day, same time/different time).
- Each group meets weekly or at least biweekly within a fixed period. Blocks start/end on whole hours, duration 1–3h.
- Week-to-week differences shown only when they exist. Groups can be identical to different groups in different weeks (fluid grouping); clustering is per week-stretch, not global.
- Time alone is insufficient; teacher, room/location, language, seats left are shown in the same flow.

## 3. Base layout (locked: B + single calendar, normal axes)
- One week grid per selected stretch: columns Mon–Fri, rows 8–20h (hour grid). Normal axes kept; flipped variant (time→, days↓) rejected for cramped hour columns and non-standard scanning.
- All groups overlaid. Identical start/end slots collapse to one chip. Chip label always includes: day, hours, group numbers (e.g. `Mon 10–12 · G1,5,9,14`), pattern tag, teacher/room on demand.
- Overlap rule C: stacked single chip by default; side-by-side lanes inside the day column only for partial overlaps (1–2h shift, e.g. 10–12 vs 11–13). Exact overlaps never use lanes.
- Shared slots held by multiple patterns split into labeled segments within the chip (e.g. Wed 14–16: P1 4/6 + P2 2/6).
- Diff reading without pairwise view: same weekday/different hour = vertical gap in one column; different weekday = block in different column.
- Own busy times rendered as hatched background in the grid. Default is overlay (clashes shout); separate toggle `hide clashing` filters them. Full groups dimmed, not removed, unless filtered.

## 4. Week timeline (locked)
- Timeline above the calendar: one button per maximal stable stretch, width proportional to week count, with min click width for 1-week stretches (`1w` label).
- Stretches = union of all groups' change points, then merged if adjacent groupings differ by <2 groups or <1 slot. If more than ~6 stretches remain, collapse to dominant phases and mark remainder with `varies` + per-group detail.
- Click locks calendar to that stretch; hover previews regroup delta. Week toggle W1/W2 only appears when the selected stretch contains week-varying content. Biweekly rendered as striped fill.
- Selecting a stretch recomputes clusters for that stretch only. Pattern IDs are stretch-local (`W1-6 · P1`). Persistent identity is the group number and search, not the pattern label.

## 5. Color (locked)
- Fill = cluster lineage by similarity. Earliest stretch defines base hues. Each later cluster inherits the hue of the most similar cluster in the previous stretch by whole-hour cell overlap (count of shared day-hour cells). Rendering: solid = identical membership, lighter shade = 1-group drift (P1'), split fill = merged clusters, new hue only if overlap <50%.
- Open tuning: whether same-weekday-different-hour counts as closer than different-weekday in the overlap metric. Default is plain cell overlap; equidistant 1-cell shifts rank equal.
- Reserved search color: amber outline + glow (`#f59e0b` outline, `#fde68a` halo, dim others to ~30%) is used only for search. Never a fill. Searching `G7` outlines every chip and timeline stretch containing G7. Legend states this exclusivity.
- Contrast: headers slate-900 on slate-200, title bar white on slate-800. All body text `#0f172a` or darker on light fills.

## 6. Identity, metadata, interaction
- Every chip names its groups; hover lists all groups in the chip with teacher, room, language, seats. Click selects a pattern: highlights all its slots across days, opens side panel with exact times, regroup lineage, and deterministic delta vs reference.
- Search box `Where is Group [ ]?` pulses all slots of that group in the current stretch and ticks its stretches on the timeline.
- Sort/filter bar: hide clashing, day filter, morning/afternoon/evening, language, teacher, seats-only. Sort patterns by first meeting (Mon time, then Wed) so neighbours expose the two common diffs.
- Side panel for selected pattern shows: full slot list, teacher/room/language/seats per slot, stretch lineage (e.g. `P1 → P1': G9,14 left`), and delta text per section 7.

## 7. Diff text (deterministic only)
- No generated prose. All deltas are slot set-operations on whole-hour blocks with explicit baseline.
- Baselines allowed: (a) same group across stretches (`G7 W7 vs G7 W1-6`), (b) group vs reference in same stretch (`G7 vs ref G4, W1-6`).
- Matching: same duration + same weekday different hour → `moved within day`; same duration + different weekday → `moved across days`; unmatched added/removed → `added` / `removed`; biweekly flag preserved.
- Templates: `Mon 10–12 → Mon 18–20 (same day, different hour)`, `Wed 14–16 → Thu 14–16 (different weekday)`, `Fri 10–12 added (odd weeks only)`, `Mon 10–12 removed`.

## 8. Edge cases
- 40 groups in one popular slot: chip shows segmented composition + `×N`; click expands paginated group list (12 per page) sorted by seats then group number.
- All groups clash with busy times: grid shows hatched empty state + `clear filter` action; never a blank page.
- Single-week exception stretch: min-width button, calendar shows `1-week exception` banner.
- No variations in course: timeline collapses to single `All weeks identical` label; no stripes or toggles rendered.

## 9. Non-goals
- Room/teacher resource planning, automatic group assignment, waitlist logic, mobile-first layout (desktop grid primary; mobile gets stacked day list, out of scope here).
