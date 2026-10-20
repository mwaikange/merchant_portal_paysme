import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import { amountMinor, lesakaConfig, lesakaPlatformConfig, lesakaRequest, pinFingerprint, verifyVoucher, voucherPin } from "../supabase/functions/_shared/lesaka-4all.ts";
import { encryptLesakaCredentials, decryptLesakaCredentials } from "../supabase/functions/_shared/lesaka-credential-storage.ts";

const pin = "0123456789012345";
const reference = "c2407830-86cf-417b-88e8-5a4611533780";
const response = (ref = reference, redeemed = false, extra = {}) => ({
  id: "019adeae-2413-71fe-bd9a-31f5b5d334f7", clientReference: ref,
  totalAmount: { currency: "NAD", minor: 5000 }, remainingAmount: redeemed ? 0 : 5000,
  status: "Active", expiryDate: "2099-01-01T00:00:00Z", ...extra,
});
const credentials = {
  LESAKA_4ALL_ENABLED: "true", LESAKA_4ALL_ENVIRONMENT: "production", LESAKA_4ALL_UAT_APPROVED: "true",
  LESAKA_4ALL_FINGERPRINT_SECRET: "a-secret-with-at-least-32-characters",
  LESAKA_CREDENTIALS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
};
const merchantCredentials = { api_username: "partner", api_password: "private" };
const productionEncrypted = await encryptLesakaCredentials(merchantCredentials, "merchant", "production", name => credentials[name]);
const stagingEncrypted = await encryptLesakaCredentials({ api_username: "stage-partner", api_password: "stage-private" }, "merchant", "staging", name => credentials[name]);

test("configuration fails closed without credentials and production UAT sign-off", () => {
  assert.equal(lesakaConfig(() => undefined), null);
  for (const key of Object.keys(credentials)) {
    assert.equal(lesakaConfig(name => name === key ? undefined : credentials[name], merchantCredentials), null, key);
  }
  assert.equal(lesakaConfig(name => credentials[name]), null, "No shared platform credential fallback");
  const config = lesakaConfig(name => credentials[name], merchantCredentials);
  assert.equal(config.baseUrl, "https://bridge.lesaka.tech/virtual-products");
  assert.equal(lesakaPlatformConfig(name => ({ ...credentials, LESAKA_4ALL_ENVIRONMENT: "staging" })[name]).baseUrl, "https://staging.bridge.lesaka.tech/virtual-products");
});

test("PIN validation preserves leading zeros and rejects malformed input", () => {
  assert.equal(voucherPin("0123 4567-8901 2345"), pin);
  for (const invalid of ["12345", "a0123456789012345", 1234567890123456, "0123456789012345!"]) assert.throws(() => voucherPin(invalid));
  assert.equal(amountMinor("50.00"), 5000);
  for (const invalid of [0, -1, NaN, "bad", 1.001, Infinity]) assert.throws(() => amountMinor(invalid));
});

test("only active unexpired NAD vouchers matching the exact full balance pass", () => {
  verifyVoucher(response(), reference, 5000);
  for (const status of ["Created", "Reserved", "Consumed", "Cancelled", "Reversed", "Expired"]) assert.throws(() => verifyVoucher(response(reference, false, { status }), reference, 5000));
  for (const extra of [
    { totalAmount: { currency: "ZAR", minor: 5000 } }, { remainingAmount: 4000 },
    { totalAmount: { currency: "NAD", minor: 6000 } }, { clientReference: "wrong" },
    { expiryDate: "2000-01-01T00:00:00Z" }, { expiryDate: "bad" }, { id: "" },
  ]) assert.throws(() => verifyVoucher(response(reference, false, extra), reference, 5000));
  verifyVoucher(response(reference, true), reference, 5000, true);
  assert.throws(() => verifyVoucher(response(), reference, 5000, true));
});

