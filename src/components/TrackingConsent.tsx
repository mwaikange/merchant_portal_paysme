import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  isAnalyticsConfigured,
  isMetaPixelConfigured,
  isTwiplaConfigured,
  setGoogleConsent,
  setMetaConsent,
  setTwiplaConsent,
  trackGooglePageView,
  trackMetaPageView,
  type TrackingConsent,
} from "@/lib/analytics";

const CONSENT_STORAGE_KEY = "paysme-tracking-consent-v1";
const OPEN_CONSENT_PREFERENCES_EVENT = "paysme:open-cookie-preferences";

function readConsent(): TrackingConsent | null {
  try {
    const stored = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored) as Partial<TrackingConsent>;
    if (
      parsed.version !== 1 ||
      typeof parsed.analytics !== "boolean" ||
      typeof parsed.marketing !== "boolean"
    ) {
      return null;
    }

    return parsed as TrackingConsent;
  } catch {
    return null;
  }
}

function persistConsent(analytics: boolean, marketing: boolean): TrackingConsent {
  const consent: TrackingConsent = {
    analytics,
    marketing,
    updatedAt: new Date().toISOString(),
    version: 1,
  };
  window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(consent));
  return consent;
}

export function TrackingConsentBanner() {
  const location = useLocation();
  const [consent, setConsent] = useState<TrackingConsent | null>(() => readConsent());
  const [showPreferences, setShowPreferences] = useState(false);
  const [analytics, setAnalytics] = useState(consent?.analytics ?? false);
  const [marketing, setMarketing] = useState(consent?.marketing ?? false);
  const trackingConfigured =
    isAnalyticsConfigured || isMetaPixelConfigured || isTwiplaConfigured;

  useEffect(() => {
    if (!trackingConfigured || !consent) return;

    setGoogleConsent(consent.analytics);
    setMetaConsent(consent.marketing);
    setTwiplaConsent(consent.analytics);
  }, [consent, trackingConfigured]);

  useEffect(() => {
    if (!trackingConfigured || !consent) return;

    const pagePath = `${location.pathname}${location.search}${location.hash}`;
    if (consent.analytics) trackGooglePageView(pagePath);
    if (consent.marketing) trackMetaPageView();
  }, [
    consent,
    location.hash,
    location.pathname,
    location.search,
    trackingConfigured,
  ]);

  useEffect(() => {
    const openPreferences = () => {
      const savedConsent = readConsent();
      setConsent(savedConsent);
      setAnalytics(savedConsent?.analytics ?? false);
      setMarketing(savedConsent?.marketing ?? false);
      setShowPreferences(true);
    };
    window.addEventListener(OPEN_CONSENT_PREFERENCES_EVENT, openPreferences);
    return () =>
      window.removeEventListener(
        OPEN_CONSENT_PREFERENCES_EVENT,
        openPreferences
      );
  }, []);

  if (!trackingConfigured) return null;

  const save = (nextAnalytics: boolean, nextMarketing: boolean) => {
    const shouldReloadToStopTwipla =
      isTwiplaConfigured && Boolean(consent?.analytics) && !nextAnalytics;
    const nextConsent = persistConsent(nextAnalytics, nextMarketing);
    setAnalytics(nextAnalytics);
    setMarketing(nextMarketing);
    setConsent(nextConsent);
    setShowPreferences(false);
    if (shouldReloadToStopTwipla) window.location.reload();
  };

  return (
    <>
      {(!consent || showPreferences) && (
        <div
          className="fixed inset-x-3 bottom-3 z-[10000] mx-auto max-w-3xl rounded-2xl border border-[#f5c430]/50 bg-[#111914] p-5 text-white shadow-2xl sm:bottom-5 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tracking-consent-title"
        >
          <div className="flex flex-col gap-5">
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-[#f5c430]">
                Your privacy
              </p>
              <h2 id="tracking-consent-title" className="text-xl font-bold">
                Choose how PaySME uses cookies
              </h2>
              <p className="mt-2 text-sm leading-6 text-white/75">
                Necessary storage keeps the website working. With your permission, analytics helps
                us improve PaySME and marketing cookies help us understand campaign performance.
              </p>
            </div>

            {showPreferences && (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-white/15 bg-white/5 p-4">
                  <p className="font-semibold">Necessary</p>
                  <p className="mt-1 text-xs text-white/65">Always on for essential site functions.</p>
                </div>
                <label className="flex cursor-pointer items-start justify-between gap-3 rounded-xl border border-white/15 bg-white/5 p-4">
                  <span>
                    <span className="block font-semibold">Analytics</span>
                    <span className="mt-1 block text-xs text-white/65">
                      Google Analytics and TWIPLA page usage.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={analytics}
                    onChange={(event) => setAnalytics(event.target.checked)}
                    className="mt-1 h-4 w-4 accent-[#f5c430]"
                  />
                </label>
                <label className="flex cursor-pointer items-start justify-between gap-3 rounded-xl border border-white/15 bg-white/5 p-4">
                  <span>
                    <span className="block font-semibold">Marketing</span>
                    <span className="mt-1 block text-xs text-white/65">Meta campaign measurement.</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={marketing}
                    onChange={(event) => setMarketing(event.target.checked)}
                    className="mt-1 h-4 w-4 accent-[#f5c430]"
                  />
                </label>
              </div>
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {!showPreferences ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setAnalytics(consent?.analytics ?? false);
                      setMarketing(consent?.marketing ?? false);
                      setShowPreferences(true);
                    }}
                    className="rounded-lg border border-white/25 px-4 py-2.5 text-sm font-semibold hover:bg-white/10"
                  >
                    Manage choices
                  </button>
                  <button
                    type="button"
                    onClick={() => save(false, false)}
                    className="rounded-lg border border-white/25 px-4 py-2.5 text-sm font-semibold hover:bg-white/10"
                  >
                    Reject non-essential
                  </button>
                  <button
                    type="button"
                    onClick={() => save(true, true)}
                    className="rounded-lg bg-[#f5c430] px-4 py-2.5 text-sm font-bold text-[#111914] hover:bg-[#ffd654]"
                  >
                    Accept all
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setShowPreferences(false)}
                    className="rounded-lg border border-white/25 px-4 py-2.5 text-sm font-semibold hover:bg-white/10"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => save(analytics, marketing)}
                    className="rounded-lg bg-[#f5c430] px-4 py-2.5 text-sm font-bold text-[#111914] hover:bg-[#ffd654]"
                  >
                    Save preferences
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
