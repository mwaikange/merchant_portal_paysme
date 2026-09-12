# PaySME SDK Changelog

## v1.11.1 - 2026-09-10

- Changed Kazang actions to the supplied Lesaka EasyPay button colour (`#B3D31B`) with black text.
- Replaced the generic account and SMS-code wording with the correct EasyPay Voucher purchase and 16-digit PIN flow.
- Removed the white logo frame and padding so the full Lesaka EasyPay artwork displays with rounded edges.

## v1.11.0 - 2026-09-09

- Added Kazang as a configurable payment facilitator across hosted and embedded PaySME payment modals.
- Added a green, white-text Kazang payment button and Lesaka EasyPay brand artwork.
- Added the simulation-only Kazang confirmation-code flow; no transaction is marked paid until live Kazang API verification is implemented.
- Added Kazang to failed-payment retry options and checkout eligibility handling.

## v1.10.0 - 2026-09-03

- Added merchant VAT settings lookup and clear 15% Namibia VAT breakdowns to static, dynamic and pending payment modals.
- Keeps VAT calculation server-authoritative and exposes the final gross amount in the code-generation callback.
- Standardised the supported SDK address as `https://www.paysme.site/sdk/v1/paysme.js`.
- Documented automatic compatible v1 updates, WebView revalidation, and capability-based readiness checks.

## v1.9.1 - 2026-08-28

- Added `PaySME.renderRequestToPayButton()` as the required customer-facing Request-to-Pay integration.
- The SDK renders the official branded **Create Payment Request** button and owns its loading state.
- Standardised the successful customer notification to exactly **Request to Pay Sent. Check your SMS.**
- Removed payment-completion wording from the Request-to-Pay notification.

## v1.9.0 - 2026-08-27

- Added the explicit `PaySME.requestToPay()` mobile/app integration mode.
- Creates one pending PaySME transaction and sends the normal hosted payment link by SMS without opening the payment modal.
- Added the compact **Request to Pay Sent** SDK notification, Promise result, and `on_request_sent` callback.
- Added Merchant ID/API-key validation, customer-data validation, duplicate protection, rate limits, and safe SMS retry behavior through the dedicated `mobile-request-to-pay` endpoint.
- The SDK now derives a stable request identity from Merchant ID + invoice reference by default. Repeated clicks reuse and may resend the same pending PaySME code; distinct instalment references create distinct codes, and paid invoices are not recreated.
- Existing `init`, `create`, and `pending` integrations retain their normal modal behavior and never switch modes automatically.
- Request-to-Pay results remain pending and cannot mark an invoice paid; signed merchant webhooks remain authoritative.

## v1.8.6

- Uses the documented minimal Adumo Virtual production form fields.
- Omits `AuthoriseCurrencyCode` unless MCP/FX is explicitly enabled for the Application UID.
- Removes legacy `flow`, `DisplayPrice`, and `txtCurrencyCode` fields from Adumo form posts.

## v1.8.5 - 2026-08-12

- Mobile card returns now use the configured `redirect_url` instead of the WebView page URL.
- Payment result screens support safe custom app schemes and solid Return and Close actions.
- Close actions notify React Native/WebView hosts and fall back to merchant navigation when `window.close()` is blocked.

## v1.8.3 - 2026-08-10

- Restored the WayaMe QR to the simulation interface with an explicit non-payment label.

## v1.8.2 - 2026-08-10

- Removed unavailable provider Edge calls from MTC Maris, PayPulse, PayToday, and WayaMe simulation screens.
- Simulation tests now run entirely as non-transactional interface checks and cannot create payment attempts.

## v1.8.1 - 2026-08-10

- Made all unconnected provider confirmations non-transactional simulation tests.
- Replaced WayaMe simulated approval with a 15-second **Approve in Bank App** interface test.
- Simulation events never mark transactions paid or invoke callbacks, SMS, or merchant notifications.

## v1.8.0 - 2026-08-10

- Added the WayaMe payment-request flow with QR, bank-app capability, processing, status polling, and success screens.
- Added non-transactional provider simulation results; test events never mark transactions paid or invoke success callbacks.
- WayaMe now appears only when the merchant payment address has been verified and enabled.
- Restored the MTC Maris facilitator icon in the homepage flow footer.

## v1.7.0 - 2026-07-28

- Added PayToday as a merchant-controlled checkout method in the SDK and hosted PaySME payment modal.
- Added a blue-to-cyan PayToday button with white text and the PayToday logo on the preflight notice.
- Added the PayToday USSD balance warning and confirmation-Paycode handoff.
- Added PayToday to pending-payment recovery and billing-locked payment views.

## v1.6.2 - 2026-07-27

- Changed Town suggestions to a compact absolute overlay beneath the input.
- Suggestions now float above later fields without changing modal height or moving the payment button.

## v1.6.1 - 2026-07-27

- Replaced the browser-native Town datalist with a custom text autocomplete.
- Removed native dropdown arrows and device-specific dropdown behaviour.
- Anchored suggestions within the modal directly below Town without covering later fields.
- Added start-of-name prioritisation, five-row scrolling, keyboard navigation, touch selection, and outside-tap closing.
- Locks the page behind an open PaySME modal while keeping the modal itself scrollable.

