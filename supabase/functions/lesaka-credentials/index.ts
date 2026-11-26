import { createClient } from "npm:@supabase/supabase-js@2.39.3";
import { decryptLesakaCredentials, encryptLesakaCredentials } from "../_shared/lesaka-credential-storage.ts";
import { LesakaError, lesakaRequest, voucherPin } from "../_shared/lesaka-4all.ts";
import { merchantLesakaEnv } from "../_shared/lesaka-integration-mode.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const admin = createClient(supabaseUrl, serviceRoleKey);
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const merchantId = typeof body.merchant_id === "string" ? body.merchant_id : "";
    if (!merchantId) return json({ error: "Merchant is required" }, 400);
    const authorization = req.headers.get("Authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "");
    const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: identity, error: authError } = await caller.auth.getUser(token);
    if (authError || !identity.user) return json({ error: "Sign in to manage Lesaka credentials" }, 401);
    const { data: allowed, error: permissionError } = await caller.rpc("merchant_portal_allowed", { p_merchant_id: merchantId, p_permission: "api" });
    if (permissionError || allowed !== true) return json({ error: "You do not have permission to manage this merchant's API settings" }, 403);
    const enrolled = await admin.from("lesaka_integration_modes").upsert({merchant_id:merchantId,environment:"staging"},{onConflict:"merchant_id",ignoreDuplicates:true});
    if(enrolled.error) throw enrolled.error;
    const mode = await merchantLesakaEnv(admin,merchantId,key=>Deno.env.get(key));
    const environment=mode.environment;
    if (body.action !== "status" && body.action !== "lookup_live_voucher_values" && body.environment !== environment) return json({ error: "Lesaka setup has changed. Reload this page before saving." }, 409);

    if (body.action === "lookup_live_voucher_values") {
      const rawPins = Array.isArray(body.pins) ? body.pins : [];
      if (rawPins.length < 1 || rawPins.length > 10) return json({ error: "Enter between 1 and 10 voucher PINs." }, 400);
      const referenceModes = ["uuid", "missing", "numeric8", "alphabetic8", "mixed8", "paysme_reference"] as const;
      const referenceMode = typeof body.client_reference_mode === "string" && referenceModes.includes(body.client_reference_mode as typeof referenceModes[number])
        ? body.client_reference_mode as typeof referenceModes[number]
        : "uuid";
      if (referenceMode !== "uuid" && rawPins.length !== 1) {
        return json({ error: "Run one voucher PIN at a time for a ClientReference trial." }, 400);
      }
      const liveRecord = await admin.from("lesaka_merchant_credentials")
        .select("encrypted_credentials, store_id").eq("merchant_id", merchantId).eq("environment", "production").maybeSingle();
      if (liveRecord.error) throw liveRecord.error;
      if (!liveRecord.data) return json({ error: "Save this merchant's live Lesaka credentials in API & integration first." }, 409);
      const credentials = await decryptLesakaCredentials(liveRecord.data.encrypted_credentials, merchantId, "production", key => Deno.env.get(key));
      const pins = rawPins.map((value: unknown) => voucherPin(value));
      const config = {
        environment: "production" as const,
        baseUrl: "https://bridge.lesaka.tech/virtual-products",
        username: credentials.api_username,
        password: credentials.api_password,
        fingerprintSecret: "",
      };
      const results = [];
      for (const pin of pins) {
        const randomFrom = (alphabet: string, length: number) => {
          const bytes = crypto.getRandomValues(new Uint8Array(length));
          return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join("");
        };
        const clientReference = referenceMode === "uuid" ? crypto.randomUUID()
          : referenceMode === "missing" ? undefined
          : referenceMode === "numeric8" ? randomFrom("0123456789", 8)
          : referenceMode === "alphabetic8" ? randomFrom("ABCDEFGHIJKLMNOPQRSTUVWXYZ", 8)
          : referenceMode === "mixed8" ? randomFrom("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", 8)
          : "lesaka.paysme-namibia";
        const requestBody = {
          pin,
          ...(clientReference !== undefined ? { clientReference } : {}),
          requestTime: new Date().toISOString(),
          ...(liveRecord.data.store_id ? { storeId: liveRecord.data.store_id } : {}),
        };
        let providerHttpStatus: number | null = null;
        const captureStatus: typeof fetch = async (input, init) => {
          const response = await fetch(input, init);
          providerHttpStatus = response.status;
          return response;
        };
        try {
          const response = await lesakaRequest(config, "status", requestBody as unknown as Parameters<typeof lesakaRequest>[2], captureStatus) as Record<string, unknown>;
          const total = response?.totalAmount as Record<string, unknown> | undefined;
          const currency = typeof total?.currency === "string" ? total.currency : "";
          const totalMinor = Number(total?.minor);
          const remainingMinor = Number(response?.remainingAmount);
          if (!Number.isSafeInteger(totalMinor) || !Number.isSafeInteger(remainingMinor) || !currency) {
            throw new LesakaError("Lesaka returned an incomplete voucher balance.", 502, "lesaka_incomplete_status");
          }
          results.push({
            pin_last4: pin.slice(-4),
            client_reference: clientReference ?? null,
            provider_http_status: providerHttpStatus,
            trace_id: typeof response?.traceId === "string" ? response.traceId : null,
            status: typeof response?.status === "string" ? response.status : "Unknown",
            currency,
            total_minor: totalMinor,
            remaining_minor: remainingMinor,
            product_name: typeof response?.productName === "string" ? response.productName : null,
            expiry_date: typeof response?.expiryDate === "string" ? response.expiryDate : null,
          });
        } catch (error) {
          results.push({
            pin_last4: pin.slice(-4),
            client_reference: clientReference ?? null,
            provider_http_status: providerHttpStatus,
            error_code: error instanceof LesakaError ? error.code : null,
            trace_id: error instanceof LesakaError ? error.traceId ?? null : null,
            error: error instanceof LesakaError ? error.message : "Could not check this voucher. Please try again or contact Lesaka.",
          });
        }
      }
      return json({ ok: true, read_only: true, results });
    }

    if (body.action === "set_environment") {
      if(!["staging","production"].includes(body.target_environment)||body.confirmed!==true)return json({error:"Confirm the Lesaka environment change first."},400);
      const changed=await admin.rpc("set_lesaka_environment",{p_merchant:merchantId,p_environment:body.target_environment,p_reference:typeof body.approval_reference==="string"?body.approval_reference.trim():""});
      if(changed.error)return json({error:"Live activation requires saved live credentials and this merchant's UAT or recorded production approval. Resolve active or uncertain voucher payments before switching."},409);
      return json({ok:true,reload:true});
    } else if (body.action === "save" || body.action === "save_live") {
      const username = typeof body.username === "string" ? body.username.trim() : "";
      const password = typeof body.password === "string" ? body.password : "";
      const storeId = typeof body.store_id === "string" ? body.store_id.trim() : "";
      if (!username || username.length > 512 || username.includes(":") || !password || password.length > 4096 || storeId.length > 128) {
        return json({ error: "Enter a valid Lesaka username and password. Store ID is optional." }, 400);
      }
      const target=body.action==="save_live"?"production":environment;
      const encrypted = await encryptLesakaCredentials({ api_username: username, api_password: password }, merchantId, target, key => Deno.env.get(key));
      const { error } = await admin.rpc("save_lesaka_merchant_credentials", {
        p_merchant_id: merchantId, p_environment: target, p_credentials: encrypted, p_store_id: storeId || null,
      });
      if (error) {
        // Validation/DB diagnostics may include submitted values. Never log or
        // return them. SQL receives ciphertext only.
        const message = error.message?.includes("Resolve pending Lesaka")
          ? "Resolve pending Lesaka voucher payments before replacing credentials."
          : "Could not save Lesaka credentials. Please try again or contact support.";
        return json({ error: message }, 409);
      }
    } else if (body.action === "set_enabled") {
      if (typeof body.enabled !== "boolean") return json({ error: "enabled must be true or false" }, 400);
      const { data: saved, error: savedError } = await admin.from("lesaka_merchant_credentials")
        .select("credential_version").eq("merchant_id", merchantId).eq("environment", environment).maybeSingle();
      if (savedError) throw savedError;
      if (!saved) return json({ error: "Save the Lesaka username and password first" }, 409);
      const { error } = await admin.from("merchant_payment_facilitators").update({ enabled: body.enabled })
        .eq("merchant_id", merchantId).eq("provider_key", "kazang");
      if (error) throw error;
    } else if (body.action !== "status") return json({ error: "Unknown action" }, 400);

    // Readiness only: no endpoint ever returns the saved username or password.
    const { data: record, error: statusError } = await admin.from("lesaka_merchant_credentials")
      .select("credential_version, store_id, updated_at").eq("merchant_id", merchantId).eq("environment", environment).maybeSingle();
    const { data: facilitator, error: facilitatorError } = await admin.from("merchant_payment_facilitators")
      .select("enabled").eq("merchant_id", merchantId).eq("provider_key", "kazang").maybeSingle();
    if (statusError || facilitatorError) throw statusError || facilitatorError;
    const live=await admin.from("lesaka_merchant_credentials").select("credential_version").eq("merchant_id",merchantId).eq("environment","production").maybeSingle();
    if(live.error)throw live.error;
    let completed=mode.uatCompleted;
    if(!completed){const c=await admin.from("lesaka_uat_campaigns").select("id").eq("merchant_id",merchantId).order("created_at",{ascending:false}).limit(1).maybeSingle();if(c.error)throw c.error;if(c.data?.id){const count=await admin.rpc("lesaka_passed_workbook_cases",{p_campaign:c.data.id});if(count.error)throw count.error;completed=count.data===51;}}
    return json({ ok: true, environment, configured: Boolean(record), store_id: record?.store_id || "", updated_at: record?.updated_at || null, enabled: facilitator?.enabled === true,live_configured:Boolean(live.data),live_ready:completed&&Boolean(live.data),approval_reference:mode.approvalReference });
  } catch (error) {
    if (error instanceof LesakaError) return json({ error: error.message, code: error.code }, error.status);
    return json({ error: "Lesaka settings are unavailable. Please try again or contact support." }, 500);
  }
});
