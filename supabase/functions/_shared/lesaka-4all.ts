// Lesaka 4All API v2.1.0. Keep credentials and voucher PINs on the server.
export const LESAKA_CURRENCY = "NAD";
export const LESAKA_PENDING_MESSAGE = "Lesaka voucher payments are not available yet. Please choose another payment method.";

export type LesakaConfig = {
  environment: "staging" | "production";
  baseUrl: string;
  username: string;
  password: string;
  fingerprintSecret: string;
};

export class LesakaError extends Error {
  status: number;
  code: string;
  traceId?: string;
  constructor(message: string, status = 409, code = "lesaka_verification_failed", traceId?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.traceId = traceId;
  }
}

export function lesakaPlatformConfig(env: (key: string) => string | undefined): Omit<LesakaConfig, "username" | "password"> | null {
  if (env("LESAKA_4ALL_ENABLED") !== "true") return null;
  const environment = env("LESAKA_4ALL_ENVIRONMENT");
  if (environment !== "staging" && environment !== "production") return null;
  if (environment === "production" && env("LESAKA_4ALL_UAT_APPROVED") !== "true") return null;
  try {
    if (atob(env("LESAKA_CREDENTIALS_ENCRYPTION_KEY") || "").length !== 32) return null;
  } catch { return null; }
  const fingerprintSecret = env("LESAKA_4ALL_FINGERPRINT_SECRET") || "";
  if (fingerprintSecret.length < 32) return null;
  return {
    environment,
    baseUrl: environment === "staging"
      ? "https://staging.bridge.lesaka.tech/virtual-products"
      : "https://bridge.lesaka.tech/virtual-products",
    fingerprintSecret,
  };
}

export function lesakaConfig(
  env: (key: string) => string | undefined,
  credentials?: { api_username: string; api_password: string } | null,
): LesakaConfig | null {
  const platform = lesakaPlatformConfig(env);
  // No platform credential fallback: authentication always belongs to the
  // merchant resolved from the PaySME transaction, in the selected environment.
  if (!platform || !credentials?.api_username || !credentials.api_password) return null;
  return { ...platform, username: credentials.api_username, password: credentials.api_password };
}

export function voucherPin(value: unknown): string {
  // Accept printed spacing, but never silently discard letters or punctuation.
  const pin = typeof value === "string" ? value.replace(/[\s-]/g, "") : "";
  if (!/^\d{16}$/.test(pin)) throw new LesakaError("Enter the 16-digit Lesaka 4All voucher PIN.", 400, "invalid_voucher_pin");
  return pin;
}

export function amountMinor(value: unknown): number {
  const amount = Number(value);
  const minor = Math.round(amount * 100);
  if (!Number.isFinite(amount) || minor <= 0 || !Number.isSafeInteger(minor) || minor > 2147483647 || Math.abs(amount * 100 - minor) > 0.000001) {
    throw new LesakaError("The checkout amount is invalid.", 400, "invalid_amount");
  }
  return minor;
}

export async function pinFingerprint(pin: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(pin));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

type VoucherResponse = {
  id: string;
  clientReference: string;
  totalAmount: { currency: string; minor: number };
  remainingAmount: number;
  status?: string;
  expiryDate?: string;
};

export function verifyVoucher(data: unknown, reference: string, minor: number, redeemed = false): VoucherResponse {
  const voucher = data as VoucherResponse | null;
  if (!voucher || typeof voucher.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(voucher.id) || voucher.clientReference !== reference ||
      voucher.totalAmount?.currency !== LESAKA_CURRENCY || voucher.totalAmount?.minor !== minor ||
      !Number.isSafeInteger(voucher.remainingAmount) || voucher.remainingAmount !== (redeemed ? 0 : minor)) {
    throw new LesakaError("The voucher currency or value does not match this checkout.", 409, "voucher_mismatch");
  }
  if (!redeemed && (voucher.status !== "Active" || !voucher.expiryDate || !Number.isFinite(Date.parse(voucher.expiryDate)) || Date.parse(voucher.expiryDate) <= Date.now())) {
    throw new LesakaError("This voucher is not active or has expired. Please use another voucher.", 409, "voucher_not_active");
  }
  return voucher;
}

export async function lesakaRequest(
  config: LesakaConfig,
  action: "status" | "redeem",
  body: { pin?: string; serialNumber?: string; clientReference: string; requestTime: string; storeId?: string },
  transport: typeof fetch = fetch,
): Promise<unknown> {
  let response: Response;
  let data: Record<string, unknown>;
  try {
    const credentials = new TextEncoder().encode(`${config.username}:${config.password}`);
    response = await transport(`${config.baseUrl}/api/v2/voucher/${action}`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(20000),
      headers: {
        "Content-Type": "application/json", Accept: "application/json",
        Authorization: `Basic ${btoa(String.fromCharCode(...credentials))}`,
      },
      body: JSON.stringify(body),
    });
    data = await response.json();
  } catch {
    // Never include raw provider bodies/errors: they can contain the PIN.
    throw new LesakaError("Voucher verification is incomplete. Retry using the same voucher for this checkout.", 502, "lesaka_outcome_unknown");
  }
  if (response.status !== 200) {
    const code = Number(data?.errorCode);
    const message = code === 5001 || response.status === 404
      ? "This voucher is unavailable, already used, cancelled or expired."
      : code === 5003
        ? "This voucher request needs support review. Do not use a different voucher for this checkout."
        : code === 5007
          ? "This voucher is being processed. Wait, then retry the same voucher."
          : code === 5005
            ? "The voucher request was rejected. Please contact support."
            : "Voucher verification is unavailable. Retry the same voucher or contact support.";
    const traceId = typeof data?.traceId === "string" && /^[a-zA-Z0-9-]{1,128}$/.test(data.traceId) ? data.traceId : undefined;
    throw new LesakaError(message, response.status >= 500 ? 502 : 409, `lesaka_${code || response.status}`, traceId);
  }
  return data;
}
