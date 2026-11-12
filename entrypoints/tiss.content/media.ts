import checkmarkIcon from "/icons/AtIconsCheckmark.svg";
import crossIcon from "/icons/AtIconsCross.svg";
import flagIcon from "/icons/AtIconsFlagTriangular.svg";
import infoIcon from "/icons/AtIconsInfo.svg";
import arrowRightIcon from "/icons/AtIconsArrowRight_green.svg";
import circleCheckIcon from "/icons/CircleCheck.svg";
import speechBubbleIcon from "/icons/AtIconsSpeechBubble.svg";
import starIcon from "/icons/AtIconsStar.svg";
import upDownArrowIcon from "/icons/AtIconsArrowDownArrowUp.svg";
import trashIcon from "/icons/AtIconsTrashCan.svg";
import tuwelLogo from "/TUWEL_Logo.png";

const icons = {
    "check": checkmarkIcon,
    "cross": crossIcon,
    "flag": flagIcon,
    "info": infoIcon,
    "arrow-right": arrowRightIcon,
    "circle-check": circleCheckIcon,
    "speech-bubble": speechBubbleIcon,
    "star": starIcon,
    "up-down-arrow": upDownArrowIcon,
    "trash": trashIcon,
}

const iconReplacements: Record<string, string> = {
    "/icons/tick.png": checkmarkIcon,
    "/icons/cross.png": crossIcon,
    "/icons/flag-yellow.png": flagIcon,
    "/icons/info_grey.png": infoIcon,
    "/icons/arrow-right-green.png": arrowRightIcon,
    "/icons/tick-circle.png": circleCheckIcon,
    "/icons/balloons.png": speechBubbleIcon,
    "/icons/star.png": starIcon,
    "/icons/move-row.png": upDownArrowIcon,
    "/icons/bin--metal.png": trashIcon,
    "/course/jakarta.faces.resource/tuwel_logo.png?ln=images&v=5.36.7": tuwelLogo,
}

export function replaceIcon(element: HTMLImageElement, baseUrl: string) {
    const src = element.getAttribute("src");
    if (!src) return;
    const relativeSrc = src.startsWith(baseUrl) ? src.substring(baseUrl.length) : src;
    const replacement = iconReplacements[relativeSrc];
    if (replacement) {
        // all the files are in public, so the path is safe
        element.setAttribute("src", browser.runtime.getURL(replacement as any));
    }
}

export function replaceBackgroundIcon(element: HTMLElement, icon: keyof typeof icons) {
    const iconUrl = browser.runtime.getURL(icons[icon] as any);
    element.style.backgroundImage = `url(${iconUrl})`;
}

export function replaceTuwelLogo(element: HTMLImageElement) {
    element.setAttribute("src", browser.runtime.getURL(tuwelLogo as any));
}