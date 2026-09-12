# Admin Panel Payouts Implementation Prompt

Implement a new **Payouts** tab in the PaySME admin panel using the shared Supabase table `public.merchant_payouts`.

## Purpose

Paycodes can be paid through Card, WayaMe, MTC Maris, PayPulse, PayToday, or PaySME Vendors. This workflow is only for money collected through **PaySME Vendors** that PaySME must pay out to the merchant.

Do not mix `merchant_payouts.fee_amount` with the merchant portal's overall transaction-fee metric. The payout fee is only the fee attached to PaySME Vendor transactions included in that payout batch.

## Required Admin Workflow

1. Add a Payouts tab with Pending, Processing, Paid, Failed, and Cancelled views.
2. Read pending rows directly from `public.merchant_payouts`. Historical and future paid PaySME Vendor transactions are queued automatically by the database trigger, one payout row per source transaction.
3. Use `source_transaction_id` as the immutable link to `public.transactions`. Never create a second payout row for the same source transaction.
4. Group or select pending rows by merchant and payout period for review and export.
5. Show gross amount, PaySME Vendor fee, net amount, transaction count, source transaction, and covered date for every queued row.
6. Provide an Excel-compatible CSV/XLSX export for selected pending rows. Include payout ID, source transaction ID, merchant ID, business name, bank/payment details available to admin, period, gross amount, fee amount, and net amount.
7. After payment is completed in the third-party banking/payment system, allow admin to apply the same `payment_method` and `payout_reference` to all selected rows and mark them `paid`.
8. Updating `status` to `paid` automatically sets `amount_paid = net_amount` and `paid_at = now()` through the database trigger. Do not duplicate that calculation in multiple UI components.
9. Allow failed/cancelled states with a required admin note. Never automatically reset a paid or cancelled record to pending.
10. Record the authenticated admin user in `created_by` and `processed_by` where appropriate.

## Merchant Portal Contract

The merchant portal reads this table but cannot write to it. It uses the shared transaction-page date filters and displays:

- Total PaySME Vendor Sales
- Total PaySME Vendor Fees
- Total Due to You (Less Fees)
- Total Paid to Date

When a payout is marked paid, the merchant portal automatically reflects the paid amount and reduces the remaining amount due after its next data refresh.

## Security

Use the existing Supabase session and RLS. Admin access is granted only when `public.admin_users.auth_user_id = auth.uid()`. Never use the service-role key in browser code. Preserve all existing routes and admin authentication behavior.

## Deliverables

- Payouts tab and status views
- Eligible PaySME Vendor receivables query
- Create-payout batch flow
- CSV/XLSX export
- Mark-processing/paid/failed/cancelled actions
- Payment reference and audit fields
- Loading, empty, error, and confirmation states
- Focused tests for amount calculations, duplicate transaction exclusion, status changes, and export data
