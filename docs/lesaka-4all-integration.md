# Lesaka 4All merchant integration

Prepared 20 October 2026 against Lesaka API **v2.1.0**, read in the Codex browser:

- [OpenAPI specification](https://lesaka-adp-4allvoucher.apidocumentation.com/lesaka-4-all-voucher-api)
- [Integration guide](https://lesaka-adp-4allvoucher.apidocumentation.com/guide/integration-guide)
- [Error codes](https://lesaka-adp-4allvoucher.apidocumentation.com/guide/error-codes)
- [Required UAT cases](https://lesaka-adp-4allvoucher.apidocumentation.com/guide/uat-test-cases)

## Current readiness

Code is prepared locally. Staging credentials, test vouchers, production credentials and UAT sign-off have **not** been received. No provider transactions have been executed and this change has not been deployed. Live checkout remains unavailable by default.

The provider currency is **NAD**, as clarified by the project owner. Customer amounts display as N$ and the SDK continues using `amount_nad`. No currency field is invented in the request: Lesaka's request schemas do not contain one. Currency is verified in `totalAmount.currency` in both responses.

## Server configuration

Apply `20261020120000_lesaka_4all_attempts.sql` and `20261020130000_lesaka_merchant_credentials.sql`, then deploy `lesaka-credentials`, `mobiwand-payment`, and `checkout-eligibility` together with the shared modules and updated SDK/portal. Both new migrations are local and have not been applied by this task. `transactions.transaction_id` is varchar, so the attempts migration uses the matching type.

Merchants enter their **own live API username and password** under **API > Facilitator Merchant Codes > Lesaka**. Both fields are required. Store ID is optional and is used only as Lesaka metadata. Existing Kazang merchant codes are not credentials and do not enable payments. The existing facilitator visibility switch remains shared by SDK and hosted checkout.

PaySME performs the shared Lesaka integration UAT once. Merchants do not have a separate environment selector or mandatory per-merchant UAT workflow. During platform staging, the same form explicitly identifies the credentials as integration test credentials. After platform sign-off and production activation, it accepts live credentials. The server chooses the environment; stale forms cannot write into a different environment.

The `lesaka-credentials` endpoint validates the user's Supabase session and `merchant_portal_allowed(..., 'api')` permission, including organisation membership and existing MFA/network rules. It encrypts both values with **AES-256-GCM before the database write**. Ciphertext is authenticated against the merchant ID and environment, with a fresh random nonce per save. `lesaka_merchant_credentials` has RLS enabled and no anon/authenticated grants or policies. Only backend service-role access is allowed. The settings endpoint returns configured state and optional Store ID; it never returns usernames, passwords, or ciphertext. Form fields clear after saving and are not stored in local/session storage.

Database reads and backups contain ciphertext. Someone with both backend access and the server encryption key can decrypt credentials; encryption does not eliminate that privileged capability. Keep the encryption key outside the database and browser build.

| Secret | Value / use |
| --- | --- |
| `LESAKA_4ALL_ENABLED` | Leave absent or `false` until ready to test. Requires exact `true` to enable. |
| `LESAKA_4ALL_ENVIRONMENT` | Explicit `staging` or `production`; there is no live fallback. |
| `LESAKA_CREDENTIALS_ENCRYPTION_KEY` | A cryptographically random 32-byte key, base64 encoded. Provision as a Supabase server secret before saving credentials. Back it up securely; retain it while encrypted records exist. Never put it in SQL, source control, `VITE_` variables, or the browser. |
| `LESAKA_4ALL_FINGERPRINT_SECRET` | Random server secret of at least 32 characters. Keep stable while attempts exist; required for matching PINs on retries without storing them. |
| `LESAKA_4ALL_UAT_APPROVED` | Leave absent/false until sign-off. Production requires exact `true`. |

There is **no shared PaySME username/password fallback**. The payment handler loads and decrypts only the credentials matching the transaction's merchant ID and selected environment. Credentials in another merchant's row or another environment cannot decrypt. API hosts are fixed to the documented staging and production hosts. HTTP Basic credentials are base64 encoded, sent only over HTTPS, and never followed across redirects. `storeId` is optional metadata, not the merchant identity or settlement instruction.

Saving credentials and registering the Lesaka facilitator happens in one server-only SQL transaction. Replacing credentials is blocked while unresolved attempts exist. Attempts also record a credential version; a changed account never silently receives a retry belonging to the previous account. Key rotation requires re-encrypting existing records with the old key before changing the key used by production; no automatic key rotation is implemented here.

## Checkout and retry contract

The facilitator key stays `kazang` for backward compatibility; user-facing names in the portal, checkout, SDK and transaction reports are **Lesaka**. SDK v1.12.0 and the hosted modal both POST to `mobiwand-payment`:

```json
{
  "action": "confirm_provider_code",
  "provider": "kazang",
  "merchant_id": "merchant UUID",
  "api_key": "existing PaySME SDK key",
  "generated_code": "existing PaySME checkout code",
  "confirmation_code": "16-digit voucher PIN"
}
```

The hosted modal uses the existing hosted-payment contract instead of the SDK key. Neither amount, provider currency nor redemption reference is trusted from the browser. Restricted vendor obligations are not enabled for voucher payments in this change.

1. Authenticate merchant, load the transaction and that merchant's encrypted credentials for the current environment, check pending status and allowed methods, then recheck subscription, billing and merchant enablement. Provider credentials are never accepted from checkout clients or returned to them.
2. POST `/api/v2/voucher/status` with a fresh UUID `clientReference`, RFC3339 `requestTime`, PIN and optional store ID. Require `Active`, future expiry, `NAD`, and exact checkout value in integer minor units. All other lifecycle states are rejected, including the `Created` state shown in the API's generic example.
3. Persist a unique redemption UUID and HMAC fingerprint in the server-only attempts table **before** calling redeem. Separate uniqueness constraints prevent using the voucher on another checkout or creating a second reference for the same checkout/environment. No PIN or raw provider response is persisted.
4. POST `/api/v2/voucher/redeem` using that UUID. Only full redemption is documented; no invented partial amount field is sent. Require the echoed reference, provider transaction UUID, correct currency/value and zero remaining balance.
5. Staging records `tested` and leaves the PaySME transaction pending. Production uses the existing conditional settlement path, SMS and merchant webhook. It emits `paid` only when the stored transaction confirms matching settlement. Competing settlements require reconciliation.

On a timeout or uncertain provider result, keep the original reference. The customer must retry the **same voucher on the same checkout**. The server skips a second status precheck because an earlier redemption may already have consumed the voucher, and repeats the original redemption request. Do not delete or reset attempts to create new references. `5003` duplicate-reference conflicts require review, rather than rotating the reference. No automatic retry is performed for `5005` validation failures. Safe error codes and `traceId` are retained for support; raw error details may contain the PIN and are discarded.

The SDK emits `paysme:payment-success` / `on_payment_success` only for verified `paid` results. `on_success` retains its existing code-generation meaning. Old MobiWand initiation and callbacks are rejected for Kazang.

## Testing when credentials arrive

Run local mocked checks with `node --test tests/lesaka-payment.test.mjs tests/lesaka-credentials.test.mjs`. These tests make no external requests. They cover encrypted storage, permission enforcement, no credential read-back, two-merchant isolation, SDK/hosted routing, retries and payment verification. They do not substitute for Lesaka UAT.

Use a dedicated PaySME integration test merchant and pending test checkout. Provision the encryption and fingerprint secrets, select `staging`, save that account's test username/password in the portal, and set `LESAKA_4ALL_ENABLED=true`. Public checkout eligibility deliberately stays disabled in staging. Authorized UAT calls must use the server service-role Authorization header from a trusted server process; never put that key in a browser. Confirm a successful test returns `status: tested` and does not finalize the checkout or send paid notifications.

Request Active, Consumed, Expired and Cancelled test vouchers and serial numbers from Lesaka. Execute all published TC-STAT, TC-RED and TC-EDGE cases using a secure server test runner. In particular verify status by PIN and serial, missing references, malformed PINs, exact/insufficient/excess voucher balances, currency mismatch, invalid credentials, provider errors, timeouts, duplicate references and simultaneous requests. The shared `lesakaRequest` helper supports status by serial for UAT; customer redemption still requires a PIN. Capture references and trace IDs, never PINs or credentials, for sign-off.

After Lesaka approves the shared integration UAT, select production and set the global UAT approval flag. Each merchant saves their own live credentials; an enabled merchant with both credentials can then use the common payment flow without repeating platform UAT. Production never falls back to staging credentials. Unknown or conflicting outcomes require provider reconciliation; the public documentation exposes no transaction-status-by-reference endpoint for background reconciliation without re-entering the PIN.
