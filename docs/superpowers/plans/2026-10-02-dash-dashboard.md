# Dashboard (psite=dash) + Nav Favorites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `div#contentInner` with a Vue dashboard of starred nav pages on `?psite=dash`, with star toggles on every `#supNav` link persisted in extension storage.

**Architecture:** New `navFavorites.ts` helper owns storage + star injection; new `Dashboard.vue` renders grouped favorites; new `dashboard.ts` mounts Vue into `#contentInner`; `index.ts` wires both; `wxt.config.ts` gains the `storage` permission.

**Tech Stack:** WXT 0.21 + Vue 3 SFC, `wxt/utils/storage` (`local:pissNavFavorites`), vanilla DOM for star injection, `vue-tsc` for typecheck.

---

## File structure

- Create: `entrypoints/tiss.content/navFavorites.ts` — types, `normalizeHref`, `deriveCategory`, storage item, `getNavFavorites`, `toggleNavFavorite`, `injectNavStars`.
- Create: `components/Dashboard.vue` — grouped favorites grid, loads via `getNavFavorites()`.
- Create: `entrypoints/tiss.content/dashboard.ts` — `mountDashboard(container)` with safe-mount semantics.
- Modify: `entrypoints/tiss.content/index.ts` — call `injectNavStars()` always; mount dashboard on `psite=dash` and return early.
- Modify: `entrypoints/tiss.content/style.css` — `.piss-nav-star` styles only.
- Modify: `wxt.config.ts` — add `storage` permission.
- Plan: `docs/superpowers/plans/2026-10-02-dash-dashboard.md` (this file).
- Spec: `docs/superpowers/specs/2026-10-02-dash-dashboard-design.md` (already approved).

Existing patterns to follow: content script uses WXT auto-import globals (`defineContentScript`, `browser`, `storage`) with no explicit imports except CSS; popup imports Vue explicitly (`import { createApp } from 'vue'`). Path alias `@/` maps to repo root, so `@/components/Dashboard.vue` resolves.

---

### Task 1: navFavorites.ts — types, pure helpers, storage

**Files:**
- Create: `entrypoints/tiss.content/navFavorites.ts`

- [ ] **Step 1: Create navFavorites.ts with full implementation**

Write this exact content:

