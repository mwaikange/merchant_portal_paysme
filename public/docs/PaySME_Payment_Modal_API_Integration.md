# PaySME Payment Modal — API Integration Guide

**Version:** 1.10.0 · **Updated:** 3 September 2026
**Audience:** Merchants integrating PaySME payments on web, mobile, or server-side.

---

## 1. Overview

The PaySME Payment Modal is a hosted/embeddable checkout that lets your customers pay using:

1. **PaySME Code** — a short code redeemed at participating Payment Vendors (cash/kiosk/teller).
2. **WayaMe** — merchant-address payment request with bank-app and QR channels.
3. **MTC Maris** — available to approved merchants through the PaySME checkout.
4. **PayPulse** — available to approved merchants through the PaySME checkout.
5. **PayToday** — available to approved merchants through the PaySME checkout.
6. **Card Payment** — processed via **Adumo Online** (Visa / Mastercard).

There are **two ways** to use it:

| Method | When to use |
|---|---|
| **PaySME.js SDK** | Easiest. Drop a `<script>` in your site and call `PaySME.init`, `create`, `pending`, or the opt-in `requestToPay`. |
| **Direct REST API** | Server-to-server processing. It does not authorise replacing the official customer-facing Request-to-Pay button. |

The SDK is the recommended integration. It owns the checkout UI and receives centrally managed PaySME updates without requiring merchants to rebuild their websites.

### 1.1 Choose the SDK behavior explicitly

| SDK method | Behavior | Opens payment modal? |
|---|---|---|
| `PaySME.init(config)` | Default fixed-amount checkout | **Yes** |
| `PaySME.create(config)` | Default dynamic checkout | **Yes**, when `.open()` is called |
| `PaySME.pending(config)` | Opens an already-issued PaySME Code | **Yes**, when `.open()` is called |
| `PaySME.renderRequestToPayButton(config)` | Renders the official branded button, creates a pending transaction, and sends its hosted payment link by SMS | **No** |
| `PaySME.requestToPay(config)` | Underlying programmatic Request-to-Pay method | **No** |

`init` and `create` remain the normal SDK behavior. The SDK does not detect a mobile app and switch modes automatically. SMS-only Request-to-Pay happens only when the developer explicitly selects that route. Customer-facing integrations must render it through `PaySME.renderRequestToPayButton(...)`.

### 1.2 Implementation contract - read this first

An implementation is correct only when all of the following are true:

1. Load `https://www.paysme.site/sdk/v1/paysme.js` once per page or application shell.
2. Use the generated snippet from **Dashboard > API & Integration** as the source of merchant-specific values.
3. Treat `on_success` as **PaySME Code generated**, not as payment received.
4. Treat `on_payment_success` and `paysme:payment-success` as paid only when PaySME has verified a real provider/vendor completion.
5. Never unlock goods, credit an account, fulfil an order, or mark an invoice paid from a modal screen, redirect query string, or generated PaySME Code alone.
6. Verify server-side merchant webhooks before fulfilment. Webhook verification is the authoritative path for unattended fulfilment.
7. Never place Adumo, MTC Maris, PayPulse, PayToday, WayaMe sponsor, Supabase service-role, or webhook-secret credentials in browser code.
8. Current provider testing-result screens do not mark transactions paid and do not fire payment-success callbacks, SMS messages, or merchant webhooks.
9. `requestToPay` success means that PaySME created a pending transaction and accepted its payment-link SMS for delivery. It does **not** mean the invoice was paid.
10. Customer-facing Request-to-Pay integrations must use the SDK-rendered **Create Payment Request** button. Do not replace, recolour, rename, or imitate it.
11. After a successful pending request, the customer notification must read exactly **Request to Pay Sent. Check your SMS.** Do not add payment-completion wording.
12. VAT treatment is merchant-level configuration under **Merchant Portal > Tax Settings**. Integrations send the merchant-entered `amount` only; they must not calculate VAT in browser or app code. PaySME snapshots the configured VAT mode and rate when it creates the transaction.

### 1.3 VAT and amount contract

PaySME supports three explicit merchant tax modes across every paycode route:

| Tax setting | Meaning of integration `amount` | Payment modal |
|---|---|---|
| Do not charge VAT | Final amount | No VAT line |
| Prices include VAT | Final amount, already VAT-inclusive | Shows the included VAT portion; adds nothing |
| Add VAT to prices | Net amount before VAT | Calculates VAT server-side and adds it to the customer total |

