# PaySME Vendor App Restricted Checkout API

This API is exclusively for these Vendor App obligations:

- `vendor_token_topup`
- `vendor_advance_installment`

Both purposes are **external-payment-only**. They cannot be paid using a PaySME
Code, the PaySME Vendor Network, a vendor token balance, or a vendor fee balance.
No PaySME-code SMS or payment-confirmation SMS is sent for these transactions.

## Presentation requirement

The Vendor App must present checkout in a native React Native modal. It must not
redirect the user to a PaySME-hosted checkout page.

The native modal displays the payment methods returned by the API. If a provider
requires a secure HTML form, the provider form may be contained in a WebView
inside the native modal. Closing the WebView returns to the same modal, which
polls the PaySME status endpoint. MTC Maris and PayPulse confirmation-code input
must remain inside the native modal.

Never display or copy the internal `generated_code`. It exists only as PaySME's
provider transaction reference and is blocked from Vendor Network redemption.

## Endpoint

```text
POST https://zvoqrqdnuupdefsuiurt.supabase.co/functions/v1/vendor-payment-checkout
Authorization: Bearer <vendor Supabase access token>
apikey: <Supabase anonymous key>
Content-Type: application/json
```

The backend derives `vendor_id` from the authenticated Supabase user. The app
must not send or choose a vendor UUID.

## Create a token top-up checkout

```json
{
  "action": "create",
  "purpose": "vendor_token_topup",
  "token_value_requested": 1000
}
```

The backend validates the value and calculates the five-percent discount:

```text
Token value credited: N$1,000.00
Discount:              N$   50.00
External amount due:  N$  950.00
```

The discount and payable amount displayed by the app must come from the API
response, not from a client-side calculation.

## Create an advance-installment checkout

```json
{
  "action": "create",
  "purpose": "vendor_advance_installment",
  "advance_id": "<advance UUID>",
  "requested_amount": 500
}
```

`requested_amount` may be omitted to use the minimum currently due. When it is
provided, the backend requires it to be at least `min_installment` and no more
than `balance_remaining`. The backend verifies that the advance belongs to the
authenticated vendor and is active.

## Create response

```json
{
  "ok": true,
  "checkout": {
    "checkout_session_id": "<UUID>",
    "checkout_token": "<short-lived opaque token>",
    "purpose": "vendor_token_topup",
    "amount_due": 950,
    "token_value": 1000,
    "discount_amount": 50,
    "currency": "NAD",
    "status": "checkout_created",
    "allowed_methods": ["card", "mtc_maris", "paypulse", "wayame"],
    "methods": {
      "card": { "enabled": true, "status": "active", "reason": null },
      "mtc_maris": { "enabled": false, "status": "pending", "reason": "..." },
      "paypulse": { "enabled": false, "status": "pending", "reason": "..." },
      "wayame": { "enabled": false, "status": "not_configured", "reason": "..." }
    },
    "expires_at": "<ISO timestamp>",
    "presentation": "native_modal",
    "sms_notifications_enabled": false,
    "vendor_network_enabled": false
  }
}
```

Keep `checkout_token` only in memory while the modal is open. Do not log it or
persist it as ordinary application data.

## Initiate an external method

```json
{
  "action": "initiate_payment",
  "checkout_session_id": "<UUID>",
  "checkout_token": "<opaque token>",
  "method": "card"
}
```

For MTC Maris or PayPulse, set `method` accordingly. The response is wrapped as:

```json
{
  "ok": true,
  "payment": {
    "checkout_session_id": "<UUID>",
    "presentation": "native_modal",
    "sms_notifications_enabled": false
  }
}
```

Provider-specific fields are included in `payment`. Card/provider form fields
must be rendered in a WebView contained by the modal, never by navigating the
whole app to a PaySME-hosted page.

### Request an MTC Maris or PayPulse confirmation code

The adapter is prepared for the direct provider API that will be enabled once
the provider supplies its final credentials and specification:

```json
{
  "action": "initiate_payment",
  "checkout_session_id": "<UUID>",
  "checkout_token": "<opaque token>",
  "method": "mtc_maris",
  "provider_action": "request_provider_code"
}
```

### Confirm the code in the native modal

```json
{
  "action": "initiate_payment",
  "checkout_session_id": "<UUID>",
  "checkout_token": "<opaque token>",
  "method": "mtc_maris",
  "provider_action": "confirm_provider_code",
  "confirmation_code": "6056304"
}
```

Use `paypulse` for the PayPulse equivalents. Until the direct confirmation API
is supplied, the endpoint returns `501 provider_confirmation_api_pending`.

## Poll checkout status

Status checks require the vendor JWT but not the short-lived checkout token:

```json
{
  "action": "status",
  "checkout_session_id": "<UUID>"
}
```

The app should poll every three seconds while payment is processing, immediately
when the app resumes, and once when the provider WebView closes. Stop polling at
`paid`, `failed`, `cancelled`, `expired`, or `refunded`.

Only `paid` means settlement completed. A browser/WebView return is a user
interface event, not proof of payment.

## Cancel an open checkout

```json
{
  "action": "cancel",
  "checkout_session_id": "<UUID>",
  "checkout_token": "<opaque token>"
}
```

## Native client helper

```javascript
const CHECKOUT_URL =
  "https://zvoqrqdnuupdefsuiurt.supabase.co/functions/v1/vendor-payment-checkout";

async function vendorCheckout(accessToken, anonKey, request) {
  const response = await fetch(CHECKOUT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Payment request failed");
  return result;
}
```

This helper belongs in the Vendor App API layer. It does not contain a PaySME
merchant API key, service-role key, facilitator credential, or merchant code.

## Authoritative settlement

The app must never directly:

- insert a `completed` `vendor_topup_credits` row;
- increase `vendors.token_balance`;
- subtract an installment from `fee_balance` or `token_balance`;
- update advance repayment totals or status;
- insert completed `vendor_transactions` history.

After a verified external provider callback, PaySME atomically settles the
obligation. A token top-up credits the purchased token value. An installment
reduces the advance balance without touching either internal vendor balance.

