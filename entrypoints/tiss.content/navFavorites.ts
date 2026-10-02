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
      category: deriveCategory(href),
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

async function readStoredRaw(): Promise<NavFavorite[] | null> {
  const stored = await favoritesItem.getValue();
  if (stored === null) return null;
  if (!Array.isArray(stored)) return null;
  return stored.filter(
    (f): f is NavFavorite => typeof (f as NavFavorite)?.href === 'string',
  );
}

export async function getNavFavorites(): Promise<NavFavorite[]> {
  try {
    const stored = await readStoredRaw();
    if (stored !== null) return stored;
    const defaults = resolveDefaults();
    if (defaults.length > 0) {
      try {
        await favoritesItem.setValue(defaults);
      } catch (err) {
        console.warn('[tiss-piss] failed to persist nav favorites', err);
      }
    }
    return defaults;
  } catch (err) {
    console.warn('[tiss-piss] failed to read nav favorites', err);
    return [];
  }
}

// Throws on storage read/write failure so callers can skip optimistic UI updates.
export async function toggleNavFavorite(item: NavFavorite): Promise<boolean> {
  let current: NavFavorite[] | null;
  try {
    current = await readStoredRaw();
  } catch (err) {
    console.warn('[tiss-piss] failed to read nav favorites', err);
    throw err;
  }
  const base = current ?? resolveDefaults();
  const exists = base.some((f) => f.href === item.href);
  const next = exists
    ? base.filter((f) => f.href !== item.href)
    : [...base, item];
  try {
    await favoritesItem.setValue(next);
  } catch (err) {
    console.warn('[tiss-piss] failed to persist nav favorites', err);
    throw err;
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
    const baseLabel = (link.textContent ?? '').trim();
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
    let pending = false;
    const toggle = async (ev: Event) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (pending) return;
      pending = true;
      try {
        const item: NavFavorite = {
          href,
          label: baseLabel || href,
          category: deriveCategory(href),
        };
        let nowOn: boolean;
        try {
          nowOn = await toggleNavFavorite(item);
        } catch (err) {
          console.warn('[tiss-piss] failed to toggle nav favorite', err);
          return;
        }
        if (nowOn) isFav.add(href);
        else isFav.delete(href);
        update();
      } finally {
        pending = false;
      }
    };
    star.addEventListener('click', (ev) => void toggle(ev));
    star.addEventListener('keydown', (ev: KeyboardEvent) => {
      if (ev.key === 'Enter' || ev.key === ' ') void toggle(ev);
    });
    star.classList.add('piss-nav-star');
    link.prepend(star);
  });
}