test("fingerprint is stable, keyed, and does not store the voucher PIN", async () => {
  const first = await pinFingerprint(pin, credentials.LESAKA_4ALL_FINGERPRINT_SECRET);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first, await pinFingerprint(pin, credentials.LESAKA_4ALL_FINGERPRINT_SECRET));
  assert.notEqual(first, await pinFingerprint(pin, "different-secret"));
  assert.ok(!first.includes(pin));
});

test("gateway uses Basic auth and documented bodies; errors never expose PINs or secrets", async () => {
  const config = lesakaConfig(name => credentials[name], merchantCredentials);
  let captured;
  await lesakaRequest(config, "redeem", { pin, clientReference: reference, requestTime: "2026-10-20T10:00:00Z" }, async (url, init) => {
    captured = { url, init };
    return Response.json(response(reference, true));
  });
  assert.equal(captured.url, "https://bridge.lesaka.tech/virtual-products/api/v2/voucher/redeem");
  assert.equal(captured.init.headers.Authorization, `Basic ${btoa("partner:private")}`);
  assert.equal(captured.init.redirect, "error");
  assert.deepEqual(Object.keys(JSON.parse(captured.init.body)), ["pin", "clientReference", "requestTime"]);
  for (const code of [5001, 5003, 5005, 5007, 5008, 5100]) {
    await assert.rejects(lesakaRequest(config, "redeem", { pin, clientReference: reference, requestTime: "now" }, async () => Response.json({ errorCode: code, detail: pin, traceId: "trace-123" }, { status: 409 })), error => {
      assert.equal(error.code, `lesaka_${code}`);
      assert.equal(error.traceId, "trace-123");
      assert.ok(!error.message.includes(pin));
      return true;
    });
  }
  await assert.rejects(lesakaRequest(config, "redeem", { pin, clientReference: reference, requestTime: "now" }, async () => { throw new Error(pin); }), { code: "lesaka_outcome_unknown" });
});

// Execute the actual Edge Function with in-memory storage and mocked network.
// No request leaves the test process and no voucher is redeemed externally.
let environment;
let handler;
let database;
globalThis.Deno = { env: { get: key => environment?.[key] }, serve: fn => { handler = fn; } };
let source = readFileSync(new URL("../supabase/functions/mobiwand-payment/index.ts", import.meta.url), "utf8")
  .replace('import { createClient } from "npm:@supabase/supabase-js@2.39.3";', 'const createClient = () => ({ from: (...args) => globalThis.__lesakaDb.from(...args) });')
  .replace('"../_shared/lesaka-4all.ts"', JSON.stringify(new URL("../supabase/functions/_shared/lesaka-4all.ts", import.meta.url).href))
  .replace('"../_shared/lesaka-credential-storage.ts"', JSON.stringify(new URL("../supabase/functions/_shared/lesaka-credential-storage.ts", import.meta.url).href));
environment = { SUPABASE_URL: "https://example.test", SUPABASE_SERVICE_ROLE_KEY: "server-secret", ...credentials };
await import(`data:text/javascript;base64,${Buffer.from(transformSync(source, { loader: "ts", format: "esm" }).code).toString("base64")}`);

