import { useEffect, useState } from "react";

export const portalDesktopViewport = "(min-width: 1024px)";

export type PortalDeviceKind = "desktop" | "mobile" | "tablet" | "compact";

const phoneUserAgent = /iPhone|iPod|IEMobile|Windows Phone|Opera Mini|Android.*Mobile/i;
const tabletUserAgent = /iPad|Tablet|PlayBook|Silk|Kindle|Android(?!.*Mobile)/i;

export const getPortalDeviceKind = (): PortalDeviceKind => {
  if (typeof window === "undefined") return "desktop";

  const { navigator } = window;
  const isTouchIpad = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;

  if (isTouchIpad || tabletUserAgent.test(navigator.userAgent)) return "tablet";
  if (phoneUserAgent.test(navigator.userAgent)) return "mobile";
  if (!window.matchMedia(portalDesktopViewport).matches) return "compact";
  return "desktop";
};

export const canUseMerchantPortal = () => getPortalDeviceKind() === "desktop";

export const usePortalDeviceAccess = () => {
  const [deviceKind, setDeviceKind] = useState<PortalDeviceKind>(getPortalDeviceKind);

  useEffect(() => {
    const mediaQuery = window.matchMedia(portalDesktopViewport);
    const updateDeviceKind = () => setDeviceKind(getPortalDeviceKind());

    updateDeviceKind();
    mediaQuery.addEventListener("change", updateDeviceKind);
    return () => mediaQuery.removeEventListener("change", updateDeviceKind);
  }, []);

  return {
    deviceKind,
    desktopAllowed: deviceKind === "desktop",
  };
};