The same rule applies to SDK snippets, hosted payment links, direct API requests, Request to Pay, subscription uploads, reusable QR products and QR Baskets. Webhook consumers should use the transaction `net_amount`, `vat_amount`, `gross_amount`, `tax_mode`, and `vat_rate` snapshot fields when available. This prevents later changes to merchant settings from changing the accounting meaning of an existing paycode.

### 1.4 Minimum handoff for a developer or coding agent

Give the implementer these four items:

1. The generated Integration Snippet from the merchant portal.
2. This guide or its downloadable PDF.
3. The page/component where the payment button must appear.
4. The production return URL and server webhook URL, if applicable.

The implementer should not ask the merchant for facilitator credentials. Those are saved by the merchant in the PaySME portal and remain server-side.

---

## 2. Base URLs

| Resource | URL |
|---|---|
| SDK v1.10.0 (stable v1 URL) | `https://www.paysme.site/sdk/v1/paysme.js` |
| Hosted Payment Page | `https://paysme.site/pay/:merchant_id?invoice_id=...&amount=...&product_name=...` |
| API Base | `https://zvoqrqdnuupdefsuiurt.supabase.co/functions/v1` |

### Endpoints

| Endpoint | Purpose |
|---|---|
| `POST /payments` | Create PaySME Code transactions and supported merchant actions |
| `POST /mobile-request-to-pay` | Opt-in SMS-only Request-to-Pay for mobile/app integrations |
| `POST /adumo-card` | Initiate a card payment (returns Adumo JWT + redirect form fields) |
| `POST /checkout-eligibility` | Resolve enabled payment methods for the merchant and transaction |
| `POST /webhooks-payments` | Internal — vendor redemption, Adumo notify, merchant webhook fan-out |
| `GET  /adumo-card?action=redirect-success` | Adumo success return URL |
| `GET  /adumo-card?action=redirect-failed`  | Adumo failure return URL |

---

## 3. Authentication

| Call type | Auth |
|---|---|
| `create_transaction` (customer-facing paycode) | **Public** — anon key in `Authorization: Bearer <VITE_SUPABASE_PUBLISHABLE_KEY>` |
| `mobile-request-to-pay` | Merchant integration credentials in body: Merchant ID UUID + PaySME API key |
| `create_subscription`, `sms_topup` | **Authenticated merchant** — Supabase user JWT |
| `adumo-card` | Public; identified by `merchant_id` + `api_key` in body |
| SDK calls | SDK injects the anon key automatically |

**Never** put a Supabase `service_role` key, webhook secret, or payment-provider credential in the browser. The generated snippet contains only the PaySME merchant integration identifiers intended for SDK initialization: **vendor_uuid** (the UUID-format Merchant ID) and the PaySME **api_key**. Do not substitute unrelated portal or provider credentials.

### 3.1 Merchant ID versus Vendor ID

> **WARNING: Use Merchant ID for `vendor_uuid`; do not use Vendor ID.**

Although the SDK parameter is named `vendor_uuid` for backward compatibility, it represents the PaySME **Merchant ID UUID**. Copy this UUID from **Merchant Portal > API & Integration > Your Merchant Details**.

| Identifier | Example | Purpose |
|---|---|---|
| **Merchant ID** | `32f44735-f665-4b5f-94ca-19d1a45d2942` | Required by the SDK and PaySME APIs as `vendor_uuid` |
| **Vendor ID** | `USV_32F44735` | Human-readable portal/business reference only, unless a separate API field explicitly asks for it |

Correct:

```js
vendor_uuid: "32f44735-f665-4b5f-94ca-19d1a45d2942"
```

Incorrect:

```js
vendor_uuid: "USV_32F44735"
```

---

## 4. SDK Integration (Recommended)

```html
<script defer src="https://www.paysme.site/sdk/v1/paysme.js"></script>
```

Load the SDK once in your page layout or document `<head>`. Do not use `sdk.paysme.site` as the script source and do not create a new script tag every time the customer clicks the payment button. Keep the button disabled until the required `window.PaySME` method exists; after a reasonable timeout, offer the generated hosted checkout URL instead of leaving the interface permanently on "Loading checkout".

### 4.0 Automatic SDK updates

The stable `/sdk/v1/paysme.js` URL receives compatible v1 updates automatically on the next successful page or WebView reload. The integrating application does not need a code change for every minor v1 release, but it must follow these rules:

1. Use the exact stable URL above. Do not copy the SDK into the application bundle or File Manager under another filename.
2. Do not require an exact minor version such as `PaySME.version === "1.9.1"`. Test for `window.PaySME` and the method the application uses.
3. Do not permanently cache or intercept the stable SDK in a service worker or WebView. Allow normal HTTP revalidation.
4. Reload the page or recreate the WebView after publishing an SDK update; an already-running JavaScript context cannot replace itself.
5. Documentation does not update an application's source code automatically. Developers must still implement new optional methods or breaking changes described in a new guide.

