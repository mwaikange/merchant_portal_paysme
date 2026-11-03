# PaySME Lesaka — Three-cycle UAT workflow

Updated 3 November 2026. SDK version remains **1.12.0**.

This private recorder is available only to the approved PaySME merchant account in **API & integration > Lesaka test recorder**. It uses the staging credentials saved in that account's Lesaka credential form. Provider usernames and passwords remain on the server. The public SDK and hosted checkout receive no provider credentials.

## Start and record a case

1. Open **API & integration** and select **Open the three-cycle test recorder** below the Lesaka credentials.
2. Create the campaign if one does not exist. Import the original, unmodified Lesaka voucher text file if the inventory has not already been loaded.
3. Choose **Cycle 1**, **2**, or **3**, then select the workbook or website test case.
4. Choose **My reserved manual vouchers** for your own tests. Select a voucher by its label and line number in the original file. Enter its PIN when requested. PINs from your reserved allocation are not stored by the recorder.
5. Read the expected result and any review note. Redemption cases require explicit confirmation because a successful call consumes a voucher. Select **Run and record test**.
6. Read the recorded verdict and evidence. Add an observation if needed. Notes preserve your observations and do not change the automated verdict.
7. Download **results CSV** to view in Excel and **full evidence JSON** for detailed request/response records. Export after each cycle and retain the final report for Lesaka.

There are 30 checklist entries per cycle: 18 cases from the supplied workbook and 12 from Lesaka's published UAT page. Overlapping cases retain their separate supplier IDs. Earlier attempts remain in the export. The cycle tabs show the 12 mandatory guide cases; all 18 workbook checks remain in the checklist and exports. Guide completion is reported separately from full checklist completion. All supplier-required entries and three successful cycles are required for sign-off. PaySME automation runs Cycle 1; the operator runs Cycles 2 and 3. The recorder does not grant production approval.

## Voucher allocation

The original order is fixed by an approved file checksum. For **each denomination**, automation receives only the first `floor(count / 2)` vouchers. The remaining vouchers are reserved for manual testing and cannot be selected by automated calls. The current pack allocates 40 vouchers to automation and reserves 41 for manual tests. Importing the file does not redeem vouchers.

The recorder stores encrypted PINs only for the automated allocation. It stores labels, serial numbers, source line numbers and non-reversible keyed fingerprints for the manual allocation. Manual PIN entry is cleared after a run. Keep the original file private.

A fixture must have the state required by its case. The recorder checks status before a redemption and blocks an incompatible fixture rather than redeeming it to manufacture the expected error. Expired, cancelled, reversed, consumed and unsupported-product cases may need separate fixtures from Lesaka. Successful redemptions require fresh Active vouchers. Do not assume the initial pack contains every state needed for three cycles.

## Evidence, retries and results

Every execution records its cycle, case ID, execution ID, client reference, request time, timestamps, HTTP status and redacted request/response evidence. Provider receipt IDs and trace IDs are retained when returned. PINs, authentication headers and provider credentials are removed from evidence and exports. Requests, status prechecks and post-redemption checks remain associated with the same execution.

A timeout or uncertain redemption remains **Uncertain**. Use **Retry original execution**, with the same selected voucher and manual PIN if required. The server preserves the original redemption reference and request time. Do not start a new redemption to resolve an uncertain one. Interrupted executions can be resumed after their running lease expires; their saved intent remains available.

The idempotency case selects an earlier successful redemption from the same cycle and fixture and reuses its original request. It verifies the original provider receipt and zero remaining balance.

**Passed**, **Failed**, **Needs review**, **Blocked**, **Uncertain**, **Error**, and **Running** are distinct states. A failed or blocked attempt stays in history even after a later attempt passes. A note cannot create a pass. CSV includes every attempt and all unrun checklist entries; JSON includes the checklist, case definitions, safe inventory metadata, observations and detailed evidence.

## Supplier questions that can block sign-off

- The workbook uses New, Redeemed and Spoilt while the API schema uses Active, Consumed and Reversed. Confirm the mapping with Lesaka.
- Some workbook assertions require product or redemption metadata absent from the published response schema. A successful HTTP response alone does not prove those assertions.
- Published negative cases sometimes expect HTTP 403 while the API documents HTTP 409 for business conflicts. Matching business errors under a different status remain for review.
- Validation responses can use a validation-problem body rather than error code 5005. Preserve the actual response for clarification.
- Website TC-RED-05 asks for over-redemption, but the published redeem request has no amount field and supports full redemption only. The recorder records this case as blocked without inventing an API field or consuming a voucher.

Ask Lesaka to confirm amended expectations or provide the required fixtures. The recorder deliberately keeps these entries incomplete until the requirements are resolved.

## Separation from real payments

This workflow calls only the fixed Lesaka staging host and is independent of payment transactions. It does not mark a checkout paid, credit a merchant balance, send payment-success SMS messages or trigger merchant payment webhooks. Real SDK and hosted-checkout behavior remains documented in the [API integration guide](./PaySME_Payment_Modal_API_Integration.md).

The private Edge Function authenticates the signed-in user and checks merchant API permission. It also requires the enabled flag, the allowlisted PaySME merchant ID and the staging environment. Its database tables are inaccessible directly to browser roles. Server settings are `LESAKA_UAT_ENABLED`, `LESAKA_UAT_MERCHANT_ID` and `LESAKA_UAT_INVENTORY_SHA256`; existing credential encryption and fingerprint secrets remain unchanged. The merchant's saved credential version is bound to its campaign; changing credentials requires a new campaign.

## Supplier references

- [Integration guide](https://lesaka-adp-4allvoucher.apidocumentation.com/guide/integration-guide)
- [API reference](https://lesaka-adp-4allvoucher.apidocumentation.com/lesaka-4-all-voucher-api#description/introduction)
- [UAT cases](https://lesaka-adp-4allvoucher.apidocumentation.com/guide/uat-test-cases)
- [Error codes](https://lesaka-adp-4allvoucher.apidocumentation.com/guide/error-codes)
- [Reporting](https://lesaka-adp-4allvoucher.apidocumentation.com/guide/reporting)

Lesaka's email requires a minimum of **three successful test cycles**, executed in staging. Submit cycle number, case/execution reference, date and time, and request/response evidence. Daily provider reconciliation reports use major currency units, while API `minor` amounts use cents. The recorder's evidence is a UAT record and does not replace the supplier's settlement report.

## Read-only inventory discovery

An authorized operator can use the private recorder's `inspect` action to query a stored voucher by its 12-digit serial number, including vouchers reserved for manual testing. This action is fixed to the staging **status** endpoint, accepts only an inventory fixture ID, never submits a PIN and cannot call redemption. Validated states update the inventory labels used by the recorder; discovery evidence is retained in the operator's exported status scan. It does not count as a mandatory UAT case execution. Automated **redemption** remains restricted to the original first-half allocation.
