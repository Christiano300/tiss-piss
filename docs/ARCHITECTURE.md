# TISS-PISS Architecture

## What this is

A Manifest V3 browser extension (content script + Vue components) that rewrites TISS (TU Wien's info system) pages:
- **Dashboard** on `education/favorites.xhtml?psite=dash`
- **Group calendar** on `education/course/groupList.xhtml`
- **Nav stars** (favorites) in the sidebar
- **Global restyle** via injected CSS

Runs on `*://*.tiss.tuwien.ac.at/*`.

---

## Entry point: `entrypoints/tiss.content/index.ts`

Content script main(). Order of operations:

1. **Extract asset base URL** from the first `<link rel="stylesheet" href$="basic.css">` → CSS variable `--base-url`
2. **Rewrite header**: replace `#logo` (TISS/PISS link), `#tuLogo` (TU Wien logo), remove empty sub-header
3. **Rewrite footer**: clone `#footerShadow` into `#footer`, strip shadow IDs
4. **Move header links**: `#paperHead` → `#headerRight`, nav links → new `#piss-headerNav` inside `#headerCenterInside`
5. **Fix Lehre link** to point at favorites
6. **Remove spacing** above group list
7. **Inject nav stars** (async)
8. **Route by page**:
   - `psite=dash` → `mountDashboard(#contentInner)`
   - `/groupList.xhtml` → insert `#group-calendar`, run `runGroupListScript()`

---

## Data flow: Group Calendar

```
parseGroupList()  →  Group[] (name, status, dates[], weekDates[], index)
       │
       ▼
getMinMaxDate()   →  [minDate, maxDate]
       │
       ▼
calcGroupSectors(groups, min, max)  →  Sector[]  (week ranges with identical time slots)
       │
       ▼
perSectorClustering(sector)  →  WeekClustering[]  (clusters = groups with overlapping times)
       │
       ▼
calcClusterSectors()  →  ClusteringSector[]  (adjacent sectors with same clustering)
       │
       ▼
getClusterColors()  →  InfoClusteredSector[]  (colors propagated across sectors)
       │
       ▼
renderGroups() mounts GroupCalendar.vue with all four arrays
```

`GroupCalendar.vue` provides enrolment-status checkboxes. Filtering is applied to
the displayed clusters and calendar entries while preserving the original group
indices used by the precomputed schedule data.

### Types (from `groups.ts`)

```ts
Group = { name, status: ENROLLED|POSSIBLE|NOT_POSSIBLE|OVER|UNKNOWN, dates: CalendarDateTime[], weekDates: WeekDateTime[], index }
Sector = { startWeek, endWeek, length, idx, entries: GroupTimeEntry[] }  // entries = {groupIdx, startHour, endHour, day}
WeekClustering = { startWeek, endWeek, length, clusters: number[][] }  // each inner array = group indices
ClusteringSector = { startIdx, endIdx, length, clusters: number[][] }
```

### Key algorithms

| Function | Purpose | Caveat |
|----------|---------|--------|
| `getWeek()` | ISO-ish week number via Thursday-nearest (UTC) | Year boundaries may drift for non-UTC timezones |
| `weekIter()` | Generator of week numbers between dates | **Infinite loop if start≥end across year boundary** |
| `calcGroupSectors` | Merge consecutive weeks with identical `entries` arrays | |
| `perSectorClustering` | Greedy: place each group in first cluster where all its entries overlap some cluster entry | Order-dependent, not maximal |
| `calcClusterSectors` | Merge adjacent sectors with identical `clusters` arrays | |
| `getClusterColors` | Assign colors to largest sector's clusters, propagate by group overlap | Matches by local cluster index → **wrong colors when order differs** |

---

## Nav Favorites (`navFavorites.ts`)

- **Storage**: `local:pissNavFavorites` via `webext-storage` wrapper (`storage.defineItem`)
- **Categories**: `education` | `organization` | `research` | `general` (derived from URL or `body` class)
- **Defaults**: "Favorites" and "Calendar" links from `#supNav .linkBlock a`
- **UI**: Star `span` prepended to each link in `#supNav`, click toggles favorite
- **Sync**: `toggleNavFavorite()` reads → mutates → writes; optimistic UI update on success

---

## CSS (`style.css`)

- Tailwind v4 (`@import "tailwindcss/theme.css" layer(theme)` + utilities)
- CSS custom properties for theming (`--bg`, `--surface`, `--accent-*`, `--font-*`)
- Scoped to `body.organisation`, `body.lehre`, `body.forschung`, `body.hilfe`
- Heavy `!important` usage to override TISS styles
- Nav star styles at bottom (`#supNav .linkBlock a .piss-nav-star`)

---

## Vue Components

| Component | Mount point | Props |
|-----------|-------------|-------|
| `Dashboard.vue` | `#piss-dashboard-host` inside `#contentInner` | (none) |
| `GroupCalendar.vue` | `#group-calendar` (injected after `#globalMessagesPanel`) | `groups, sectorClusterings, clusteredSectors, allCalendars` |

`groupRender.ts` builds `allCalendars: Map<sectorIdx, CalendarWeek>` — per-sector day
grids with slot packing — alongside the clustered sectors.

`GroupCalendar.vue` computes:
- `filteredCalendars` / `currentCalendar` — enrolment-status filtering, selected by `currentSectorIdx` (clickable sector tabs)
- `textColor(bgHex)` — WCAG luminance contrast for label readability

---

## Known Issues (from audit)

1. **Null assertions** (`!`) on `querySelector` — crashes if TISS changes HTML
2. **Color propagation bug** — uses local cluster index, not group identity
3. **Greedy clustering** — order-dependent, not guaranteed maximal
4. **No tests** for date parsing, week calc, clustering, color propagation
5. **Date parsing** assumes German `DD.MM.YYYY` format
6. **Error handling** swallows failures (warns, continues with partial data)

---

## Audit Exceptions (intentional design decisions, not bugs)

| # | Area | Decision | Why |
|---|------|----------|-----|
| 3 | `weekIter` | No year-boundary guard | `currentWeek` and `endWeek` are numbers; same week number recurs each year. Spans cannot exceed one year (TISS courses don't). Not an infinite loop. |
| 8 | `getWeek()` | Uses UTC, ignores time zones | Deliberate. Avoids "timezone BS" — week numbers stay consistent regardless of user's locale or DST. |
| 11 | CSS `!important` | Heavy usage | Required: extension CSS doesn't reliably override page CSS in all browsers. TISS uses `#id` selectors with high specificity. Shadow DOM / iframe would break normal HTML which we want to keep intact. |
| 13 | Color palette | Hardcoded 50-color array | Generated by a complex algorithm (not ported to JS). No extra dependency for a palette. Wrapping after 50 is intentional (visual clutter). |
| 15 | `webext-storage` | Used for favorites | Not technical debt. Included by default in the stack; solves cross-browser storage compatibility (Chrome `storage.local` vs Firefox vs Safari). |

---

## Build / Dev

- Vite + `wxt` (or similar) — alias `@/` maps to `src/`
- `defineContentScript` from `wxt`/`unplugin-vue-router`/similar
- Content script runs in **isolated world** (separate JS global from page)
- CSS injected via content script import (`import "./style.css"`)

---

## Files not in this entrypoint (but relevant)

- `src/components/Dashboard.vue` — dashboard UI
- `src/components/` — other Vue components
- `wxt.config.ts` / `vite.config.ts` — build config
- `manifest.json` — MV3 manifest (permissions, content_scripts)
- Background/service worker (if any)