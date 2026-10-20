import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import { decryptLesakaCredentials } from "../supabase/functions/_shared/lesaka-credential-storage.ts";

let handler;
let allowed;
let stored;
let enabled;
let writeError;
let saves;
const environment = { SUPABASE_URL: "https://example.test", SUPABASE_SERVICE_ROLE_KEY: "server-secret", SUPABASE_ANON_KEY: "anon", LESAKA_CREDENTIALS_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64") };
globalThis.Deno = { env: { get: key => environment[key] }, serve: fn => { handler = fn; } };
globalThis.__credentialAdmin = {
  async rpc(name, args) {
    assert.equal(name, "save_lesaka_merchant_credentials");
    if (writeError) return { error: { message: writeError } };
    saves.push(args);
    stored = { encrypted_credentials: args.p_credentials, store_id: args.p_store_id, credential_version: crypto.randomUUID(), updated_at: new Date().toISOString() };
    enabled = true;
    return { error: null };
  },
  from(table) {
    const query = {
      select() { return query; }, eq() { return query; },
      update(values) { enabled = values.enabled; return query; },
      async maybeSingle() { return { data: table === "lesaka_merchant_credentials" ? stored : stored ? { enabled } : null, error: null }; },
      then(resolve, reject) { return Promise.resolve({ error: null }).then(resolve, reject); },
    };
    return query;
  },
};
globalThis.__credentialCaller = {
  auth: { async getUser(token) { return { data: { user: token === "owner-token" ? { id: "owner" } : null }, error: null }; } },
  async rpc(name, args) {
    assert.equal(name, "merchant_portal_allowed");
    assert.equal(args.p_permission, "api");
    return { data: allowed && args.p_merchant_id === "merchant", error: null };
  },
};
let source = readFileSync(new URL("../supabase/functions/lesaka-credentials/index.ts", import.meta.url), "utf8")
  .replace('import { createClient } from "npm:@supabase/supabase-js@2.39.3";', 'const createClient = (_url, key) => key === "server-secret" ? globalThis.__credentialAdmin : globalThis.__credentialCaller;')
  .replace('"../_shared/lesaka-4all.ts"', JSON.stringify(new URL("../supabase/functions/_shared/lesaka-4all.ts", import.meta.url).href))
  .replace('"../_shared/lesaka-credential-storage.ts"', JSON.stringify(new URL("../supabase/functions/_shared/lesaka-credential-storage.ts", import.meta.url).href));
await import(`data:text/javascript;base64,${Buffer.from(transformSync(source, { loader: "ts", format: "esm" }).code).toString("base64")}`);

function reset() { allowed = true; stored = null; enabled = false; writeError = null; saves = []; delete environment.LESAKA_4ALL_ENVIRONMENT; environment.LESAKA_CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64"); }
async function invoke(body = {}, token = "owner-token") {
  const result = await handler(new Request("https://example.test/lesaka-credentials", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "status", merchant_id: "merchant", environment: "production", ...body }) }));
  return { status: result.status, body: await result.json(), cacheControl: result.headers.get("Cache-Control") };
}
const input = { action: "save", username: "demo-user", password: " demo-password ", store_id: "" };

test("credential setup requires a signed-in user with this merchant's API permissions", async () => {
  reset();
  assert.equal((await invoke(input, "anonymous")).status, 401);
  assert.equal((await invoke({ ...input, merchant_id: "another-merchant" })).status, 403);
  allowed = false;
  assert.equal((await invoke(input)).status, 403);
  assert.equal(saves.length, 0);
});

test("both credentials are required; store ID is optional", async () => {
  reset();
  for (const invalid of [{ username: "" }, { password: "" }, { username: "invalid:user" }]) assert.equal((await invoke({ ...input, ...invalid })).status, 400);
  const result = await invoke(input);
  assert.equal(result.status, 200);
  assert.equal(result.body.configured, true);
  assert.equal(result.body.environment, "production");
  assert.equal(result.body.store_id, "");
  assert.equal(result.cacheControl, "no-store");
});

test("SQL receives ciphertext only, and neither save nor status returns credentials", async () => {
  reset(); await invoke(input);
  assert.ok(!("p_username" in saves[0]));
  assert.ok(!("p_password" in saves[0]));
  assert.ok(!JSON.stringify(saves[0]).includes("demo-user"));
  assert.ok(!JSON.stringify(saves[0]).includes("demo-password"));
  assert.deepEqual(await decryptLesakaCredentials(stored.encrypted_credentials, "merchant", "production", key => environment[key]), { api_username: "demo-user", api_password: " demo-password " });
  const status = await invoke();
  assert.equal(status.body.configured, true);
  for (const name of ["username", "password", "api_username", "api_password", "encrypted_credentials"]) assert.equal(status.body[name], undefined);
});

test("client cannot select a different credential environment", async () => {
  reset();
  assert.equal((await invoke({ ...input, environment: "staging" })).status, 409);
  environment.LESAKA_4ALL_ENVIRONMENT = "staging";
  assert.equal((await invoke({ action: "status" })).body.environment, "staging");
  assert.equal((await invoke({ ...input, environment: "staging" })).status, 200);
  assert.equal(saves[0].p_environment, "staging");
});

test("missing encryption key prevents storage, and raw DB failures never leak credentials", async () => {
  reset(); delete environment.LESAKA_CREDENTIALS_ENCRYPTION_KEY;
  assert.equal((await invoke(input)).status, 503);
  assert.equal(saves.length, 0);
  reset(); writeError = "database rejected demo-user and demo-password";
  const result = await invoke(input);
  assert.equal(result.status, 409);
  assert.ok(!JSON.stringify(result.body).includes("demo-user"));
  assert.ok(!JSON.stringify(result.body).includes("demo-password"));
});

test("customer button cannot be enabled without saved credentials", async () => {
  reset();
  assert.equal((await invoke({ action: "set_enabled", enabled: true })).status, 409);
  await invoke(input);
  assert.equal((await invoke({ action: "set_enabled", enabled: false })).body.enabled, false);
  assert.equal((await invoke({ action: "set_enabled", enabled: true })).body.enabled, true);
});

test.after(() => { delete globalThis.Deno; delete globalThis.__credentialAdmin; delete globalThis.__credentialCaller; });