### 4.0.1 Merchant handoff to a developer or AI agent

> **Use Merchant ID for `vendor_uuid`; do not use Vendor ID.** The Merchant ID is the UUID shown in the API & Integration section. A human-readable value such as `USV_32F44735` is a Vendor ID and must not be placed in `vendor_uuid`.

For the recommended SDK integration, the merchant should provide the developer or AI agent with:

1. The **generated Integration Snippet** copied from **Dashboard > API & Integration**.
2. This API Integration Guide, either as the portal documentation link or the downloadable PDF.
3. The page or component where the **Pay with PaySME** button must appear.
4. The merchant's preferred return page and webhook URL, when server-side payment notifications are required.

The generated snippet contains the merchant-specific PaySME `vendor_uuid` (Merchant ID UUID), `api_key`, invoice settings, amount, and SDK initialization. The developer may adapt the surrounding layout and callback handling, but must preserve those PaySME fields and load the SDK only once. Vendor ID is for portal/business reference only unless a separate API field explicitly requests it.

MTC Maris, PayPulse, PayToday, WayaMe, and Adumo credentials must **not** be copied into the website snippet or given to a browser-side AI tool. The merchant saves the applicable merchant configuration in the PaySME portal; PaySME uses it securely from the backend when the corresponding payment button is enabled.

### 4.1 Static — fixed amount

```js
const payButton = document.getElementById("paysme-pay-btn");

function isPaySMEReady() {
  return !!(window.PaySME && window.PaySME.init);
}

function updatePayButton() {
  payButton.disabled = !isPaySMEReady();
  payButton.textContent = isPaySMEReady() ? "Pay with PaySME" : "Loading checkout...";
}

updatePayButton();
const sdkCheck = setInterval(() => {
  updatePayButton();
  if (isPaySMEReady()) clearInterval(sdkCheck);
}, 250);
setTimeout(() => clearInterval(sdkCheck), 10000);

payButton.addEventListener("click", () => {
  if (!isPaySMEReady()) return;

  localStorage.setItem("paysme_intent", JSON.stringify({
    invoice_id: "INV-2026-001",
    amount_nad: 150,
    redirect_url: window.location.href
  }));

  window.PaySME.init({
    vendor_uuid: "32f44735-f665-4b5f-94ca-19d1a45d2942", // Merchant ID UUID, not Vendor ID
    api_key: "YOUR_API_KEY",
    amount_nad: 150,
    invoice_id: "INV-2026-001",
    product_name: "Annual Membership",
    recurring: false,
    recurring_period: "monthly",
    redirect_url: "https://yoursite.com/payment/callback",
    on_success: (r) => {
      localStorage.removeItem("paysme_intent");
      console.log("Code:", r.generated_code, "TX:", r.transaction_id);
    },
    on_payment_success: (r) => console.log("Paid via", r.provider, r.generated_code),
    on_error: (e) => console.error(e.message || e),
    on_cancel: () => console.log("Closed"),
  });
});
```

```html
<button id="paysme-pay-btn" disabled>Loading checkout...</button>
```

After PaySME Code generation, the modal remains open on the generated-code screen. The SDK does not automatically redirect after code generation; customers can copy the code, choose another payment option, or close the modal themselves. `redirect_url` remains useful as a return/recovery URL for external payment flows such as card payments.

### 4.2 Dynamic — customer enters amount

```js
const paysme = PaySME.create({
  vendor_uuid: "32f44735-f665-4b5f-94ca-19d1a45d2942", // Merchant ID UUID, not Vendor ID
  api_key:     "YOUR_API_KEY",
  on_success:  (r) => alert("Code: " + r.generated_code),
});
document.getElementById("donate").onclick = () => paysme.open();
```

### 4.3 Pending — show an already-issued code

```js
const p = PaySME.pending({
  vendor_uuid:    "32f44735-f665-4b5f-94ca-19d1a45d2942", // Merchant ID UUID, not Vendor ID
  api_key:        "YOUR_API_KEY",
  generated_code: "1234-5678-9012",
});
p.open();
```

### 4.4 Mobile Request-to-Pay — required branded button

Use `PaySME.renderRequestToPayButton` when an application must send the normal PaySME hosted payment link by SMS without showing payment methods inside the application. This route is **opt-in**. The SDK renders and controls the official dark **Create Payment Request** button. Customer-facing integrations must not replace, recolour, rename, or imitate this button.

