# PaySME SDK v1.11.1

**Dynamic, Centrally Managed Payment Integration**

Checkout now collects a required Town before Email Address and Mobile Number. A custom, non-native suggestion panel begins after three characters, matches without case sensitivity, prioritises names that start with the query, and still allows manual town entry.

The PaySME SDK lets merchants accept payments via PaySME codes, WayaMe, MTC Maris, PayPulse, PayToday, Kazang, and card — all through a single JavaScript file hosted by PaySME. The modal lives in the SDK, not in your codebase, giving PaySME central control over branding and functionality across all merchant integrations.

The normal `PaySME.init()` and `PaySME.create()` methods continue to open the full payment modal. Mobile applications may explicitly choose `PaySME.requestToPay()` to send the normal PaySME hosted payment link by SMS without opening a facilitator/payment modal inside the application. The SDK never switches modes automatically.

---

## Quick Start

> **Important:** Use the UUID-format **Merchant ID** for `vendor_uuid`; do not use the human-readable **Vendor ID**. For example, use `32f44735-f665-4b5f-94ca-19d1a45d2942`, not `USV_32F44735`. The `vendor_uuid` name is retained for backward compatibility. Copy Merchant ID from **Merchant Portal > API & Integration**.

Add a single script tag to your website:

```html
<script defer src="https://www.paysme.site/sdk/v1/paysme.js"></script>
```

Load the SDK once in your app layout or page `<head>`, then wait for `window.PaySME?.init` before enabling payment buttons.

---

## Usage Modes

### 1. Static Mode — `PaySME.init()`

For fixed-price products or invoices where the amount is known upfront.

```html
<button id="pay-btn" disabled>Loading checkout...</button>

<script defer src="https://www.paysme.site/sdk/v1/paysme.js"></script>
<script>
  var payButton = document.getElementById('pay-btn');

  function isPaySMEReady() {
    return !!(window.PaySME && window.PaySME.init);
  }

  function updatePayButton() {
    payButton.disabled = !isPaySMEReady();
    payButton.textContent = isPaySMEReady() ? 'Pay N$ 50' : 'Loading checkout...';
  }

  updatePayButton();
  var sdkCheck = setInterval(function() {
    updatePayButton();
    if (isPaySMEReady()) clearInterval(sdkCheck);
  }, 250);
  setTimeout(function() { clearInterval(sdkCheck); }, 10000);

  payButton.addEventListener('click', function() {
    if (!isPaySMEReady()) return;

    localStorage.setItem('paysme_intent', JSON.stringify({
      invoice_id: 'INV-001',
      amount_nad: 50,
      redirect_url: window.location.href
    }));

    window.PaySME.init({
      vendor_uuid: "32f44735-f665-4b5f-94ca-19d1a45d2942", // Merchant ID UUID; not Vendor ID
      api_key: "your-api-key",              // required
      amount_nad: 50,                        // required (N$)
      invoice_id: "INV-001",                 // required, unique per tx
      product_name: "Monthly Subscription",  // required
      recurring: true,                       // optional, default false
      recurring_period: "monthly",           // optional: "monthly"|"weekly"|"daily"
      redirect_url: "https://yoursite.com/payment/callback", // optional return/recovery URL
      on_success: function(result) {
        localStorage.removeItem('paysme_intent');
        console.log("Code:", result.generated_code);
        console.log("TX ID:", result.transaction_id);
      },
      on_error: function(error) {
        console.error("Failed:", error.message);
      },
      on_cancel: function() {
        console.log("User closed modal");
      }
    });
  });
</script>
```

### 2. Dynamic Mode — `PaySME.create()` + `.open()`

For cases where the customer selects amount and product at payment time (e.g., donations, custom invoicing).

```html
<button id="donate-btn">Donate</button>

<script defer src="https://www.paysme.site/sdk/v1/paysme.js"></script>
<script>
  var paysme = window.PaySME.create({
    vendor_uuid: "32f44735-f665-4b5f-94ca-19d1a45d2942", // Merchant ID UUID; not Vendor ID
    api_key: "your-api-key",
    on_success: function(result) {
      alert("Thank you! Code: " + result.generated_code);
    },
    on_error: function(error) {
      alert("Error: " + error.message);
    },
    on_cancel: function() {
      console.log("Cancelled");
    }
  });

  document.getElementById('donate-btn').addEventListener('click', function() {
    paysme.open();
  });
</script>
```

### 3. Pending Pay Mode — `PaySME.pending()` + `.open()`

For when a paycode has already been generated and the user wants to view it and pay. The merchant passes the `generated_code` directly — no forms or lookups needed.