function setup() {
  environment = { SUPABASE_URL: "https://example.test", SUPABASE_SERVICE_ROLE_KEY: "server-secret", ...credentials };
  database = {
    merchants: [{ merchant_id: "merchant", business_name: "Shop", api_key: "sdk-key" }],
    transactions: [{ transaction_id: "transaction", merchant_id: "merchant", generated_code: "1234-5678-9012", amount: 50, status: "pending", finalized: false }],
    merchant_payment_facilitators: [{ merchant_id: "merchant", provider_key: "kazang", facilitator_id: "facilitator", provider_merchant_code: "store-code", enabled: true, status: "active" }],
    lesaka_voucher_attempts: [],
    lesaka_merchant_credentials: [
      { merchant_id: "merchant", environment: "production", encrypted_credentials: productionEncrypted, store_id: null, credential_version: reference },
      { merchant_id: "merchant", environment: "staging", encrypted_credentials: stagingEncrypted, store_id: null, credential_version: reference },
    ],
  };
  globalThis.__lesakaDb = { from(table) {
    let operation = "select";
    let values;
    const filters = [];
    const query = {
      select() { return query; }, eq(key, value) { filters.push(row => row[key] === value); return query; },
      in(key, values) { filters.push(row => values.includes(row[key])); return query; },
      update(value) { operation = "update"; values = value; return query; },
      insert(value) { operation = "insert"; values = value; return query; },
      single() { return run(); }, maybeSingle() { return run(); }, then(resolve, reject) { return run().then(resolve, reject); },
    };
    async function run() {
      let rows = database[table].filter(row => filters.every(filter => filter(row)));
      if (operation === "insert") {
        if (database[table].some(row => row.environment === values.environment && (row.transaction_id === values.transaction_id || row.voucher_fingerprint === values.voucher_fingerprint))) return { data: null, error: { code: "23505" } };
        const inserted = { attempt_id: crypto.randomUUID(), request_time: new Date().toISOString(), status: "redeeming", ...values };
        database[table].push(inserted); rows = [inserted];
      }
      if (operation === "update") rows.forEach(row => Object.assign(row, values));
      return { data: rows[0] ? structuredClone(rows[0]) : null, error: null };
    }
    return query;
  } };
}

const originalFetch = globalThis.fetch;
async function checkout(body = {}, server = false) {
  const result = await handler(new Request("https://example.test/functions/v1/mobiwand-payment", {
    method: "POST", headers: { Authorization: server ? "Bearer server-secret" : "Bearer anonymous", "Content-Type": "application/json" },
    body: JSON.stringify({ action: "confirm_provider_code", provider: "kazang", merchant_id: "merchant", api_key: "sdk-key", generated_code: "1234-5678-9012", confirmation_code: pin, ...body }),
  }));
  return { status: result.status, body: await result.json() };
}
function mockGateway(redeem) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body, authorization: init.headers.Authorization });
    if (url.includes("checkout-eligibility")) return Response.json({ billing: { locked: false }, plan: { other_payment_types_enabled: true }, methods: { kazang: { enabled: environment.LESAKA_4ALL_ENVIRONMENT === "production", credentials_present: true, merchant_enabled: true, status: "active" } } });
    if (url.endsWith("/status")) return Response.json(response(body.clientReference));
    if (url.endsWith("/redeem")) return redeem ? redeem(body) : Response.json(response(body.clientReference, true));
    throw new Error("Unexpected network request");
  };
  return calls;
}

test("missing credentials make no provider calls and cannot mark paid", async () => {
  setup(); database.lesaka_merchant_credentials = [];
  const calls = mockGateway();
  assert.equal((await checkout()).status, 503);
  assert.equal(calls.length, 0);
  assert.equal(database.transactions[0].status, "pending");
});

test("production payment verifies status, redeems, finalizes, and replays without another call", async () => {
  setup(); const calls = mockGateway();
  assert.equal((await checkout()).body.status, "paid");
  assert.equal(database.transactions[0].payment_method, "kazang");
  assert.equal(database.transactions[0].amount_paid, 50);
  const before = calls.length;
  assert.equal((await checkout()).body.status, "paid");
  assert.equal(calls.length, before);
  assert.ok(!JSON.stringify(database).includes(pin));
});

test("timeout retries persist the exact redemption reference and skip a second status query", async () => {
  setup(); let tries = 0;
  const calls = mockGateway(body => { if (++tries === 1) throw new Error("timeout"); return Response.json(response(body.clientReference, true)); });
  assert.equal((await checkout()).status, 502);
  assert.equal(database.transactions[0].status, "pending");
  assert.equal((await checkout({ confirmation_code: "1123456789012345" })).status, 409);
  assert.equal((await checkout()).body.status, "paid");
  const redemptions = calls.filter(call => call.url.endsWith("/redeem"));
  assert.deepEqual(redemptions[0].body, redemptions[1].body);
  assert.equal(calls.filter(call => call.url.endsWith("/status")).length, 1);
});