```html
<div id="paysme-request-button"></div>
<script>
  window.PaySME.renderRequestToPayButton({
      container: "#paysme-request-button",
      vendor_uuid: "32f44735-f665-4b5f-94ca-19d1a45d2942", // Merchant ID UUID, not Vendor ID
      api_key: "YOUR_API_KEY",
      invoice_id: "INV-2026-001",
      amount_nad: 150,
      mobile: "+264811234567",
      email: "buyer@example.com",
      town: "Windhoek",
      // Optional override. When omitted, the SDK derives a stable key from invoice_id.
      idempotency_key: "mobile-order-INV-2026-001",
      on_request_sent: (r) => console.log(r.message, r.request_id),
      on_error: (error) => console.error(error.message),
  });
</script>
```

After a successful pending request, the SDK shows exactly:

> **Request to Pay Sent. Check your SMS.**

The standard customer-facing integration must leave `show_notification` enabled. `PaySME.requestToPay(config)` remains available as the underlying programmatic method for controlled non-visual integrations, but does not replace the branded-button requirement for customer interfaces. Neither method opens, redirects to, or renders the facilitator-selection modal.

### 4.4.1 Invoice and PaySME-code reuse

The default SDK behavior mirrors the pending-transaction flow: **Merchant ID + `invoice_id` identifies one payment request**. If the customer clicks again an hour, a day, or a week later while that transaction remains pending, PaySME reuses the original transaction and the original PaySME code. It does not create a second code. After a one-minute anti-duplicate window, PaySME may resend the SMS containing that same code.

Use a genuinely different invoice reference for each separate obligation or instalment. For example, `1200_A`, `1200_B`, and `1200_C` produce separate transactions and separate PaySME codes. If `1200_A` is already paid, another call for `1200_A` returns `already_paid` and creates no transaction or SMS.

| Parameter | Required | Description |
|---|---|---|
| `container` | Yes for `renderRequestToPayButton` | CSS selector or HTML element where the SDK renders the official button |
| `vendor_uuid` | Yes | UUID-format Merchant ID; never the human-readable Vendor ID |
| `api_key` | Yes | PaySME merchant integration key |
| `invoice_id` | Yes | Merchant invoice/order reference |
| `amount_nad` | Yes | Amount in Namibian dollars |
| `mobile` | Yes | `081`, `083`, `085`, `+26481`, `+26483`, or `+26485` format |
| `email` | Yes | Valid customer email address |
| `town` | Yes | Customer town supplied by the application |
| `idempotency_key` | No | Optional override. When omitted, the SDK derives a stable Merchant ID + invoice key so the same invoice reuses its pending transaction/code. |
| `show_notification` | No | Defaults to `true`; customer-facing integrations must leave it enabled |
| `on_request_sent` | No | Called after the SMS provider accepts the hosted-link SMS |
| `on_already_paid` | No | Called instead of `on_request_sent` when the invoice is already paid |
| `on_error` | No | Called when validation, transaction creation, or SMS submission fails |

Successful result:

```json
{
  "ok": true,
  "success": true,
  "request_id": "8e770d2e-886a-4d98-b609-c50aeab5995a",
  "transaction_id": "bbf33acf-7232-4c11-960a-c2c124e1a3c8",
  "status": "payment_request_sent",
  "transaction_status": "pending",
  "sms_sent": true,
  "reused": false,
  "masked_mobile": "+26481••••4567",
  "message": "Request to Pay Sent. Check your SMS."
}
```

The customer opens the SMS link outside the application and chooses an available PaySME payment method on the hosted page. Fulfil only after the signed `payment.paid` merchant webhook; neither `payment_request_sent` nor `sms_sent: true` proves payment.

### 4.5 Callback and event contract

| Signal | Meaning | Safe to fulfil? |
|---|---|---|
| `on_success(result)` | A PaySME Code was generated successfully | **No** - transaction is normally still pending |
| `on_payment_success(result)` | PaySME verified a completed payment during the active checkout | Yes, but server webhook verification is preferred |
| `paysme:payment-success` browser event | Same verified-payment signal for applications using DOM events | Yes, but server webhook verification is preferred |
| `on_error(error)` | SDK action failed | No |
| `on_cancel()` | Customer closed the modal | No |
| `on_request_sent(result)` | Request-to-Pay SMS accepted; transaction remains pending | **No** |

PaySME Code generation returns a payload similar to:

```ts
on_success({
  transaction_id: "TX_0000001234",
  generated_code: "PSM-ABCD-1234",
  amount: 150,
  invoice_id: "INV-2026-001"
})
```

