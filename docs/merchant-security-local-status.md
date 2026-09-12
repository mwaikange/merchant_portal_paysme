# Merchant domain, security and PWA release notes

## Implementation status

The local application now contains:

- A dedicated three-field merchant login for `merchant.paysme.site` using the existing PaySME merchant imagery and branding.
- Environment-aware merchant/public origins and a safe old-route migration. Public signup, customer checkout, payment callbacks and vendor routes remain on the public site.
- A Security & Access page for owners/admins with Approved Networks, Staff Access and Security Activity cards.
- Real Supabase TOTP and phone-factor MFA enrollment, verification, removal protection and AAL2 login gating. Staff must enroll and verify MFA before merchant-data access.
- Action-bound, payload-bound, two-minute, single-use backend approvals for every Security & Access change.
- Organisation-scoped owner/admin/staff membership, transactional four-staff enforcement, expiring invitations, resend, suspend, restore, role and remove controls.
- Database policies that enforce merchant isolation, staff route/data exclusions, MFA and approved-network access on direct merchant-table requests.
- An immutable security audit for network, staff, MFA, verification and blocked-access activity.
- A support-only, administrator-verified and audited network-lockout recovery function. There is no public bypass.
- An installable merchant PWA with a manifest, maskable icon, update handling and a network-required offline page. Its service worker does not cache API responses, merchant records, private documents, invoices, exports, credentials or financial actions.
- Sidebar wording/order updates: Request-to-Pay, then QR Payments; Tax settings remains between KYC and Profile settings.

All five merchant-security schema migrations were applied to the linked project only after the project owner explicitly authorised live database schema changes. The live schema, RLS flags, helper functions and recovery permissions were verified afterward. The `merchant-security` and updated `send-email` Edge Functions were deployed. No customer SMS or invitation was sent, no network restriction was enabled, and no merchant data was modified.

## Local preview and PWA installation

Run `npm run dev` and open:

- Merchant login: `http://127.0.0.1:8080/auth`
- Security & Access: `http://127.0.0.1:8080/portal/security-access`
- PWA entry: `http://127.0.0.1:8080/portal`

Chrome/Edge on the development computer permits service workers on localhost. Sign in, open Profile settings and use **Install PaySME**, or use the browser's install-app control. The intended production installation entry is `https://merchant.paysme.site/portal`; it will exist only after an approved HTTPS deployment.

## Required production configuration

1. In the same Vercel project, add `merchant.paysme.site`. Apply exactly the DNS record Vercel displays, wait for its certificate to become valid, and do not remove the existing domain.
2. Set Vercel production variables:
   - `VITE_MERCHANT_DOMAIN_ENABLED=true`
   - `VITE_MERCHANT_ORIGIN=https://merchant.paysme.site`
   - `VITE_PUBLIC_ORIGIN=https://www.paysme.site`
3. Keep the Supabase project Site URL compatible with the shared public/vendor flows. Add `https://merchant.paysme.site/**` to Auth Redirect URLs and keep the old callbacks through the transition. Also keep the exact localhost callback URLs used for development.
4. Set the Edge Function secret `MERCHANT_PORTAL_URL=https://merchant.paysme.site` and deploy the reviewed `merchant-security` and updated `send-email` functions.
5. Enable/configure the Supabase Auth phone MFA provider and its SMS provider. Configure OTP expiry, resend cooldown, attempt and provider rate limits in Supabase/Auth provider settings. TOTP uses Supabase Auth and needs no shared secret in browser code.
6. Verify that Supabase Edge receives Cloudflare's overwritten `cf-connecting-ip` header before enabling any network policy. The implementation never accepts a caller-provided IP field. If the trusted header is absent, enabled restrictions fail closed.
7. For recovery, support must verify merchant ownership outside the portal, record a ticket/reference, then invoke the service-role-only recovery function as an active `admin_users` identity. Recovery disables only that merchant's network restriction and writes an audit entry; it does not bypass MFA.
8. Existing sessions are origin-scoped and do not migrate between `paysme.site` and `merchant.paysme.site`; merchants must sign in again.

## Security boundaries

Merchant browser/PWA reads are protected by database policies; the `merchant-security` function separately authorises service-role mutations. Public checkout and payment-provider callbacks are intentionally outside the merchant-network policy and retain their own controls. A PWA installation is not proof that a device is company-owned.

Existing unrelated service-role Edge Functions must be audited before staff access is opened broadly. Any function returning merchant-private data must resolve organisation membership from the authenticated identity and apply the same MFA/network check instead of trusting a client merchant ID.

## Verification limits

- Type checking and production bundling can be run locally without sending messages.
- The browser login layout, navigation labels/order and unauthenticated route behaviour can be inspected locally.
- End-to-end MFA SMS delivery, invitation email delivery, trusted production IP propagation, concurrent database races and production PWA installation require configured providers or an isolated test environment. They have not been represented as completed tests.
- No recovery codes are exposed in the UI because Supabase phone/TOTP MFA does not provide one-time recovery codes here. Recovery is the documented verified-support process and does not silently bypass network restrictions.
- Do not enable network restrictions or invite real staff until the production checklist and service-role function audit are complete.

The Supabase schema and required Edge Functions are deployed. Frontend deployment is managed separately through the public and standalone merchant Vercel projects.