```ts
export type NavCategory = 'education' | 'organization' | 'research' | 'general';

export interface NavFavorite {
  href: string;
  label: string;
  category: NavCategory;
}

const STORAGE_KEY = 'local:pissNavFavorites' as const;

const favoritesItem = storage.defineItem<NavFavorite[] | null>(STORAGE_KEY, {
  fallback: null,
});

export function normalizeHref(raw: string): string {
  try {
    const url = new URL(raw, window.location.origin);
    return url.pathname + url.search;
  } catch {
    return raw;
  }
}

export function deriveCategory(href: string): NavCategory {
  const h = href.toLowerCase();
  if (h.includes('education') || h.includes('lehre')) return 'education';
  if (h.includes('organisation') || h.includes('organization')) return 'organization';
  if (h.includes('forschung') || h.includes('research')) return 'research';
  const body = (document.body?.className ?? '').toLowerCase();
  if (body.includes('lehre')) return 'education';
  if (body.includes('organisation')) return 'organization';
  if (body.includes('forschung')) return 'research';
  return 'general';
}

function resolveDefaults(): NavFavorite[] {
  const links = [...document.querySelectorAll('#supNav .linkBlock a')];
  const find = (re: RegExp) =>
    links.find(
      (a) => re.test(a.getAttribute('href') ?? '') || re.test(a.textContent ?? ''),
    );
  const out: NavFavorite[] = [];
  const favLink = find(/favorites/i);
  if (favLink) {
    const href = normalizeHref(favLink.getAttribute('href') ?? '');
    out.push({
      href,
      label: (favLink.textContent ?? 'Favorites').trim(),
      category: 'education',
    });
  }
  const calLink = find(/calendar|kalender/i);
  if (calLink) {
    const href = normalizeHref(calLink.getAttribute('href') ?? '');
    if (!out.some((f) => f.href === href)) {
      out.push({
        href,
        label: (calLink.textContent ?? 'Calendar').trim(),
        category: deriveCategory(href),
      });
    }
  }
  return out;
}

export async function getNavFavorites(): Promise<NavFavorite[]> {
  try {
    const stored = await favoritesItem.getValue();
    if (stored !== null) return stored;
    const defaults = resolveDefaults();
    await favoritesItem.setValue(defaults);
    return defaults;
  } catch (err) {
    console.warn('[tiss-piss] failed to read nav favorites', err);
    return [];
  }
}

export async function toggleNavFavorite(item: NavFavorite): Promise<boolean> {
  const current = await getNavFavorites();
  const exists = current.some((f) => f.href === item.href);
  const next = exists
    ? current.filter((f) => f.href !== item.href)
    : [...current, item];
  try {
    await favoritesItem.setValue(next);
  } catch (err) {
    console.warn('[tiss-piss] failed to persist nav favorites', err);
  }
  return !exists;
}

export async function injectNavStars(): Promise<void> {
  if (!document.querySelector('#supNav')) return;
  let favorites: NavFavorite[];
  try {
    favorites = await getNavFavorites();
  } catch {
    favorites = [];
  }
  const isFav = new Set(favorites.map((f) => f.href));
  const links = document.querySelectorAll('#supNav .linkBlock a');
  links.forEach((link) => {
    if (link.querySelector('[data-piss-star]')) return;
    const rawHref = link.getAttribute('href') ?? '';
    const href = normalizeHref(rawHref);
    const star = document.createElement('span');
    star.setAttribute('data-piss-star', '1');
    star.setAttribute('role', 'button');
    star.setAttribute('tabindex', '0');
    const update = () => {
      const on = isFav.has(href);
      star.textContent = on ? '★' : '☆';
      star.classList.toggle('piss-nav-star-on', on);
      star.setAttribute('aria-pressed', on ? 'true' : 'false');
      star.setAttribute(
        'aria-label',
        on ? 'Remove from dashboard' : 'Add to dashboard',
      );
      star.setAttribute(
        'title',
        on ? 'Remove from dashboard' : 'Add to dashboard',
      );
    };
    update();
    const toggle = async (ev: Event) => {
      ev.preventDefault();
      ev.stopPropagation();
      const item: NavFavorite = {
        href,
        label: (link.textContent ?? href).trim(),
        category: deriveCategory(href),
      };
      const nowOn = await toggleNavFavorite(item);
      if (nowOn) isFav.add(href);
      else isFav.delete(href);
      update();
    };
    star.addEventListener('click', (ev) => void toggle(ev));
    star.addEventListener('keydown', (ev: KeyboardEvent) => {
      if (ev.key === 'Enter' || ev.key === ' ') void toggle(ev);
    });
    star.classList.add('piss-nav-star');
    link.prepend(star);
  });
}
```

Notes: `storage`, `document`, `window` are available in the content-script context (`storage` is a WXT auto-import global, same as `defineContentScript` already used in `index.ts`). No import statements on purpose — matches the existing `entrypoints/tiss.content/index.ts` style.

- [ ] **Step 2: Typecheck the new file**

Run: `pnpm compile`
Expected: exit 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add entrypoints/tiss.content/navFavorites.ts
git commit -m "feat: add nav favorites storage and helpers"
```

### Task 2: Star styles in content CSS

**Files:**
- Modify: `entrypoints/tiss.content/style.css`

- [ ] **Step 1: Append star styles at end of style.css**

Append this exact block (leave everything above untouched):

```css
#supNav .linkBlock a .piss-nav-star {
  display: inline-block;
  width: 1.4em;
  margin-right: 0.35em;
  font-size: 1.2em;
  line-height: 1;
  text-align: center;
  cursor: pointer;
  color: var(--text-faint);
  opacity: 0.75;
  user-select: none;
}

#supNav .linkBlock a .piss-nav-star:hover {
  opacity: 1;
}

#supNav .linkBlock a .piss-nav-star-on {
  color: #ffd43b;
  opacity: 1;
}
```

Off state uses the outline glyph `☆` in muted color; on state uses filled `★` in yellow via the `piss-nav-star-on` class. Size is `1.2em` per spec (~1.2x line height).

- [ ] **Step 2: Typecheck (CSS has no types; verify build picks it up later — just confirm file saved)**

Run: `pnpm compile`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add entrypoints/tiss.content/style.css
git commit -m "feat: style nav favorite stars"
```