A verified payment callback/event contains the provider, generated PaySME Code, status, and available transaction identifiers. Do not manufacture or dispatch this event from merchant code.

```js
window.addEventListener("paysme:payment-success", (event) => {
  const payment = event.detail;
  console.log(payment.provider, payment.generated_code, payment.status);
  // Prefer waiting for the signed server webhook before automatic fulfilment.
});
```

### 4.6 Mobile app and WebView integration

For mobile apps, choose one of these supported patterns:

| Pattern | Recommendation |
|---|---|
| Render `PaySME.renderRequestToPayButton` and let the customer continue from the SMS link | Required Request-to-Pay route when payment selection must remain outside the application |
| Open the generated PaySME hosted checkout URL in an in-app browser or system browser | **Preferred** - smallest integration surface and independent of WebView script restrictions |
| Render merchant HTML containing the PaySME SDK inside a JavaScript-enabled WebView | Supported when the application controls WebView permissions, Content Security Policy, caching, and navigation |

For Request-to-Pay, the application supplies mobile, email, town, amount, and invoice reference from its own authenticated customer/order data. PaySME validates the fields, generates the pending PaySME transaction and Paycode, sends the normal hosted-link SMS, and returns only the request result. The SDK renders the official button and displays exactly **Request to Pay Sent. Check your SMS.** The application updates the order only after receiving PaySME's signed payment webhook.

App-store responsibility remains with the application publisher. Request-to-Pay is not a mechanism for bypassing Apple or Google rules for digital goods, subscriptions, virtual items, or functionality consumed inside the application. Publishers must use the store-required billing method or an approved regional external-payment programme where applicable.

If the SDK is loaded inside a WebView, the app developer must:

1. Enable JavaScript and HTTPS network access.
2. Allow `https://www.paysme.site` in the app/WebView Content Security Policy and network-security configuration.
3. Use the stable SDK tag:

```html
<script defer src="https://www.paysme.site/sdk/v1/paysme.js"></script>
```

4. Wait for the method the app uses, for example `window.PaySME?.renderRequestToPayButton`, before enabling the in-app payment button. Do not block on an exact `PaySME.version` string.
5. After ten seconds, offer the generated hosted checkout URL instead of displaying an indefinite loading state.
6. Reload or recreate the WebView when validating an SDK release. Log `window.PaySME?.version` for diagnostics; the current release is `1.10.0`, but exact minor-version equality must not control readiness.
7. Allow navigation to PaySME, Adumo, and approved banking/deep-link destinations used by the enabled payment methods.
8. Treat messages bridged from JavaScript to native code as UI events only. Signed PaySME server webhooks remain the authoritative payment proof.

Example readiness and hosted-fallback logic:

```js
const hostedCheckoutUrl = "YOUR_GENERATED_HOSTED_CHECKOUT_URL";
let sdkReady = false;

const sdkCheck = setInterval(() => {
  sdkReady = Boolean(window.PaySME && window.PaySME.init);
  if (sdkReady) clearInterval(sdkCheck);
}, 250);

setTimeout(() => {
  clearInterval(sdkCheck);
  if (!sdkReady) {
    // Enable a button that opens hostedCheckoutUrl.
  }
}, 10000);
```

---

## 5. Direct REST API

### 5.1 Create a paycode transaction

`POST /functions/v1/payments`

```http
Authorization: Bearer <VITE_SUPABASE_PUBLISHABLE_KEY>
Content-Type: application/json
```

```json
{
  "action": "create_transaction",
  "payload": {
    "merchant_id": "32f44735-f665-4b5f-94ca-19d1a45d2942",
    "amount": 150.00,
    "type": "paycode",
    "invoice_id": "INV-2026-001",
    "town": "Windhoek",
    "email": "buyer@example.com",
    "mobile": "+264811234567",
    "subscription_type": null
  }
}
```

**Response**

```json
{
  "ok": true,
  "transaction": {
    "transaction_id": "TX_0000001234",
    "generated_code": "PSM-ABCD-1234",
    "merchant_id": "...",
    "amount": 150,
    "invoice_id": "INV-2026-001",
    "business_name": "Acme Co",
    "paycode_status": "pending",
    "created_at": "2026-06-07T10:00:00Z"
  }
}
```

A PaySME-code SMS is dispatched automatically to the supplied `mobile`.

### 5.2 Mobile Request-to-Pay endpoint

The SDK method above calls this dedicated endpoint. Direct REST callers must send the same fields and retain one stable idempotency key for each invoice. The SDK handles this automatically when `idempotency_key` is omitted.

The endpoint is a server capability, not an alternative visual brand. Any customer-facing application that initiates this route must still present the official SDK-rendered **Create Payment Request** button and the exact success notice **Request to Pay Sent. Check your SMS.**

