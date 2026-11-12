import pageCss from "./pageStyle.css?inline";
import "./shadowStyle.css";
import { mountDashboard } from "./dashboard";
import { injectNavStars } from "./navFavorites";
import { runGroupListScript } from "./groups";
import { replaceIcon, replaceBackgroundIcon } from "./media";
import SpotilightSearch from "@/components/SpotilightSearch.vue";

const searchItems = ref(buildSearchItems());

const Root = defineComponent({
  setup() {
    return () =>
      h(SpotilightSearch, {
        values: searchItems.value,
      });
  },
});

function refreshSearchItems() {
  searchItems.value = buildSearchItems();
}

declare global {
  interface Window {
    PISSLocale: string;
  }
}

export default defineContentScript({
  matches: ["*://*.tiss.tuwien.ac.at/*"],
  cssInjectionMode: "ui",
  async main(ctx) {
    // find out asset base url, usually static/<version>/global
    const assetBaseUrl = document
      .querySelector('link[rel="stylesheet"][href$="basic.css"]')
      ?.getAttribute("href")
      ?.match(/(.+?)\/css\/.+?.css/)?.[1];
    if (assetBaseUrl) {
      document.documentElement.style.setProperty("--base-url", assetBaseUrl);
    }

    // We're on a subpage belonging to help - nothing should be done here
    if (document.body.classList.contains("hilfe")) {
      return;
    }

    // inject css
    const styleEl = document.createElement("style");
    styleEl.textContent = pageCss;
    document.head.appendChild(styleEl);

    // get locale
    window.PISSLocale = document.documentElement.lang || "en";

    // cleanup header html
    cleanupHtml(assetBaseUrl);

    injectNavStars();

    if (window.location.pathname.startsWith("/education/favorites.xhtml")) {
      injectFavCatFilters();
      storeFavorites();
    }

    if (window.location.pathname.startsWith("/education/course/groupList.xhtml")) {
      const messagePanel = document.getElementById("globalMessagesPanel");
      messagePanel!.insertAdjacentHTML("afterend", "<div id='group-calendar'></div>");
      runGroupListScript();
    }

    checkCustomPages();

    document.querySelectorAll("img").forEach((el) => {
      replaceIcon(el, assetBaseUrl ?? "");
    });

    document.querySelectorAll(".item-incomplete .ui-accordion-header").forEach((el) => {
      replaceBackgroundIcon(el as HTMLElement, "cross");
    });

    document.querySelectorAll(".item-complete .ui-accordion-header").forEach((el) => {
      replaceBackgroundIcon(el as HTMLElement, "check");
    });

    const favorites = JSON.parse(localStorage.getItem("tiss-piss-favorites") || "{}") as Record<
      string,
      { type: string; name: string; url: string }
    >;
    const searchItems =
      Object.entries(favorites).map(([courseNr, { type, name, url }]) => ({
        id: `course-${courseNr}`,
        name: `${type} ${name} (${courseNr})`,
        description: "Favoriten",
        url,
      })) || [];
    searchItems.push({
      id: "calendar",
      name: "Calendar",
      description: "Seiten",
      url: "/events/personSchedule.xhtml",
    });

    const ui = await createShadowRootUi(ctx, {
      name: "piss-spotlight-search",
      position: "overlay",
      anchor: "body",
      zIndex: -1,

      onMount(container) {
        const app = createApp(Root);
        app.mount(container);
        return app;
      },

      onRemove(app) {
        app?.unmount();
      },
    });

    ui.mount();
  },
});

function buildSearchItems() {
  const favorites = JSON.parse(localStorage.getItem("tiss-piss-favorites") || "{}") as Record<
    string,
    { type: string; name: string; url: string }
  >;

  return [
    ...Object.entries(favorites).map(([courseNr, { type, name, url }]) => ({
      id: `course-${courseNr}`,
      name: `${type} ${name} (${courseNr})`,
      description: "Favoriten",
      url,
    })),
    {
      id: "calendar",
      name: "Calendar",
      description: "Seiten",
      url: "/events/personSchedule.xhtml",
    },
  ];
}

function checkCustomPages() {
  const customPageMap: Record<string, [string, (container: Element) => void]> = {
    dash: ["div#contentInner", mountDashboard],
  };

  const psite = new URLSearchParams(window.location.search).get("psite");
  const entry = customPageMap[psite ?? ""];
  if (!entry) return;
  const [selector, mountFn] = entry;
  const container = document.querySelector(selector);
  if (container) mountFn(container);
  else console.warn(`[tiss-piss] psite=${psite} but ${selector} not found`);
}

function getCategoryFiltering() {
  const categoryFilteringStore = localStorage.getItem("tiss-piss-fav-cat-spotlight");
  try {
    return categoryFilteringStore === null
      ? {}
      : (JSON.parse(categoryFilteringStore) as Record<string, boolean>);
  } catch {
    return {};
  }
}