### Task 3: Dashboard.vue component

**Files:**
- Create: `components/Dashboard.vue`

- [ ] **Step 1: Create Dashboard.vue with full implementation**

Write this exact content:

```vue
<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import {
  getNavFavorites,
  type NavCategory,
  type NavFavorite,
} from '@/entrypoints/tiss.content/navFavorites';

const favorites = ref<NavFavorite[]>([]);
const loadError = ref(false);

onMounted(async () => {
  try {
    favorites.value = await getNavFavorites();
  } catch {
    loadError.value = true;
    favorites.value = [];
  }
});

const GROUP_ORDER: NavCategory[] = ['education', 'organization', 'research', 'general'];

const GROUP_LABELS: Record<NavCategory, string> = {
  education: 'Education',
  organization: 'Organization',
  research: 'Research',
  general: 'General',
};

const groups = computed(() =>
  GROUP_ORDER.map((category) => ({
    category,
    label: GROUP_LABELS[category],
    items: favorites.value.filter((f) => f.category === category),
  })).filter((g) => g.items.length > 0),
);
</script>

<template>
  <div id="piss-dashboard">
    <h1>Dashboard</h1>
    <p v-if="loadError" class="piss-dashboard-hint">
      Could not load your pinned pages. Star pages in the left navigation to pin them here.
    </p>
    <p v-else-if="favorites.length === 0" class="piss-dashboard-hint">
      No pinned pages yet. Star pages in the left navigation to pin them here.
    </p>
    <section v-for="group in groups" :key="group.category" class="piss-dashboard-group">
      <h2>{{ group.label }}</h2>
      <div class="piss-dashboard-grid">
        <a
          v-for="item in group.items"
          :key="item.href"
          :href="item.href"
          class="piss-dashboard-card"
        >
          {{ item.label }}
        </a>
      </div>
    </section>
  </div>
</template>

<style scoped>
#piss-dashboard {
  padding: 8px 0 24px;
}

#piss-dashboard h1 {
  margin: 0 0 4px;
}

.piss-dashboard-hint {
  color: var(--text-muted);
}

.piss-dashboard-group {
  margin-top: 20px;
}

.piss-dashboard-group h2 {
  margin: 0 0 10px;
  font-size: 1.1em;
}

.piss-dashboard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}

.piss-dashboard-card {
  display: block;
  padding: 14px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  text-decoration: none;
}

.piss-dashboard-card:hover {
  background: var(--surface-2);
  text-decoration: none;
}
</style>
```

- [ ] **Step 2: Typecheck**

Run: `pnpm compile`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add components/Dashboard.vue
git commit -m "feat: add dashboard favorites component"
```

### Task 4: dashboard.ts mount helper

**Files:**
- Create: `entrypoints/tiss.content/dashboard.ts`

- [ ] **Step 1: Create dashboard.ts with full implementation**

Write this exact content:

```ts
import { createApp } from 'vue';
import Dashboard from '@/components/Dashboard.vue';

export function mountDashboard(container: Element): void {
  const host = document.createElement('div');
  host.id = 'piss-dashboard-host';
  try {
    createApp(Dashboard).mount(host);
  } catch (err) {
    console.error('[tiss-piss] failed to mount dashboard', err);
    return;
  }
  container.replaceChildren(host);
}
```

Safe-mount semantics: Vue mounts into the detached `host` first; the original `#contentInner` children are only replaced after a successful mount. On failure the page is left untouched and the error is logged.

- [ ] **Step 2: Typecheck**

Run: `pnpm compile`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add entrypoints/tiss.content/dashboard.ts
git commit -m "feat: add dashboard mount helper"
```

### Task 5: Wire up index.ts + storage permission

**Files:**
- Modify: `entrypoints/tiss.content/index.ts`
- Modify: `wxt.config.ts`

- [ ] **Step 1: Wire dashboard + stars into the content script**

In `entrypoints/tiss.content/index.ts`, make exactly these two edits:

Edit A — after `import "./style.css";` add:

```ts
import { mountDashboard } from "./dashboard";
import { injectNavStars } from "./navFavorites";
```

Edit B — inside `main()`, right after the `oldContainer.remove();` line (i.e. after all existing cleanup, before the closing `},` of `main()`), insert a blank line plus:

```ts
    void injectNavStars();

    if (new URLSearchParams(window.location.search).get("psite") === "dash") {
      const inner = document.querySelector("div#contentInner");
      if (inner) mountDashboard(inner);
      else console.warn("[tiss-piss] psite=dash but div#contentInner not found");
      return;
    }