`POST /functions/v1/mobile-request-to-pay`

```http
Content-Type: application/json
X-Idempotency-Key: mobile-order-INV-2026-001
```

```json
{
  "vendor_uuid": "32f44735-f665-4b5f-94ca-19d1a45d2942",
  "api_key": "YOUR_API_KEY",
  "invoice_id": "INV-2026-001",
  "amount_nad": 150,
  "mobile": "+264811234567",
  "email": "buyer@example.com",
  "town": "Windhoek",
  "idempotency_key": "mobile-order-INV-2026-001"
}
```

The endpoint authenticates the Merchant ID/API-key pair, validates and canonicalises customer data, rate-limits abuse, creates one pending transaction, and waits for the SMS service to accept the normal PaySME hosted-link message. Repeating a successful key reuses the original transaction and PaySME code. Calls made within one minute are deduplicated without another SMS; later calls may resend the same code. If the transaction is already paid, the endpoint returns `already_paid` and does not create or send anything. If SMS submission fails, retry the same key so PaySME reuses the existing pending transaction.

The response never means paid. The customer's SMS link opens `https://paysme.site/c/:generated_code`, where the customer chooses from the payment methods enabled for that merchant. The merchant's signed `payment.paid` webhook remains authoritative.

### 5.3 Initiate a Card Payment (Adumo)

`POST /functions/v1/adumo-card`

```json
{
  "merchant_id":   "32f44735-f665-4b5f-94ca-19d1a45d2942",
  "amount":        "150.00",
  "invoice_id":    "INV-2026-001",
  "generated_code":"PSM-ABCD-1234",
  "origin_url":    "https://yoursite.com/checkout",
  "town":          "Windhoek",
  "email":         "buyer@example.com",
  "mobile":        "+264811234567",
  "business_name": "Acme Co"
}
```

**Response**

```json
{
  "ok": true,
  "token": "<adumo-jwt>",
  "mref": "PS_INV-2026-001_1774816563",
  "flow": "CARD",
  "currency_code": "NAD",
  "display_price": "150.00",
  "adumo_url": "https://...adumoonline.com/...",
  "redirect_success_url": "https://zvoqrqdnuupdefsuiurt.supabase.co/functions/v1/adumo-card?action=redirect-success",
  "redirect_failed_url":  "https://zvoqrqdnuupdefsuiurt.supabase.co/functions/v1/adumo-card?action=redirect-failed"
}
```

Build a hidden `<form method="POST" action="{adumo_url}">` and POST these fields:

| Field | Value |
|---|---|
| `flow` | `CARD` (opens the card flow directly instead of the payment-options page) |
| `MerchantID` | (provided by Adumo, configured server-side) |
| `ApplicationID` | (provided by Adumo) |
| `MerchantReference` | `mref` from response |
| `Amount` | `amount` (2dp) |
| `Token` | `token` from response |
| `AuthoriseCurrencyCode` | `currency_code` (`NAD`) |
| `DisplayPrice` | `display_price` |
| `txtCurrencyCode` | `currency_code` (`NAD`) |
| `RedirectSuccessfulURL` | `redirect_success_url` |
| `RedirectFailedURL` | `redirect_failed_url` |

The shared Adumo sample `puid` may be used with Adumo's public staging credentials while testing multiple merchant flows. In production, a `puid` enables Virtual 1Click and must belong to the individual cardholder; production checkouts must use a customer-specific value or omit it. The merchant's Adumo Application ID must be provisioned for NAD (or have Adumo MCP enabled) for `AuthoriseCurrencyCode=NAD` to control the actual collected currency. `txtCurrencyCode` and `DisplayPrice` are display fields and do not change settlement currency on their own.

After the Adumo flow completes the user is bounced back through `/adumo-card?action=redirect-success|failed`, which then redirects to your `origin_url` with appended query params:

```
{origin_url}?status=success&mref=...&generated_code=...&invoice_id=...
{origin_url}?status=cancelled&mref=...&error_code=05
```

> **Note (callback URL pattern):** The redirect uses the merchant's own `origin_url`. Examples like `skinnerbek://payment/callback?...` are merchant-specific — your app receives the same query parameters at whatever URL you provided as `origin_url`.

---

### 5.4 MTC Maris, PayPulse, and PayToday

Each business applies to the applicable provider separately. After approval, save the merchant code issued directly to your business under **Dashboard > API & Integration > Facilitator Merchant Codes**. Do not place provider credentials or merchant codes in browser code; the PaySME SDK uses the saved configuration securely from the backend.