function injectFavCatFilters() {
  const categoryFiltering = getCategoryFiltering();

  const headers = document.querySelectorAll("#contentForm\\:groupPanel > .subscriptionGroupHead");
  Array.from(headers).map((header, idx) => {
    const idEl = header.querySelector("a.actionIcon") as HTMLAnchorElement | null;
    if (!idEl) return;
    const categoryId = new URLSearchParams(idEl.search).get("sgId");
    if (!categoryId) return;

    const el = document.createElement("span");
    const checkId = `piss-fav-cat-${idx}`;
    el.className = "piss-fav-cat-spotlight";
    el.innerHTML = `<label for="${checkId}">In Suche anzeigen</label><input type="checkbox" id="${checkId}" ${
      (categoryFiltering[categoryId] ?? true) ? "checked" : ""
    }>`;
    header.appendChild(el);

    const checkbox = el.querySelector("input") as HTMLInputElement | null;
    if (!checkbox) return;
    checkbox.addEventListener("change", () => {
      const catFiltering = getCategoryFiltering();
      catFiltering[categoryId] = checkbox.checked;
      localStorage.setItem("tiss-piss-fav-cat-spotlight", JSON.stringify(catFiltering));
      storeFavorites();
    });
  });
}

function storeFavorites() {
  const categoryFiltering = getCategoryFiltering();
  const headers = document.querySelectorAll("#contentForm\\:groupPanel > .subscriptionGroupHead");
  const favs = Array.from(headers)
    .map((header) => {
      const idEl = header.querySelector("a.actionIcon") as HTMLAnchorElement | null;
      if (!idEl) return null;
      const categoryId = new URLSearchParams(idEl.search).get("sgId");
      if (!categoryId) return null;
      const filtering = categoryFiltering[categoryId] ?? true;
      if (!filtering) return null;
      return header;
    })
    .filter((header) => header !== null)
    .flatMap((header) => {
      const groupList = header.nextElementSibling;
      if (!groupList) return [];
      return Array.from(groupList.querySelectorAll("td.favoritesTitleCol"));
    })
    .map((el) => {
      const type =
        el
          .querySelector("span[title='Typ'], span[title='Type']")
          ?.textContent?.replaceAll(/,/g, "")
          .trim() || "";
      const link = el.querySelector("a") as HTMLAnchorElement | null;
      const name = link?.textContent?.trim() || "";
      const courseNr = new URLSearchParams(link?.search).get("courseNr");
      const url = link?.href || "";
      return [courseNr, { type, name, url }];
    })
    .filter(([courseNr, _]) => courseNr);

  localStorage.setItem("tiss-piss-favorites", JSON.stringify(Object.fromEntries(favs)));
  refreshSearchItems();
}

function cleanupHtml(assetBaseUrl: string | undefined) {
  document.querySelector("#logo")!.innerHTML = `
    <a href="/education/favorites.xhtml?psite=dash">
      <span class="logo-text">TISS</span>
      <span class="logo-sep"></span>
      <span class="logo-text">PISS</span>
    </a>`;
  document.querySelector("#tuLogo")!.outerHTML = `
      <a id="piss-tuLogo" href="https://www.tuwien.ac.at/">
       <img src="${assetBaseUrl}/images/mobile/tu_logo.png" alt="TU Wien Logo">
       </a>
    `;

  // remove sub-header if empty
  document.querySelector("#supNavHeaderWrapper")!.remove();
  const subHeader = document.querySelector("#subHeader");
  const text = subHeader?.innerHTML?.trim();
  if (subHeader && (text === "<br>" || text === "")) {
    subHeader.remove();
  }

  // cleanup footer html
  const footer = document.querySelector("#footer")!;
  const footerShadow = document.querySelector("#footerShadow")!;
  footer.innerHTML = footerShadow.innerHTML;
  footer.querySelectorAll('[id^="footerShadow"]').forEach((el) => el.remove());

  // move links on the right side of the header actually to the right side of the header
  const paperHead = document.querySelector("#paperHead")!;
  const headerRight = document.querySelector("#headerRight")!;
  headerRight.prepend(paperHead);

  // move nav links to header
  const oldContainer = document.querySelector("#mainNav")!;
  const target = document.querySelector("#headerCenterInside")!;
  const newContainer = document.createElement("div");
  newContainer.id = "piss-headerNav";
  newContainer.append(...oldContainer.querySelectorAll("div a"));
  target.prepend(newContainer);
  oldContainer.remove();

  (document.querySelector("#lehreLink")! as HTMLLinkElement).href! = "/education/favorites.xhtml";

  // remove spacing above group list
  document.getElementById("groupContentForm:groupListPanel")?.querySelector("br")?.remove();
}
