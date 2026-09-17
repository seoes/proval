const PLAUSIBLE_ORIGIN = "https://analytics.proval.app";
const PLAUSIBLE_SRC = `${PLAUSIBLE_ORIGIN}/js/script.js`;
const PLAUSIBLE_DOMAIN = "demo.proval.app";

export function loadPlausible(): void {
    if (document.querySelector(`script[src="${PLAUSIBLE_SRC}"]`)) {
        return;
    }

    const preconnect = document.createElement("link");
    preconnect.rel = "preconnect";
    preconnect.href = PLAUSIBLE_ORIGIN;
    preconnect.crossOrigin = "anonymous";
    document.head.appendChild(preconnect);

    const script = document.createElement("script");
    script.defer = true;
    script.dataset.domain = PLAUSIBLE_DOMAIN;
    script.src = PLAUSIBLE_SRC;
    document.head.appendChild(script);
}
