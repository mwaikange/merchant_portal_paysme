/** Migration is opt-in until DNS, TLS and Auth redirect allowlists are ready. */
const configuredOrigin = (value: string | undefined, fallback: string) => {
  const url = new URL(value || fallback);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("Portal origins require HTTPS (localhost HTTP is supported).");
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Configure an origin without a path, credentials, query or fragment.");
  }
  return url.origin;
};

export const merchantOrigin = configuredOrigin(import.meta.env.VITE_MERCHANT_ORIGIN, "https://merchant.paysme.site");
export const publicOrigin = configuredOrigin(import.meta.env.VITE_PUBLIC_ORIGIN, "https://www.paysme.site");
export const merchantStandalone = import.meta.env.VITE_MERCHANT_STANDALONE !== "false";
export const domainMigrationEnabled = import.meta.env.VITE_MERCHANT_DOMAIN_ENABLED === "true" || merchantStandalone;

const merchantPaths = new Set([
  "/auth", "/login", "/reset-password", "/desktop-required",
  "/dashboard", "/track-transactions", "/bulk-subscribers", "/referrals", "/security-access",
  "/subscriptions", "/kyc", "/api-integration", "/qr-payment-links", "/profile", "/tax-settings",
]);

export function merchantUrl(path: string) {
  const origin = domainMigrationEnabled ? merchantOrigin : window.location.origin;
  return new URL(path, origin).href;
}

export function publicUrl(path: string) {
  return new URL(path, window.location.origin === merchantOrigin ? publicOrigin : window.location.origin).href;
}

/** Called before importing AuthProvider: tokens must be consumed on the destination origin. */
export function domainRedirect(location: Pick<Location, "href">): string | null {
  const current = new URL(location.href);
  const publicSignup = current.pathname === "/signup" || (current.pathname === "/auth" && current.searchParams.get("tab")?.toLowerCase() === "signup");
  const localPreview = ["localhost", "127.0.0.1"].includes(current.hostname);

  if (merchantStandalone && (current.origin === merchantOrigin || localPreview)) {
    if (publicSignup) {
      const signup = new URL("/signup", publicOrigin);
      current.searchParams.forEach((value, key) => {
        if (key.toLowerCase() !== "tab") signup.searchParams.append(key, value);
      });
      signup.hash = current.hash;
      return signup.href;
    }
    if (current.pathname === "/") return `${current.origin}/auth${current.search}${current.hash}`;
  }

  if (!domainMigrationEnabled) return null;
  const isMerchantPath = !publicSignup && (merchantPaths.has(current.pathname) || current.pathname === "/portal" || current.pathname.startsWith("/portal/"));
  const isPublicHost = [new URL(publicOrigin).host, "paysme.site", "www.paysme.site"].includes(current.host);
  if (isPublicHost && isMerchantPath && current.origin !== merchantOrigin) {
    return merchantOrigin + current.pathname + current.search + current.hash;
  }
  if (current.origin === merchantOrigin && current.pathname === "/") {
    // Keep legacy email confirmation/recovery fragments intact on the merchant host.
    return merchantOrigin + "/auth" + current.search + current.hash;
  }
  return null;
}