The SDK automatically uses the pending PaySME transaction amount, Namibian-dollar currency, generated PaySME Code, customer mobile number, and merchant name. Merchants do not need to pass separate provider-specific transaction fields in the integration snippet.

Accepted customer mobile formats are local `081…`, `083…`, and `085…`, or international `+26481…`, `+26483…`, and `+26485…`. Local numbers are converted to canonical `+264…` format before payment initiation. Other prefixes are rejected.

The customer flow is:

1. Customer selects **Pay via MTC Maris**, **Pay via PayPulse**, or **Pay via PayToday**.
2. PaySME shows the provider logo, required-balance warning, and Proceed button.
3. Proceed replaces the warning with a branded input for the short-lived confirmation Paycode sent to the customer's phone.
4. The customer enters the numeric provider Paycode before the three-minute timer expires.
5. Confirm shows a seven-second **Waiting for approval** countdown.
6. While provider credentials are pending, the final circled-check screen displays **PASSED: Simulation Testing Event** and identifies the provider API as awaiting credentials.
7. The testing event does not submit a payment, mark the transaction paid, fire success events, send SMS, or invoke merchant webhooks.
8. Once a provider supplies its API, only a verified provider response may complete the transaction and invoke PaySME success notifications.

Provider availability depends on the merchant's approval and active configuration. PaySME keeps all provider connection details internal to the platform.

### 5.5 WayaMe / UPI

Each merchant verifies their own WayaMe Payment Address under **Dashboard > API & Integration**. The address, provider merchant code, institution and verification result are stored server-side. PaySME's sponsor partner identity and API credentials are platform-level environment variables and must not be included in merchant code or SDK configuration.

The production checkout will create one WayaMe payment request for the existing PaySME transaction. The same request may expose a bank-app intent, a provider-generated QR payload, or both. Opening an app or displaying/scanning a QR must never mark a payment successful by itself. PaySME must wait for a signed provider notification and may use provider status queries as a fallback before changing the transaction from pending to paid and invoking normal PaySME success notifications.

The current interface exposes **Approve in Bank App** and a QR presentation path. Selecting the button or tapping the QR starts a seven-second waiting state and then displays **PASSED: Simulation Testing Event. WayaMe confirmation API is awaiting provider credentials.** The current QR is a placeholder testing URI: scanning it on another device does not transmit the live merchant, amount, or PaySME transaction request. A real scannable payment request requires the provider's documented QR/deep-link format. The testing event never marks a transaction paid and does not fire callbacks, SMS, or merchant notifications.

## 6. Merchant Webhooks

Configure in **Dashboard → Profile → Webhook URL**.

When PaySME verifies a payment completion and the transaction changes to `paid`, PaySME POSTs:

```http
POST {your_webhook_url}
Content-Type: application/json
X-PaySME-Signature: sha256=<hex>
```

```json
{
  "notification_only": true,
  "event": "payment.paid",
  "generated_code": "PSM-ABCD-1234",
  "transaction_id": "TX_0000001234",
  "invoice_id": "INV-2026-001",
  "amount": 150,
  "currency": "NAD",
  "status": "paid",
  "paid_at": "2026-06-07T10:14:22Z",
  "merchant_id": "32f44735-f665-4b5f-94ca-19d1a45d2942"
}
```

**Verify signature:** HMAC-SHA256 of raw body using your **Webhook Secret** (visible once when generated).

```js
const expected = crypto.createHmac("sha256", WEBHOOK_SECRET)
                        .update(rawBody).digest("hex");
// Compare with header value after the "sha256=" prefix.
```

Respond `200` within 10s or the delivery is retried (exponential backoff, up to 6 attempts).

---

## 7. Transaction Lifecycle

```
created (pending)
   │
   ├── customer pays by card  ──► Adumo notify  ──► paid / finalized
   │
   ├── customer pays by MTC Maris / PayPulse / PayToday ──► verified provider confirmation ──► paid / finalized
   │
   ├── customer pays by WayaMe ──► signed notify/status verification ──► paid / finalized
   │
   └── customer redeems code at vendor ──► webhooks-payments ──► paid
                                                        │
                                                        └─► merchant webhook fired
```

| `paycode_status` | Meaning |
|---|---|
| `pending` | Code generated, not yet redeemed/paid |
| `paid`    | Completion verified through vendor redemption or a supported payment provider |
| `expired` | Code lifetime elapsed |
| `cancelled` | Cancelled by merchant or failed card auth |

---

## 8. Error Codes