## v1.6.0 - 2026-07-27

- Added a required customer Town field before Email Address and Mobile Number.
- Added case-insensitive Namibian town suggestions after three typed characters while allowing manual entries.
- Replaced mobile examples with generic Namibian numbers.
- Added mobile-safe modal scrolling and viewport-height limits.
- Sends the town to PaySME transaction creation and card-payment handoff records.

## v1.5.3 - 2026-07-22

- Fixed failed Adumo card retries being rejected by Supabase with `401`.
- Failed retries are now authorized and reset server-side after verifying the merchant, paycode, invoice, amount, and retry state.
- Added duplicate/inactive Adumo callback protection for payment attempts that have already been processed.

## v1.5.2 - 2026-07-15

- Replaced the external popup handoff with an embedded MTC Maris/PayPulse confirmation-Paycode input.
- Added a three-minute expiry timer and numeric one-time-code validation.
- Added stable `request_provider_code` and `confirm_provider_code` backend contracts, ready for the providers' forthcoming APIs.

## v1.5.1 - 2026-07-15

- Updated checkout colors: PaySME code is yellow/black and PayPulse is blue/yellow.

## v1.5.0 - 2026-07-15

- Added payment handoff flows for MTC Maris and PayPulse.
- Added branded provider pre-flight screens and secure provider MCode entry.
- Added verified payment completion events and merchant webhook forwarding.
- Added PayPulse to all SDK payment-option views.
- Keeps all provider credentials and connection settings server-side.

## v1.4.4 - 2026-06-28
- Uses merchant-specific Adumo Merchant ID and Application ID returned by PaySME at checkout instead of hardcoded staging credentials.
- Keeps Adumo JWT Secret server-side in the PaySME edge function; it is never exposed through the SDK.
- Keeps Adumo payment flow in the same browser tab for 3DS compatibility.
- Includes transient `puid` in the Adumo form POST while keeping it out of merchant credential storage.
- Keeps `txtCurrencyCode` as `NAD`.
## v1.4.2 — 2026-06-21
- Updated merchant integration guidance to load the SDK globally once with `?v=1.4.2`.
- Recommended waiting for `window.PaySME?.init` before enabling checkout buttons.
- Added payment intent guidance for redirect/WebView recovery flows.
- Removed automatic redirect after paycode generation so the generated-code screen remains open until user action.
- Renamed the pending IPP option to "Pay via WayaMe" with WayaMe-aligned red styling.
- Added "Pay via MTC Maris" as a separate facilitator option with blue/red styling.
- WayaMe and MTC Maris currently show coming-soon notices until their live payment flows are enabled.

## v1.3.0 — 2026-03-02

### Changes
- **Pending Pay mode** (`PaySME.pending()`): Merchant passes the `generated_code` directly — modal validates the code and shows payment options (Copy, IPP, Card) immediately. No email/mobile form — the merchant already has the code.
- **Security**: No user-guessable lookups — only the merchant who has the code can initiate the pending pay modal.

## v1.2.0 — 2026-03-02

### Changes
- Removed email/mobile lookup form from pending pay — merchant pushes user identity directly.

## v1.1.0 — 2026-02-26

### Changes
- **Initial form screen**: Removed "Pay via IPP" and "Pay via Card" buttons — only "Generate PaySME Code" remains on the first screen
- **Paycode success screen**: "Pay via IPP" and "Pay via Card" buttons now appear only after code generation
- **Pay via Card integration**: Clicking "Pay via Card" on the success screen initiates the Adumo Online card payment gateway flow (server-side JWT, form POST redirect to Adumo payment page)
- **Adumo edge function**: New `adumo-card` edge function handles JWT generation, webhook receipt/validation, transaction status updates, and merchant notification forwarding
- **Webhook flow**: Adumo webhook validates JWT signature, updates transaction to `paid`/`failed`, and forwards notification to merchant's registered webhook URL

## v1.0.0 — 2026-02-23

### Initial Release

- **Static Mode** (`PaySME.init()`): Open payment modal with pre-set amount, invoice ID, and product name
- **Dynamic Mode** (`PaySME.create()` / `.open()`): Customer selects amount and product inside the modal
- **Payment Modal**: Dark gray branded popup overlay matching PaySME design system
  - Business name heading
  - Invoice ID, Amount (N$), and billing type info block
  - Email Address and Mobile Number input fields
  - Three action buttons: Generate PaySME Code (blue), Pay via IPP (yellow), Pay via Card (white)
  - "Powered by PaySME" logo footer
  - Close (X) button
- **Paycode Display**: After code generation, shows code with copy button, instructions, and alternative payment options
- **Callbacks**: `on_success`, `on_error`, `on_cancel` for full merchant control
- **Redirect**: Optional `redirect_url` parameter for post-payment navigation
- **Recurring Support**: Optional recurring billing with period selection
- **Central Control**: All modal UI rendered from hosted SDK — merchants never own modal HTML/CSS
- **CORS**: Full cross-origin support for any merchant domain