test("staging requires server authorization and cannot settle a real transaction", async () => {
  setup(); environment.LESAKA_4ALL_ENVIRONMENT = "staging";
  const calls = mockGateway();
  assert.equal((await checkout()).status, 403);
  assert.equal(calls.length, 0);
  assert.equal((await checkout({}, true)).body.status, "tested");
  assert.equal(database.transactions[0].status, "pending");
  assert.equal(database.transactions[0].finalized, false);
  assert.equal(database.lesaka_voucher_attempts[0].status, "tested");
});

test("wrong merchant credentials and restricted checkout do not reach the gateway", async () => {
  setup(); const calls = mockGateway();
  assert.equal((await checkout({ api_key: "wrong" })).status, 401);
  database.transactions[0].allowed_payment_methods = ["card"];
  assert.equal((await checkout()).status, 403);
  assert.equal(calls.length, 0);
});

test("a competing payment after redemption requires reconciliation", async () => {
  setup(); mockGateway(body => {
    Object.assign(database.transactions[0], { status: "paid", finalized: true, payment_method: "card" });
    return Response.json(response(body.clientReference, true));
  });
  const result = await checkout();
  assert.equal(result.status, 409);
  assert.equal(result.body.code, "lesaka_reconciliation_required");
  assert.equal(database.transactions[0].payment_method, "card");
  assert.equal(database.lesaka_voucher_attempts[0].status, "reconciliation_required");
});

test("currency/value mismatch stops before redemption and leaves checkout unpaid", async () => {
  for (const extra of [{ totalAmount: { currency: "ZAR", minor: 5000 } }, { remainingAmount: 6000 }]) {
    setup(); let redeemed = false;
    mockGateway(); const transport = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      if (url.endsWith("/status")) return Response.json(response(JSON.parse(init.body).clientReference, false, extra));
      if (url.endsWith("/redeem")) redeemed = true;
      return transport(url, init);
    };
    assert.equal((await checkout()).status, 409);
    assert.equal(redeemed, false);
    assert.equal(database.transactions[0].status, "pending");
    assert.equal(database.lesaka_voucher_attempts.length, 0);
  }
});

test("unverified redemption receipt never finalizes a checkout", async () => {
  setup(); mockGateway(body => Response.json(response(body.clientReference, true, { remainingAmount: 1 })));
  assert.equal((await checkout()).status, 409);
  assert.equal(database.transactions[0].status, "pending");
  assert.equal(database.lesaka_voucher_attempts[0].status, "uncertain");
});

test("simultaneous requests reuse one durable redemption reference", async () => {
  setup(); const calls = mockGateway();
  const results = await Promise.all([checkout(), checkout()]);
  assert.ok(results.some(result => result.body.status === "paid"));
  assert.equal(database.lesaka_voucher_attempts.length, 1);
  const references = calls.filter(call => call.url.endsWith("/redeem")).map(call => call.body.clientReference);
  assert.equal(new Set(references).size, 1);
  assert.equal(references[0], database.lesaka_voucher_attempts[0].attempt_id);
  assert.equal(database.transactions[0].status, "paid");
});

test("Kazang cannot use MobiWand initiation or callbacks", async () => {
  setup(); const calls = mockGateway();
  assert.equal((await checkout({ action: "initiate" })).status, 400);
  database.mobiwand_payment_attempts = [{ attempt_id: "old", provider_key: "kazang" }];
  const result = await handler(new Request("https://example.test/functions/v1/mobiwand-payment?attempt_id=old&channel=notify&status=0000"));
  assert.equal(result.status, 400);
  assert.equal(calls.length, 0);
});

