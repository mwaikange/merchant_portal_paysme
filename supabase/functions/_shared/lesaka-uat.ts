// Private UAT helpers. These never settle PaySME transactions or send paid notifications.
export type UatInput = "pin" | "serial" | "blank-pin" | "blank-serial" | "long-pin" | "short-pin" | "unknown-pin" | "unknown-serial" | "missing-reference" | "replay";
export type UatCase = {
  id: string; title: string; operation: "status" | "redeem"; input: UatInput;
  expected: string; http: number[]; state?: string; errorCode?: number;
  amountMinor?: number; precondition?: string; review?: string; blocked?: string;
};
const c = (id: string, title: string, operation: UatCase["operation"], input: UatInput, expected: string, extra: Partial<UatCase> = {}): UatCase => ({ id, title, operation, input, expected, http: [200], ...extra });
export const LESAKA_UAT_CASES: UatCase[] = [
  c("TC-VS-001", "Unused voucher by PIN", "status", "pin", "Unused voucher, value and product description", { state: "Active", review: "Workbook says New; OpenAPI says Active. Confirm the status-label mapping with Lesaka." }),
  c("TC-VS-002", "Unused voucher by serial", "status", "serial", "Same unused voucher details as the PIN query", { state: "Active", review: "Workbook says New; OpenAPI says Active. Confirm the status-label mapping with Lesaka." }),
  c("TC-VS-003", "Previously redeemed voucher", "status", "pin", "Redeemed state, redemption time and collector reference", { state: "Consumed", review: "OpenAPI uses Consumed and does not expose redemption time or collector reference. Lesaka must confirm the workbook expectation." }),
  c("TC-VS-004", "Reversed voucher by serial", "status", "serial", "Reversed voucher details", { state: "Reversed", review: "Workbook says Spoilt; OpenAPI says Reversed. Confirm this mapping with Lesaka." }),
  c("TC-VS-005", "Expired voucher status", "status", "pin", "Expired with voucher value and product description", { state: "Expired" }),
  c("TC-VS-006", "Unknown voucher PIN", "status", "unknown-pin", "Voucher not found without a crash", { http: [404] }),
  c("TC-VS-007", "Unknown voucher serial", "status", "unknown-serial", "Voucher not found without a crash", { http: [404] }),
  c("TC-VS-008", "Blank PIN", "status", "blank-pin", "PIN validation error", { http: [400], errorCode: 5005 }),
  c("TC-VS-009", "Blank serial", "status", "blank-serial", "Serial validation error", { http: [400], errorCode: 5005, review: "Workbook mentions 12–15 serial digits; OpenAPI requires exactly 12. Confirm the accepted length with Lesaka." }),
  c("TC-VS-010", "PIN too long", "status", "long-pin", "PIN validation error", { http: [400], errorCode: 5005 }),
  c("TC-VR-001", "Redeem N$10", "redeem", "pin", "Full N$10 redemption; remaining balance zero", { amountMinor: 1000, precondition: "Active" }),
  c("TC-VR-002", "Redeem N$1,000", "redeem", "pin", "Full N$1,000 redemption; remaining balance zero", { amountMinor: 100000, precondition: "Active" }),
  c("TC-VR-003", "Reject a redeemed voucher", "redeem", "pin", "RedemptionNotAllowed", { http: [403], errorCode: 5001, precondition: "Consumed" }),
  c("TC-VR-004", "Reject an expired voucher", "redeem", "pin", "RedemptionNotAllowed", { http: [403], errorCode: 5001, precondition: "Expired" }),
  c("TC-VR-005", "Reject a reversed voucher", "redeem", "pin", "RedemptionNotAllowed", { http: [403], errorCode: 5001, precondition: "Reversed" }),
  c("TC-VR-006", "Reject an unknown PIN", "redeem", "unknown-pin", "Voucher not found or not redeemable", { http: [404, 403, 409], errorCode: 5001 }),
  c("TC-VR-007", "Reject a blank PIN", "redeem", "blank-pin", "PIN validation error", { http: [400], errorCode: 5005 }),
  c("TC-VR-008", "Reject an unsupported product", "redeem", "pin", "Product unavailable; no credit issued", { http: [403, 409], errorCode: 5001, precondition: "Unsupported" }),
  c("TC-STAT-01", "API: active voucher by PIN", "status", "pin", "HTTP 200, Active, NAD and a valid balance", { state: "Active" }),
  c("TC-STAT-02", "API: active voucher by serial", "status", "serial", "HTTP 200, Active; compare with PIN query", { state: "Active" }),
  c("TC-STAT-03", "API: expired voucher", "status", "pin", "HTTP 200, Expired", { state: "Expired" }),
  c("TC-STAT-04", "API: cancelled voucher", "status", "pin", "HTTP 200, Cancelled", { state: "Cancelled" }),
  c("TC-STAT-05", "API: missing client reference", "status", "missing-reference", "HTTP 400, ValidationFailure", { http: [400], errorCode: 5005 }),
  c("TC-RED-01", "API: full redemption", "redeem", "pin", "HTTP 200, full balance consumed", { precondition: "Active" }),
  c("TC-RED-02", "API: consumed voucher", "redeem", "pin", "HTTP 403, RedemptionNotAllowed", { http: [403], errorCode: 5001, precondition: "Consumed" }),
  c("TC-RED-03", "API: expired voucher", "redeem", "pin", "HTTP 403, RedemptionNotAllowed", { http: [403], errorCode: 5001, precondition: "Expired" }),
  c("TC-RED-04", "API: cancelled voucher", "redeem", "pin", "HTTP 403, RedemptionNotAllowed", { http: [403], errorCode: 5001, precondition: "Cancelled" }),
  c("TC-RED-05", "API: prevent over-redemption", "redeem", "pin", "Reject an amount greater than the voucher balance", { blocked: "Lesaka's UAT page asks for an amount, but RedeemRequest has no amount field and the guide permits only full redemption. Supplier clarification is required; no request will be invented." }),
  c("TC-EDGE-01", "API: replay original redemption", "redeem", "replay", "Same reference returns the original receipt; balance stays zero"),
  c("TC-EDGE-02", "API: 15-digit PIN", "redeem", "short-pin", "HTTP 400, ValidationFailure", { http: [400], errorCode: 5005 }),
];
export type Verdict = "running" | "pass" | "fail" | "review" | "blocked" | "uncertain" | "error";
export type InventoryItem = { fixture_id: string; value_minor: number; serial_number: string; pin: string; allocation: "automated" | "manual"; source_line: number };
export function parseUatInventory(text: string): InventoryItem[] {
  let value = 0;
  const entries: Omit<InventoryItem, "allocation" | "fixture_id">[] = [];
  const pins = new Set<string>(), serials = new Set<string>();
  for (const [index, line] of text.replace(/^\uFEFF/, "").split(/\r?\n/).entries()) {
    const heading = /N\$\s*([\d,]+(?:\.\d{1,2})?)/i.exec(line);
    if (heading) { value = Math.round(Number(heading[1].replaceAll(",", "")) * 100); continue; }
    if (!line.trim() || /^\s*Serial Number\s*,\s*PIN\s*$/i.test(line)) continue;
    const pair = /^\s*(\d{12})\s*,\s*(\d{16})\s*$/.exec(line);
    if (!pair || !Number.isSafeInteger(value) || value <= 0) throw new Error(`Invalid inventory format at line ${index + 1}.`);
    if (pins.has(pair[2]) || serials.has(pair[1])) throw new Error("Duplicate voucher in inventory.");
    pins.add(pair[2]); serials.add(pair[1]);
    entries.push({ value_minor: value, serial_number: pair[1], pin: pair[2], source_line: index + 1 });
  }
  if (!entries.length || entries.length > 2000) throw new Error("Inventory must contain 1–2,000 vouchers.");
  const counts = new Map<number, number>(), seen = new Map<number, number>();
  for (const item of entries) counts.set(item.value_minor, (counts.get(item.value_minor) || 0) + 1);
  return entries.map(item => {
    const ordinal = (seen.get(item.value_minor) || 0) + 1; seen.set(item.value_minor, ordinal);
    const allocation = ordinal <= Math.floor(counts.get(item.value_minor)! / 2) ? "automated" : "manual";
    return { ...item, allocation, fixture_id: `NAD${item.value_minor / 100}-${allocation === "automated" ? "A" : "M"}${String(ordinal).padStart(2, "0")}` };
  });
}
export const needsFixture = (test: UatCase) => ["pin", "serial", "missing-reference", "replay"].includes(test.input);
export function uatRequest(test: UatCase, fixture: { pin: string; serial_number: string } | null, reference: string, time: string, storeId?: string) {
  const body: Record<string, unknown> = { clientReference: reference, requestTime: time, ...(storeId ? { storeId } : {}) };
  if (needsFixture(test) && !fixture) throw new Error("Select a voucher for this case.");
  if (test.input === "serial") body.serialNumber = fixture!.serial_number;
  else if (test.input === "blank-serial") body.serialNumber = "";
  else if (test.input === "unknown-serial") body.serialNumber = "000000000000";
  else body.pin = test.input === "blank-pin" ? "" : test.input === "long-pin" ? "0".repeat(17) : test.input === "short-pin" ? "0".repeat(15) : test.input === "unknown-pin" ? "0".repeat(16) : fixture!.pin;
  if (test.input === "missing-reference") delete body.clientReference;
  return body;
}
export function scrubUat(value: unknown, secrets: string[] = [], depth = 0): unknown {
  if (depth > 8) return "[TRUNCATED]";
  if (typeof value === "string") {
    let result = value.slice(0, 4000);
    for (const secret of secrets.filter(Boolean).sort((a, b) => b.length - a.length)) result = result.split(secret).join("[REDACTED]");
    return result.replace(/\b(?:\d[ -]?){16,}\b/g, "[REDACTED]").replace(/Basic\s+[A-Za-z0-9+/=]+/gi, "Basic [REDACTED]");
  }
  if (Array.isArray(value)) return value.slice(0, 50).map(item => scrubUat(item, secrets, depth + 1));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).slice(0, 80).map(([key, item]) => [key, /^(pin|password|username|authorization|encrypted_pin|encrypted_credentials|api_key)$/i.test(key) ? "[REDACTED]" : scrubUat(item, secrets, depth + 1)]));
  return value;
}
export function evaluateUat(test: UatCase, http: number, data: Record<string, unknown>, reference: string, expectedMinor?: number): { verdict: Verdict; reason: string } {
  if (!http || http >= 500 || (test.operation === "redeem" && [5003, 5007].includes(Number(data.errorCode)))) return { verdict: test.operation === "redeem" ? "uncertain" : "error", reason: "Provider outcome is incomplete. Retry this execution with its original reference." };
  if (!test.http.includes(http)) {
    if (http === 409 && test.http.includes(403) && Number(data.errorCode) === test.errorCode) return { verdict: "review", reason: "Business error matches, but HTTP 409 differs from the UAT page's HTTP 403. Supplier confirmation required." };
    return { verdict: "fail", reason: `Expected HTTP ${test.http.join("/")}; received ${http}.` };
  }
  if (http !== 200) {
    // A not-found response may be ProblemDetails rather than ErrorResponse.
    if (test.errorCode && Number(data.errorCode) !== test.errorCode && !(http === 404 && test.input === "unknown-pin")) return { verdict: "review", reason: "HTTP rejection received, but the expected Lesaka business code is absent or different. Inspect the captured response." };
    return { verdict: test.review ? "review" : "pass", reason: test.review || "Expected provider rejection recorded." };
  }
  const amount = data.totalAmount as { currency?: string; minor?: number } | undefined;
  if (data.clientReference !== reference || typeof data.id !== "string" || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(data.id) || amount?.currency !== "NAD" || !Number.isSafeInteger(amount.minor) || !Number.isSafeInteger(data.remainingAmount)) return { verdict: "fail", reason: "Receipt reference, transaction ID, NAD currency or amount is invalid." };
  if (expectedMinor !== undefined && amount.minor !== expectedMinor) return { verdict: "fail", reason: "Voucher value does not match this case's NAD value." };
  if (test.state && data.status !== test.state) return { verdict: "blocked", reason: `This case needs a ${test.state} fixture; the provider returned ${String(data.status)}.` };
  if (test.id.startsWith("TC-VS-") && (!data.productName || typeof data.productName !== "string")) return { verdict: "review", reason: "The workbook expects a product description; it is missing from the provider response." };
  if (test.operation === "redeem" && data.remainingAmount !== 0) return { verdict: "fail", reason: "Full redemption did not leave a zero balance." };
  if (test.state === "Active" && (data.remainingAmount !== amount.minor || typeof data.expiryDate !== "string" || Date.parse(data.expiryDate) <= Date.now() || !Number.isFinite(Date.parse(String(data.expiryDate))))) return { verdict: "fail", reason: "Active voucher has an invalid balance or expiry." };
  return { verdict: test.review ? "review" : "pass", reason: test.review || "Expected provider response verified." };
}