| HTTP | `error` | Meaning |
|---|---|---|
| 400 | `Missing action` | Body missing `action` field |
| 400 | `Unknown action` | Action not recognised |
| 401 | `Unauthorized: missing auth header` | No `Authorization` header on protected action |
| 401 | `Unauthorized: invalid token` | Bad/expired user JWT |
| 403 | `Forbidden: merchant mismatch` | JWT `sub` ≠ `user_id` in payload |
| 400 | `Merchant not found` | `merchant_id` does not exist |
| 400 | `Card payment initiation failed` | Adumo JWT generation failed |
| 400 | `A valid customer email address is required` | Request-to-Pay email validation failed |
| 400 | `Use a Namibian mobile number...` | Request-to-Pay mobile prefix/length validation failed |
| 401 | `Invalid merchant credentials` | Request-to-Pay Merchant ID/API-key pair is invalid |
| 409 | `This payment request is already being processed` | Duplicate idempotency key is still processing |
| 409 | `This idempotency_key is already assigned...` | Same key was reused with different payment details |
| 429 | `Too many payment requests` | Merchant/customer SMS rate limit reached |
| 502 | `The payment was created, but the SMS could not be sent` | Retry with the same idempotency key |

Adumo card error codes (returned in `error_code`):

| Code | Meaning |
|---|---|
| `00` | Approved |
| `05` | Do not honour / declined |
| `51` | Insufficient funds |
| `54` | Expired card |
| `91` | Issuer unavailable |
| `96` | System malfunction |

---

## 9. Testing

| Type | Value |
|---|---|
| Test Merchant ID | `00000000-1986-0026-0000-000000000001` |
| Test Card (approve) | `4111 1111 1111 1111`, any future expiry, CVV `123` |
| Test Card (decline) | `4000 0000 0000 0002` |

Run the SDK demo: <https://www.paysme.site/sdk/v1/demo.html>

SDK v1.10.0 adds merchant VAT-settings lookup and clear Namibia VAT breakdowns while retaining the official `renderRequestToPayButton` customer-facing route introduced in v1.9.1. Existing `init`, `create`, and `pending` integrations keep their modal behavior automatically. Existing integrations using the stable v1 SDK URL receive compatible updates after reload and HTTP revalidation. During deployment checks, log `window.PaySME.version` and confirm the required SDK method exists; do not reject a compatible release solely because its minor version changed.

---

## 10. Going Live Checklist

- [ ] Production `merchant_id` & `api_key` in your code/env
- [ ] Webhook URL registered + secret stored server-side
- [ ] Signature verification implemented
- [ ] `origin_url` set to your production return page
- [ ] KYC approved (Dashboard → KYC)
- [ ] SMS credits topped up
- [ ] Modal tested on mobile + desktop
- [ ] Card flow tested end-to-end with live amount of N$ 1.00
- [ ] `on_success` does not fulfil an order or mark an invoice paid
- [ ] Signed `payment.paid` webhook is verified before unattended fulfilment
- [ ] Provider testing-result screens leave the PaySME transaction pending
- [ ] If using Request-to-Pay, the app uses the SDK-rendered branded button and displays exactly Request to Pay Sent. Check your SMS.
- [ ] Request-to-Pay never marks the invoice paid from the request result
- [ ] A stable idempotency key is retained for retries of the same mobile payment request
- [ ] App-store billing rules have been reviewed for the exact goods/services sold by the application

### 10.1 Coding-agent acceptance test

Before handing the integration back, a developer or coding agent should report evidence for each item:

1. SDK script is loaded once from the stable `www.paysme.site/sdk/v1/paysme.js` URL, reports the current release for diagnostics, and exposes the required method without an exact minor-version gate.
2. Generated merchant `vendor_uuid` contains the UUID-format Merchant ID (never the human-readable Vendor ID) and the PaySME `api_key` is preserved.
3. Static or dynamic modal opens from the intended button.
4. Town, email, and accepted Namibian mobile formats validate correctly.
5. PaySME Code generation returns `on_success` but does not trigger fulfilment.
6. Closing the modal invokes only `on_cancel`.
7. Provider testing flows end on the circled-check testing-result screen after seven seconds and do not fire `on_payment_success`.
8. Server webhook verification uses the raw request body and webhook secret.
9. No provider credentials, webhook secrets, or service-role keys appear in browser source, logs, screenshots, or commits.
10. If the application selected Request-to-Pay, the SDK-rendered branded button is present, no facilitator/payment modal opens inside the app, the exact SMS-check confirmation is shown, and fulfilment still waits for the signed webhook.

---

## 11. Support

- Docs: <https://paysme.site/api>
- Email: support@paysme.site
- Status / Logs: Dashboard → API Integration → Logs