test("database stores ciphertext bound to the merchant and environment", async () => {
  const env = key => credentials[key];
  const first = await encryptLesakaCredentials(merchantCredentials, "merchant", "production", env);
  const second = await encryptLesakaCredentials(merchantCredentials, "merchant", "production", env);
  assert.notEqual(first.ciphertext, second.ciphertext);
  assert.notEqual(first.iv, second.iv);
  assert.ok(!JSON.stringify(first).includes("partner"));
  assert.ok(!JSON.stringify(first).includes("private"));
  assert.deepEqual(await decryptLesakaCredentials(first, "merchant", "production", env), merchantCredentials);
  await assert.rejects(decryptLesakaCredentials(first, "another-merchant", "production", env), { code: "lesaka_credentials_unavailable" });
  await assert.rejects(decryptLesakaCredentials(first, "merchant", "staging", env), { code: "lesaka_credentials_unavailable" });
  await assert.rejects(decryptLesakaCredentials({ ...first, ciphertext: "corrupted" }, "merchant", "production", env));
  await assert.rejects(encryptLesakaCredentials(merchantCredentials, "merchant", "production", () => undefined), { code: "lesaka_storage_not_configured" });
});

test("each merchant redeems using its own credentials with no store ID required", async () => {
  setup(); const calls = mockGateway();
  assert.equal((await checkout()).body.status, "paid");
  const firstAuth = calls.find(call => call.url.endsWith("/redeem")).authorization;
  database.merchants.push({ merchant_id: "merchant-b", api_key: "key-b", business_name: "Shop B" });
  database.transactions.push({ transaction_id: "transaction-b", merchant_id: "merchant-b", generated_code: "code-b", amount: 50, status: "pending", finalized: false });
  database.merchant_payment_facilitators.push({ merchant_id: "merchant-b", provider_key: "kazang", facilitator_id: "facilitator", enabled: true, status: "active", provider_merchant_code: "" });
  database.lesaka_merchant_credentials.push({ merchant_id: "merchant-b", environment: "production", encrypted_credentials: await encryptLesakaCredentials({ api_username: "partner-b", api_password: "secret-b" }, "merchant-b", "production", key => environment[key]), store_id: null, credential_version: reference });
  assert.equal((await checkout({ merchant_id: "merchant-b", api_key: "key-b", generated_code: "code-b", confirmation_code: "1123456789012345" })).body.status, "paid");
  const secondAuth = calls.filter(call => call.url.endsWith("/redeem"))[1].authorization;
  assert.equal(firstAuth, `Basic ${btoa("partner:private")}`);
  assert.equal(secondAuth, `Basic ${btoa("partner-b:secret-b")}`);
  for (const call of calls.filter(call => /\/(status|redeem)$/.test(call.url))) assert.equal(call.body.storeId, undefined);
});

test("hosted checkout uses the same merchant credential lookup without exposing secrets", async () => {
  setup(); const calls = mockGateway();
  const result = await checkout({ hosted_payment: true, api_key: undefined });
  assert.equal(result.body.status, "paid");
  assert.equal(calls.find(call => call.url.endsWith("/redeem")).authorization, `Basic ${btoa("partner:private")}`);
  assert.ok(!JSON.stringify(result.body).includes("partner"));
  assert.ok(!JSON.stringify(result.body).includes("private"));
});

test("credentials changed during an uncertain attempt never retry against a different account", async () => {
  setup(); const calls = mockGateway(() => { throw new Error("timeout"); });
  assert.equal((await checkout()).status, 502);
  database.lesaka_merchant_credentials[0].credential_version = crypto.randomUUID();
  const result = await checkout();
  assert.equal(result.body.code, "lesaka_account_changed");
  assert.equal(calls.filter(call => call.url.endsWith("/redeem")).length, 1);
});

test.after(() => { globalThis.fetch = originalFetch; delete globalThis.Deno; delete globalThis.__lesakaDb; });
