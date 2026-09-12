export type TrackingConsent = {
  analytics: boolean;
  marketing: boolean;
  updatedAt: string;
  version: 1;
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: ((...args: unknown[]) => void) & {
      callMethod?: (...args: unknown[]) => void;
      queue?: unknown[][];
      loaded?: boolean;
      version?: string;
      push?: (...args: unknown[]) => void;
    };
    _fbq?: Window["fbq"];
    va?: ((...args: unknown[]) => void) & { v?: unknown[][] };
    _visaSettings?: Record<
      string,
      { v: string; s: string; a: string; t: string }
    >;
  }
}

const GA_SCRIPT_ID = "paysme-google-analytics";
const META_SCRIPT_ID = "paysme-meta-pixel";
const TWIPLA_SCRIPT_ID = "paysme-twipla-analytics";

export const GA_MEASUREMENT_ID =
  import.meta.env.VITE_GA_MEASUREMENT_ID?.trim() || "G-Q43XNWGDEN";
export const META_PIXEL_ID =
  import.meta.env.VITE_META_PIXEL_ID?.trim() || "1314069464140664";
export const TWIPLA_SITE_ID =
  import.meta.env.VITE_TWIPLA_SITE_ID?.trim() ||
  "44f9d18c-89a5-11f1-9aa5-960004340fd3";

export const isAnalyticsConfigured = Boolean(GA_MEASUREMENT_ID);
export const isMetaPixelConfigured = Boolean(META_PIXEL_ID);
export const isTwiplaConfigured = Boolean(TWIPLA_SITE_ID);

export function loadGoogleAnalytics() {
  if (!GA_MEASUREMENT_ID || typeof window === "undefined") return;

  window.dataLayer = window.dataLayer || [];
  window.gtag =
    window.gtag ||
    function gtag(...args: unknown[]) {
      window.dataLayer?.push(args);
    };

  if (!document.getElementById(GA_SCRIPT_ID)) {
    window.gtag("consent", "default", {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });

    const script = document.createElement("script");
    script.id = GA_SCRIPT_ID;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`;
    document.head.appendChild(script);

    window.gtag("js", new Date());
    window.gtag("config", GA_MEASUREMENT_ID, {
      send_page_view: false,
      anonymize_ip: true,
    });
  }
}

export function setGoogleConsent(allowed: boolean) {
  if (!GA_MEASUREMENT_ID || typeof window === "undefined") return;
  if (allowed) loadGoogleAnalytics();

  window.gtag?.("consent", "update", {
    analytics_storage: allowed ? "granted" : "denied",
  });
}

export function trackGooglePageView(path: string) {
  if (!GA_MEASUREMENT_ID || typeof window === "undefined") return;
  window.gtag?.("event", "page_view", {
    page_path: path,
    page_location: `${window.location.origin}${path}`,
    page_title: document.title,
  });
}

export function loadMetaPixel() {
  if (!META_PIXEL_ID || typeof window === "undefined") return;
  const isAlreadyBootstrapped = Boolean(document.getElementById(META_SCRIPT_ID));

  if (!window.fbq) {
    const fbq = function (...args: unknown[]) {
      if (fbq.callMethod) {
        fbq.callMethod(...args);
      } else {
        fbq.queue?.push(args);
      }
    } as Window["fbq"];

    fbq.queue = [];
    fbq.loaded = true;
    fbq.version = "2.0";
    window.fbq = fbq;
    window._fbq = fbq;
  }

  if (!document.getElementById(META_SCRIPT_ID)) {
    const script = document.createElement("script");
    script.id = META_SCRIPT_ID;
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(script);
  }

  window.fbq?.("consent", "grant");
  if (!isAlreadyBootstrapped) window.fbq?.("init", META_PIXEL_ID);
}

export function setMetaConsent(allowed: boolean) {
  if (!META_PIXEL_ID || typeof window === "undefined") return;
  if (allowed) {
    loadMetaPixel();
  } else {
    window.fbq?.("consent", "revoke");
  }
}

export function trackMetaPageView() {
  if (!META_PIXEL_ID || typeof window === "undefined") return;
  window.fbq?.("track", "PageView");
}

export function loadTwiplaAnalytics() {
  if (!TWIPLA_SITE_ID || typeof window === "undefined") return;

  if (!window.va) {
    const va = function (...args: unknown[]) {
      va.v = va.v || [];
      va.v.push(args);
    } as Window["va"];
    window.va = va;
  }

  window._visaSettings = window._visaSettings || {};
  window._visaSettings[TWIPLA_SITE_ID] = {
    v: "1.0",
    s: TWIPLA_SITE_ID,
    a: "1",
    t: "va",
  };

  if (!document.getElementById(TWIPLA_SCRIPT_ID)) {
    const script = document.createElement("script");
    script.id = TWIPLA_SCRIPT_ID;
    script.defer = true;
    script.async = true;
    script.src = `https://app-worker.visitor-analytics.io/main.js?s=${encodeURIComponent(TWIPLA_SITE_ID)}`;
    document.body.appendChild(script);
  }
}

export function setTwiplaConsent(allowed: boolean) {
  if (!TWIPLA_SITE_ID || typeof window === "undefined") return;
  if (allowed) loadTwiplaAnalytics();
}
