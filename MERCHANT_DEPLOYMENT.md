# PaySME Merchant Portal deployment

This repository is the standalone application for `https://merchant.paysme.site`.

## Vercel

1. Import `mwaikange/merchant_portal_paysme` as a new Vercel project.
2. Use the Vite framework preset, `npm run build`, and output directory `dist`.
3. Add the custom domain `merchant.paysme.site` and use exactly the DNS record Vercel provides.
4. Configure these environment variables:
   - `VITE_SUPABASE_PROJECT_ID`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_MERCHANT_STANDALONE=true`
   - `VITE_MERCHANT_DOMAIN_ENABLED=true`
   - `VITE_MERCHANT_ORIGIN=https://merchant.paysme.site`
   - `VITE_PUBLIC_ORIGIN=https://www.paysme.site`
   - `VITE_PHONE_MFA_ENABLED=false` (change only after activating Supabase Advanced Phone MFA)
5. Do not place a Supabase service-role key or SMS-provider secret in a `VITE_` variable.

## Supabase Auth

Add `https://merchant.paysme.site/**` to the project's allowed redirect URLs. Keep the existing public/vendor redirects. Existing sessions on `paysme.site` will not move to the new origin, so merchants sign in again.

The public website owns merchant registration at `https://www.paysme.site/signup`. The merchant application owns sign-in, password recovery, MFA and protected `/portal/*` routes. Public checkout and vendor flows remain on the public application.
