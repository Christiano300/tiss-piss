import "./style.css";
import { mountDashboard } from "./dashboard";
import { injectNavStars } from "./navFavorites";

export default defineContentScript({
  matches: ["*://*.tiss.tuwien.ac.at/*"],
  main() {
    // find out asset base url, usually static/<version>/global
    const assetBaseUrl = document
      .querySelector('link[rel="stylesheet"][href$="basic.css"]')
      ?.getAttribute("href")
      ?.match(/(.+?)\/css\/.+?.css/)?.[1];
    if (assetBaseUrl) {
      document.documentElement.style.setProperty("--base-url", assetBaseUrl);
    }

    // cleanup header html
    document.querySelector("#logo")!.innerHTML = `
    <a href="/">
      <span class="logo-text">TISS</span>
      <span class="logo-sep"></span>
      <span class="logo-text">PISS</span>
    </a>`;
    document.querySelector("#tuLogo")!.outerHTML = `
      <a id="piss-tuLogo" href="https://www.tuwien.ac.at">
       <img src="${assetBaseUrl}/images/mobile/tu_logo.png" alt="TU Wien Logo">
       </a>
    `;

    // remove sub-header if empty
    document.querySelector("#supNavHeaderWrapper")!.remove();
    const subHeader = document.querySelector("#subHeader");
    const text = subHeader?.innerHTML.trim();
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

    void injectNavStars();

    if (new URLSearchParams(window.location.search).get("psite") === "dash") {
      const inner = document.querySelector("div#contentInner");
      if (inner) mountDashboard(inner);
      else console.warn("[tiss-piss] psite=dash but div#contentInner not found");
      return;
    }
  },
});
