# Dashboard (psite=dash) Design — 2026-10-02

## Goal
When any `tiss.tuwien.ac.at` page URL contains query param `psite=dash`, replace `div#contentInner` with a dashboard quick-links hub. Keep existing header/footer cleanup behavior.

## Context
- WXT + Vue 3 extension (`wxt`, `@wxt-dev/module-vue`).
- Content script: `entrypoints/tiss.content/index.ts`, matches `*://*.tiss.tuwien.ac.at/*`, currently does vanilla DOM cleanup + header/nav moves.
- Popup uses Vue (`entrypoints/popup/App.vue`, `main.ts` with `createApp(App).mount('#app')`).
- Styling lives in `entrypoints/tiss.content/style.css` with CSS vars (`--bg`, `--surface`, etc.).

## Decision: Vue component (user chose Option B)
Options considered:
- A (Recommended): vanilla TS module — simplest, matches current content-script style.
- B (Chosen): Vue SFC mounted into `#contentInner` — structured, reusable, consistent with popup + WXT Vue module.
- C: inline template in `index.ts` — rejected as messy.

User explicitly chose B.

## Architecture
- New file: `components/Dashboard.vue` — grouped grid of the user's nav-favorited pages (not course favorites). Groups: Education, Organization, Research.
- New file: `entrypoints/tiss.content/dashboard.ts` — small mount helper:
  ```ts
  import { createApp } from 'vue';
  import Dashboard from '@/components/Dashboard.vue';
  export function mountDashboard(container: Element) { ... }
  ```
  Dashboard loads nav favorites from extension storage itself (async), so no props needed in v1.
- New file: `entrypoints/tiss.content/navFavorites.ts` — star injection + storage helpers:
  - `injectNavStars()` scans `#supNav .linkBlock a`, prepends a star toggle per link.
  - `getNavFavorites(): Promise<NavFavorite[]>` / `toggleNavFavorite(item)` / `isFavorited(href)`.
  - Storage via `browser.storage.local` (WXT `storage` util, key `local:pissNavFavorites`). Requires adding `storage` permission to manifest in `wxt.config.ts`.
- Modify: `entrypoints/tiss.content/index.ts` — after existing header/footer/nav cleanup:
  1. Always call `injectNavStars()` (any page that has `#supNav`, independent of query).
  2. Then check query and mount dashboard, then return early (skipping `parseGroupList` and later page-specific logic):
  ```ts
  const params = new URLSearchParams(window.location.search);
  if (params.get('psite') === 'dash') {
    const inner = document.querySelector('div#contentInner');
    if (inner) mountDashboard(inner);
    return; // skip groupList parsing etc.
  }
  ```
- Trigger scope: any page + query (`?psite=dash`, including `&psite=dash` among other params). Check via `URLSearchParams.get('psite') === 'dash'`.

## Components
`Dashboard.vue`:
- Title: e.g. “Dashboard”.
- Shows ONLY pages the user favorited via the aside nav stars — not all TISS pages, and NOT course favorites (favorite courses at `/education/favorites.xhtml` are just one possible link).
- Groups cards by category: Education, Organization, Research (in that order). Each card = `<a>` with title (+ optional section hint).
- Loads its list async from `getNavFavorites()`; shows an empty-state hint (“Star pages in the left navigation to pin them here”) when the list is empty.
- Props: none in v1. Data comes from storage, not props.
- Each unit answers: renders nav-favorites hub; usage is mount into `#contentInner`; depends on Vue + `navFavorites.ts` storage helper.

`navFavorites.ts`:
- Type: `NavFavorite = { href: string; label: string; category: 'education' | 'organization' | 'research' | 'general' }`. `href` stored normalized (pathname + search, e.g. `/education/favorites.xhtml`), so TISS session params don't break matching.
- Category derivation at star time (first match wins): href contains `education`/`lehre` → education; `organisation`/`organization` → organization; `forschung`/`research` → research; else fall back to current `document.body` class (`lehre` → education, `organisation` → organization, `forschung` → research); else `general`, rendered as a separate “General” group after the three main groups.
- `injectNavStars()`: for each `#supNav .linkBlock a`, wrap/inject a star button as the FIRST child (left side of the link text). Star is a `<button type="button" class="piss-nav-star">` with `★`; click toggles favorite with `preventDefault()` + `stopPropagation()` so the link does NOT navigate. Re-run safe (skip links already processed via `data-piss-star` marker).
- Star visuals: font-size ~1.2x line height (`font-size: 1.2em; line-height: 1`), outline (unfilled, `color: transparent` with `-webkit-text-stroke` or low-opacity) when off, yellow filled (`#ffd43b`) when on. Exact technique in plan; must not shift link layout (fixed width, left side).

