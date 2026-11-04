# Lesaka staging tests for each business

Updated 4 November 2026. Compatible with SDK **v1.13.0**.

Open **API & integration > Facilitator Merchant Codes > Lesaka > Open Lesaka staging tests**. Each business has its own credentials, voucher file, campaign, three cycles and results. Portal API permission is required. Saved provider credentials never enter the SDK or exports.

## Upload the business's voucher file

Save the staging username and password issued to that business. Create its three-cycle campaign, then upload its original Lesaka `.txt` voucher file. The supplier format contains denomination headings such as `N$10` followed by `Serial Number, PIN` rows.

The file is the voucher list for that business and campaign. Its checksum fixes the uploaded order. For each denomination, the first `floor(count / 2)` vouchers are available to automatic checks and the rest remain reserved for manual/customer testing. Automatic PINs are encrypted. Reserved PINs are not stored: the server matches a customer-entered PIN using its keyed fingerprint and finds the serial number in the same business's inventory. No other business's inventory or credentials are used.

The PaySME pack already loaded contains 81 vouchers: 40 automatic and 41 manual. A read-only scan on 3 November found 80 Active and the one Consumed N$10 voucher used in Cycle 1; no Expired or Cancelled voucher was present. Other businesses upload their own packs.

## Three ways to test

### Customer payment modal or hosted checkout

1. Choose a cycle on the test page and select **Start customer testing**. A session lasts 24 hours and can be stopped earlier.
2. Choose an invoice amount whose final checkout total matches an unused test voucher. Open **payment modal** or **hosted checkout**, or use that business's existing PaySME payment button.
3. Complete the ordinary customer form, select Lesaka, and enter only the voucher PIN.
4. Return to the test page. The server records the checkout, its cycle, status enquiry, matching serial enquiry, redemption outcome, references, receipt IDs, trace IDs when returned, timestamps and redacted requests/responses. Results refresh when the page regains focus.

Retries retain the original redemption reference and original cycle for that checkout. A successful test displays a test confirmation and does not emit a paid callback or settle live money. The database marks these checkouts as tests and blocks paid status or a paid amount. They are excluded from live dashboard and transaction reports.

Only scenarios actually demonstrated by captured requests appear as passed in the guide checklist. A normal customer checkout cannot create missing-reference or over-redemption requests. Those cases remain available through the other testing methods; no success is inferred for them.

### Manual tests in the portal

Choose **Manual portal tests**, select a case and voucher, and enter the PIN for a reserved voucher when required. Confirm intended staging redemptions, then select **Run and record test**. Add a manual observation if useful. Notes do not turn a failed or uncertain result into a pass.

### Automatic API checks

Choose **Automatic tests**, confirm that staging vouchers may be redeemed, then select **Run automatic checks**. Only unrecorded guide cases are attempted. Automation uses its first-half allocation, records missing fixtures as blocked, and stops when a redemption outcome is uncertain. It never consumes reserved manual vouchers.

## Results and Excel

Each cycle has 12 mandatory guide cases; the 18 workbook cases remain available too. The page shows progress separately for all three cycles, customer checkout outcomes and prior attempts. **Download Excel** creates a current workbook with Cycle 1, 2 and 3 sheets, customer checkouts and technical evidence. CSV and full JSON are also available. `clientReference`, Lesaka receipt IDs and `traceId` have dedicated columns. A missing trace ID is left absent or labelled Not returned; none is invented.

Supplier-required special fixtures must really be Expired, Cancelled, Consumed or otherwise suitable. An Active voucher cannot prove a negative-state case. All requested cases and three successful cycles require supplier approval before going live.

## Switch this business to Live

On the business's Lesaka card, expand **Live credentials and approval** and save the live username/password supplied by Lesaka. They are stored separately from staging credentials and do not switch the environment by themselves.

After all 12 guide cases pass in each of three cycles, download Excel and full evidence. Enter the Lesaka approval reference and confirm that Lesaka approved the business's cycles and the evidence was exported. The **Use live Lesaka payments** switch then activates that business's live credentials. No SDK change, provider URL edit, Edge Function password replacement or website reconfiguration is needed.

Activation closes and removes the completed staging campaign. Test checkouts remain permanently marked as tests, are closed, and cannot become live payments. The business's approval timestamp/reference is retained as setup history. A business can return to staging using the same control; unresolved payments block an environment switch. Each other business follows its own onboarding and three-cycle process.

## Cleanup after testing

Stop customer testing and download the evidence. **Delete exported test results** removes that business's campaign, results, observations and voucher inventory. Running or uncertain outcomes must first be resolved. Cleanup closes pending test checkouts while retaining their permanent test marker; it never deletes or promotes live payment records. Successful completion is retained as a setup marker so live activation can happen after the detailed test results have been removed.

## Supplier issues already identified

- Validation can return HTTP 400 field-error ProblemDetails without business code 5005. Preserve the actual response for Lesaka's confirmation.
- The consumed-voucher negative case returned HTTP 502 / upstream business status 5008 rather than the guide's HTTP 403 / 5001. It remains unresolved, not passed.
- TC-RED-05 asks for an amount above the remaining balance, but the published redeem request has no amount field and supports only full redemption. It remains blocked until Lesaka clarifies the test.
- Workbook labels and some metadata expectations differ from the OpenAPI schema. Review results preserve those differences.

## Supplier references

- [Integration guide](https://lesaka-adp-4allvoucher.apidocumentation.com/guide/integration-guide)
- [UAT cases](https://lesaka-adp-4allvoucher.apidocumentation.com/guide/uat-test-cases)
- [API reference](https://lesaka-adp-4allvoucher.apidocumentation.com/lesaka-4-all-voucher-api#description/introduction)
- [Reporting](https://lesaka-adp-4allvoucher.apidocumentation.com/guide/reporting)

Backend operators enable UAT with `LESAKA_UAT_ENABLED` and customer checkout capture with `LESAKA_UAT_CUSTOMER_CHECKOUT_ENABLED`. The per-business integration mode selects the fixed staging or production host; credentials remain encrypted and scoped to that merchant/environment. The legacy PaySME inventory checksum remains pinned for its current pack. Private tables are accessed through authenticated Edge Functions, not directly by browser roles.