```

This keeps all existing header/footer/nav cleanup, always decorates `#supNav` stars, and only hijacks `#contentInner` when `psite=dash` is present (any position in the query string). The `return` ends `main()` on the dashboard (any page-specific logic added later after this point is skipped on the dashboard).

- [ ] **Step 2: Add the storage permission to wxt.config.ts**

Change:

```ts
    permissions: browser === "chrome" ? ['favicon'] : [],
```

to:

```ts
    permissions: browser === "chrome" ? ['favicon', 'storage'] : ['storage'],
```

`browser.storage.local` (used via `wxt/utils/storage`) requires the `storage` permission in MV3.

- [ ] **Step 3: Typecheck and build**

Run: `pnpm compile`
Expected: exit 0.

Run: `pnpm build`
Expected: success, output in `.output/`.

- [ ] **Step 4: Commit**

```bash
git add entrypoints/tiss.content/index.ts wxt.config.ts
git commit -m "feat: wire dashboard on psite=dash and nav stars"
```

### Task 6: Manual verification on TISS

**Files:** none (verification only, no commit).

- [ ] **Step 1: Start the dev extension**

Run: `pnpm dev`
Expected: WXT dev server starts, prints the Chrome/Firefox load URL.

- [ ] **Step 2: Verify dashboard trigger**

1. Visit any `https://tiss.tuwien.ac.at/...` page without query → page looks as before, `#contentInner` untouched.
2. Visit the same page with `?psite=dash` appended → `div#contentInner` contains only `#piss-dashboard-host` with grouped cards; header/footer cleanup still applied.
3. Visit a page with `&psite=dash` among other params → dashboard still shows.

- [ ] **Step 3: Verify stars and persistence**

1. On a page with `#supNav`, each `.linkBlock a` shows a leading `☆` (muted).
2. Click a star → it becomes `★` yellow; page does NOT navigate.
3. Reload → star stays yellow (persisted in `browser.storage.local`).
4. Click again → back to `☆`; reload → stays off.
5. Open `?psite=dash` → only starred pages appear, grouped Education / Organization / Research / General.
6. Fresh profile (or cleared extension storage): dashboard shows only Favorites + Calendar defaults.

- [ ] **Step 4: Verify no-crash paths**

1. `?psite=dash` on a page without `#contentInner` → console warning only, no exception.
2. Page without `#supNav` → no stars, dashboard still renders from storage.
3. Keyboard: focus a star, press Enter → toggles without navigating.

---

## Self-review

1. **Spec coverage:** dashboard trigger on any page + `psite=dash` replacing `div#contentInner` (Task 5); Vue SFC approach (Tasks 3–4); star on left of each nav link, outline off / yellow on, ~1.2em, toggle without navigation (Tasks 1–2); only favorited pages on dash grouped education/organization/research (+general fallback) (Task 3); persistence via `browser.storage.local` with Calendar + Favorites defaults (Task 1); nav-favorites vs course-favorites terminology in code names (`navFavorites`, `NavFavorite`, never `favorites.xhtml` confusion) (Task 1); `storage` permission (Task 5); error handling (no-op + warn on missing container, silent skip on missing `#supNav`, empty-state hint, safe mount) (Tasks 1, 3–5); verification via compile/build/manual (Tasks 1–6). No gaps.
2. **Placeholder scan:** no TBD/TODO; every code step contains full file content; CSS values concrete (`#ffd43b`, `1.2em`, `1.4em` width); storage key concrete (`local:pissNavFavorites`); commands exact (`pnpm compile`, `pnpm build`, `pnpm dev`).
3. **Type consistency:** `NavFavorite`/`NavCategory` defined once in `navFavorites.ts` and imported by `Dashboard.vue`; `mountDashboard(container: Element): void`, `getNavFavorites(): Promise<NavFavorite[]>`, `toggleNavFavorite(item: NavFavorite): Promise<boolean>`, `injectNavStars(): Promise<void>` used identically across Tasks 1, 3–5; `GROUP_ORDER`/`GROUP_LABELS` typed as `NavCategory`.