```html
<button id="pay-pending-btn">Pay Pending Invoice</button>

<script defer src="https://www.paysme.site/sdk/v1/paysme.js"></script>
<script>
  var pendingPay = window.PaySME.pending({
    vendor_uuid: "32f44735-f665-4b5f-94ca-19d1a45d2942", // Merchant ID UUID; not Vendor ID
    api_key: "your-api-key",
    generated_code: "1234-5678-9012",  // the pending paycode
    on_success: function(result) {
      console.log("Code:", result.generated_code);
    },
    on_error: function(error) {
      console.error("Error:", error.message);
    },
    on_cancel: function() {
      console.log("Modal closed");
    }
  });

  document.getElementById('pay-pending-btn').addEventListener('click', function() {
    pendingPay.open();
  });
</script>
```

### 4. Mobile Request-to-Pay — branded SDK button

For applications that must keep payment selection outside the app. Customer-facing integrations must use the official SDK-rendered PaySME button. PaySME creates the pending transaction, sends the normal hosted-link SMS, and shows exactly **Request to Pay Sent. Check your SMS.** It does not open or redirect to a payment modal.

```html
<div id="paysme-request-button"></div>
<script>
  window.PaySME.renderRequestToPayButton({
    container: "#paysme-request-button",
    vendor_uuid: "32f44735-f665-4b5f-94ca-19d1a45d2942", // Merchant ID UUID; not Vendor ID
    api_key: "your-api-key",
    invoice_id: "INV-001",
    amount_nad: 50,
    mobile: "+264811234567",
    email: "customer@example.com",
    town: "Windhoek",
    // Optional override. When omitted, the SDK derives a stable key from invoice_id.
    idempotency_key: "mobile-order-INV-001",
    on_request_sent: function (response) {
      console.log(response.message); // Request to Pay Sent. Check your SMS.
    },
    on_error: function (error) {
      console.error(error.message);
    }
  });
</script>
```

`PaySME.requestToPay(config)` remains the underlying programmatic method, but customer-facing interfaces must use `PaySME.renderRequestToPayButton(config)` so the approved PaySME button and confirmation wording remain consistent.

The SDK automatically treats the invoice reference as the payment-request identity. Repeating `INV-001` while its transaction is pending reuses the same transaction and PaySME code; after the one-minute anti-duplicate window, another click resends that same code by SMS. A different instalment reference such as `INV-001_B` creates a different transaction and code. An already-paid invoice is reported as paid and is never recreated.

The customer chooses an enabled payment method only after opening the SMS link. Never fulfil from `on_request_sent`; wait for the signed merchant `payment.paid` webhook.

---

## Parameters Reference

### `PaySME.init(config)`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `vendor_uuid` | string | ✅ | Your UUID-format PaySME Merchant ID. Never use the human-readable Vendor ID. |
| `api_key` | string | ✅ | Your PaySME API Key |
| `amount_nad` | number | ✅ | Payment amount in N$ |
| `invoice_id` | string | ✅ | Unique invoice identifier |
| `product_name` | string | ✅ | Product/service name |
| `recurring` | boolean | ❌ | Enable recurring billing (default: false) |
| `recurring_period` | string | ❌ | "monthly", "weekly", or "daily" |
| `redirect_url` | string | ❌ | Optional return/recovery URL for external payment flows. Paycode generation does not auto-redirect; the generated-code screen stays open until user action. |
| `on_success` | function | ❌ | Callback on successful code generation |
| `on_error` | function | ❌ | Callback on error |
| `on_cancel` | function | ❌ | Callback when user closes modal |

VAT is configured by the merchant in **Merchant Portal > Tax Settings** and is fixed at Namibia's 15% rate. The SDK sends the entered amount as the net amount; PaySME's server calculates VAT for the configured merchant mode and the payment modal shows the final customer total. Do not add VAT in your integration code.

### `PaySME.create(config)`

Same as above but `amount_nad`, `invoice_id`, and `product_name` are entered by the customer inside the modal.

Returns an object with:
- `.open()` — Show the payment modal
- `.close()` — Programmatically close the modal

### `PaySME.pending(config)`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `vendor_uuid` | string | ✅ | Your UUID-format PaySME Merchant ID. Never use the human-readable Vendor ID. |
| `api_key` | string | ✅ | Your PaySME API Key |
| `generated_code` | string | ✅ | The pending paycode to display |
| `on_success` | function | ❌ | Callback when code is validated and shown |
| `on_error` | function | ❌ | Callback on validation error |
| `on_cancel` | function | ❌ | Callback when user closes modal |

Returns an object with:
- `.open()` — Validate code and show payment modal
- `.close()` — Programmatically close the modal