`dashboard.ts`:
- What: clears container, creates child div, `createApp(Dashboard).mount(child)`.
- Depends on Vue + Dashboard.vue.

## Persistence (nav favorites, NOT course favorites)
- Terminology: “nav favorites” = user-starred aside-nav pages, stored by this extension. “Course favorites” = TISS's own favorite courses on `/education/favorites.xhtml`. Do not confuse them; the Favorites page can itself be a nav favorite (and is a default).
- Mechanism: `browser.storage.local` via WXT storage (`local:pissNavFavorites`, array of `NavFavorite`). Best choice for a browser extension: persists per browser profile, works in content scripts + popup, no server, no cookies, survives TISS session expiry. (`localStorage` rejected: per-origin page storage, cleared with site data, not shared cleanly with extension contexts.)
- Manifest: add `storage` permission in `wxt.config.ts` manifest.
- Defaults (when key absent): exactly two entries — the “Favorites” page (`/education/favorites.xhtml`, education) and the “Calendar” page (exact Calendar href resolved during implementation by matching nav link with href/text containing `calendar`/`kalender`; fallback: first nav link whose label matches Calendar case-insensitively; stored normalized once resolved).
- Toggle semantics: star on → add `{href, label, category}` (label = link text at star time); star off → remove by normalized href. Star state on page load reflects storage.

## Styling
- Reuse existing CSS vars from `style.css`.
- Add scoped styles in `Dashboard.vue` (`<style scoped>`) for grid/cards, or extend `style.css` with `#piss-dashboard` rules. Prefer scoped SFC styles to avoid leaking.
- Dark theme consistent with rest of extension.

## Data flow
1. Content script runs on TISS page load.
2. Existing header/footer/nav cleanup runs unchanged.
3. `injectNavStars()` runs on every page with `#supNav`: reads storage, decorates each nav link with correct star state.
4. Parse `window.location.search`.
5. If `psite=dash`: find `div#contentInner`, clear it, mount Vue dashboard (which async-loads nav favorites and renders grouped cards). Return early (skip `parseGroupList` etc.).
6. Else: existing behavior unchanged. Star toggles update storage + all matching stars on the page immediately.

## Error handling
- If `div#contentInner` missing → no-op, log warning, leave page untouched.
- If Vue mount throws → catch, log error, leave original content (mount into detached node first, only clear on success — detail for plan).
- If `#supNav` missing → skip star injection silently (dashboard still works from storage).
- If storage read fails → dashboard shows empty-state hint; stars default to off.
- Query parsing uses `URLSearchParams`; no regex on raw search string.
- Star click never navigates (`preventDefault` + `stopPropagation`).

## Testing / verification
- `pnpm compile` (`vue-tsc --noEmit`) must pass.
- `pnpm build` must pass.
- Manual: load extension dev (`pnpm dev`), visit `https://tiss.tuwien.ac.at/...?psite=dash`, confirm `#contentInner` replaced by dashboard; visit same page without param, confirm unchanged; visit page without `#contentInner` + param, confirm no crash.
- Manual favorites: star a nav link → star turns yellow, survives reload; unstar → outline again; dashboard (`?psite=dash`) shows only starred pages grouped Education/Organization/Research; fresh profile shows only Calendar + Favorites defaults; toggling a star does not navigate away.

## Out of scope (YAGNI)
- No scraping of favorites/grades/calendar data in v1 — dashboard links to pages only.
- No options page, no drag-reorder, no custom labels, no routing.
- No changes to `background.ts` or popup, except manifest `storage` permission.
