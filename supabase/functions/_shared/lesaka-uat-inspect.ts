import { scrubUat } from "./lesaka-uat.ts";
import { now, uuid } from "./lesaka-uat-store.ts";
/** Read-only discovery by serial. This helper cannot submit a PIN or call redeem. */
export async function inspectUatSerial(
  fixture: { id: string; serial_number: string; value_minor: number },
  credentials: { api_username: string; api_password: string },
  storeId: string | null,
  transport: typeof fetch = fetch,
) {
  if (!/^\d{12}$/.test(fixture.serial_number)) throw new Error("Invalid inventory serial.");
  const reference = crypto.randomUUID(), requestedAt = now();
  const request = { serialNumber: fixture.serial_number, clientReference: reference, requestTime: requestedAt, ...(storeId ? { storeId } : {}) };
  let http = 0, response: Record<string, unknown> = {};
  try {
    const auth = new TextEncoder().encode(`${credentials.api_username}:${credentials.api_password}`);
    const result = await transport("https://staging.bridge.lesaka.tech/virtual-products/api/v2/voucher/status", { method: "POST", redirect: "error", signal: AbortSignal.timeout(20000), headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Basic ${btoa(String.fromCharCode(...auth))}` }, body: JSON.stringify(request) });
    http = result.status;
    const parsed = await result.json().catch(() => null);
    response = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : { error: "Unexpected provider response format." };
  } catch { response = { error: "Status enquiry timed out or was unavailable. No redemption was requested." }; }
  const amount = response.totalAmount as { currency?: string; minor?: number } | undefined;
  const valid = http === 200 && uuid(response.id) && response.clientReference === reference && amount?.currency === "NAD" && amount.minor === fixture.value_minor && Number.isSafeInteger(response.remainingAmount) && Number(response.remainingAmount) >= 0 && Number(response.remainingAmount) <= fixture.value_minor && ["Created", "Reserved", "Active", "Consumed", "Cancelled", "Reversed", "Expired"].includes(String(response.status)) && (!response.serialNumber || response.serialNumber === fixture.serial_number);
  return { fixture_id: fixture.id, operation: "status", client_reference: reference, requested_at: requestedAt, finished_at: now(), http_status: http, valid, observed_state: valid ? String(response.status) : null, request, response: scrubUat(response, [credentials.api_username, credentials.api_password]) };
}