### `PaySME.requestToPay(config)`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `vendor_uuid` | string | ✅ | UUID-format PaySME Merchant ID; never Vendor ID |
| `api_key` | string | ✅ | PaySME merchant integration key |
| `invoice_id` | string | ✅ | Merchant invoice/order reference |
| `amount_nad` | number | ✅ | Amount in N$ |
| `mobile` | string | ✅ | Accepted Namibian `081`, `083`, `085`, or canonical `+264…` number |
| `email` | string | ✅ | Valid customer email |
| `town` | string | ✅ | Customer town |
| `idempotency_key` | string | ❌ | Optional override. By default the SDK derives a stable merchant-and-invoice key so the same invoice reuses its pending PaySME code. |
| `show_notification` | boolean | ❌ | Defaults true; set false only when the application shows equivalent confirmation |
| `on_request_sent` | function | ❌ | Called when the hosted-link SMS is accepted |
| `on_already_paid` | function | ❌ | Called instead of `on_request_sent` when this invoice is already paid |
| `on_error` | function | ❌ | Called on validation, creation, or SMS failure |

Returns a Promise. A new or resent pending request has `status: "payment_request_sent"` and `transaction_status: "pending"`. `reused: true` means the existing invoice transaction/code was used. An already-paid invoice returns `status: "already_paid"`, `transaction_status: "paid"`, and sends no SMS. Application fulfilment must still rely on its verified payment record/webhook.

### `PaySME.renderRequestToPayButton(config)`

The required customer-facing Request-to-Pay method. It accepts every `requestToPay` parameter plus a required `container` CSS selector or HTML element. It renders the official dark PaySME **Create Payment Request** button, prevents repeat clicks while sending, calls `requestToPay`, and shows **Request to Pay Sent. Check your SMS.** on success. The developer must not replace, recolour, rename, or visually imitate this button.

---

## Callback Data

### `on_success(result)`

```js
{
  transaction_id: "TX_0000001234",
  generated_code: "PSM-ABCD-1234",
  amount: 100,
  invoice_id: "INV-001"
}
```

### `on_error(error)`

Standard JavaScript Error object with `.message`.

---

## MTC Maris, PayPulse, PayToday and Kazang

Each merchant must save the merchant code issued directly to their business under **Dashboard > API & Integration > Facilitator Merchant Codes**. PaySME handles provider connections securely in the backend.

The SDK sends the PaySME generated code as `merchantTransactionNumber`, the customer's mobile number as `mobileNumber`, the paycode amount in `NAD`, and the PaySME merchant name plus `PaySME Payment` as the description. MTC Maris, PayPulse, and PayToday currently show a branded three-minute confirmation-Paycode input. Kazang instead instructs the customer to buy an EasyPay Voucher for the exact transaction amount from a participating Kazang retailer and then enter the 16-digit PIN printed on the voucher receipt. All four simulation flows finish with a seven-second approval check. While provider credentials are pending, Confirm ends with **PASSED: Simulation Testing Event** and does not mark the transaction paid, fire success events, send SMS, or invoke merchant webhooks. Live confirmation remains disabled until the applicable provider supplies its direct API specifications and credentials.

Use `on_payment_success(result)` for verified provider completion. The SDK also dispatches a `paysme:payment-success` browser event. The result contains `provider`, `generated_code`, `status`, and `attempt_id`.

## WayaMe / UPI

WayaMe is enabled only after the merchant verifies a WayaMe Payment Address under **Dashboard > API & Integration**. The SDK creates one PaySME-backed WayaMe payment request and displays the channels returned by the provider, such as a bank-app intent and QR payload. The modal remains in a processing state until PaySME receives a verified provider notification or securely reconciles the provider status.

The current simulation mode includes an **Approve in Bank App** interface test. It waits seven seconds and then displays **PASSED: Simulation Testing Event. WayaMe confirmation API is awaiting provider credentials.** It cannot mark a transaction paid or invoke any success callback, SMS, or merchant notification. Sponsor identity, API credentials, routes and webhook secrets will remain server-side when the production connection is added.

## Webhooks

When a payment is confirmed (code used at vendor), PaySME fires a webhook to your registered webhook URL:

```json
POST https://your-webhook-url.com
{
  "notification_only": true,
  "generated_code": "PSM-ABCD-1234",
  "transaction_id": "TX_0000001234",
  "amount": 100,
  "status": "paid"
}
```

Configure your webhook URL in the PaySME Dashboard under **Profile > Webhook URL**.

---

## Versioning

The SDK is versioned at `/sdk/v1/paysme.js`. Use the stable URL `https://www.paysme.site/sdk/v1/paysme.js` exactly as shown. It is served with revalidation headers, so a website or WebView receives compatible v1 updates on its next successful reload without changing the embed code. Do not hard-code an exact minor version check such as `PaySME.version === "1.9.1"`; check that `window.PaySME` and the required method exist instead. Future major versions will be published at `/sdk/v2/` and will require an intentional merchant upgrade.

---

## Support

- Website: [paysme.site](https://paysme.site)
- Email: support@paysme.site
