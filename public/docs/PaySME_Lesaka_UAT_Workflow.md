# Lesaka - supplier Excel test workflow

The required submission checklist is **PaySME_Test_Cases.xlsx**: **10 Voucher Status Check cases (TC-VS-001 to TC-VS-010)** and **8 Voucher Redemption cases (TC-VR-001 to TC-VR-008)**. Complete those 18 cases in each of the three cycles required by Lesaka's email. The additional website-guide cases are optional and never add submission requirements.

## Prepare this business

Save this business's staging credentials in its Lesaka card, open **Lesaka staging tests**, and upload its own voucher TXT file. Vouchers and results stay separate for each business. The first half of each denomination is allocated to automation; the other half remains available for manual/customer tests.

## Three ways to record

- **Payment modal / hosted page:** start the cycle's customer session and enter only the 16-digit voucher PIN in normal checkout. PaySME captures references and responses in the background and maps demonstrated calls to the matching Excel IDs. Use a new checkout when testing a different voucher. Repeating a completed checkout returns the earlier result without another redemption or test pass.
- **Manual portal tests:** choose a required Excel ID and run the case. Blank and too-long-PIN cases generate controlled invalid requests; normal checkout still accepts exactly 16 digits. The optional 15-digit website-guide case is available separately.
- **Automatic tests:** run the 18 required Excel cases that have not passed. Automation uses only its allocated half, blocks cases lacking suitable fixtures and stops for uncertain outcomes.

## Dedicated technical checks

Choose **Technical checks** for valid-serial enquiries, unknown PIN/serial, blank PIN/serial, too-long PIN and blank/unknown redemption inputs. Run a selected case, all eight technical workbook cases for the selected cycle, or all three cycles. Passed results are reused; new requests receive their own cycle, client reference and captured response. The optional 15-digit case is also available but does not change the Excel completion requirement.

This route is restricted server-side to serial enquiries and fixed synthetic inputs. It cannot redeem a supplied voucher, even if a caller submits a real-redemption case ID. Normal payment-modal and hosted-checkout validation stays strict. The other voucher cases remain available through normal checkout and manual portal tests.

## Pass criteria

A case passes when its captured result matches the Excel's business outcome. Equivalent vocabulary is displayed explicitly: **New = Active**, **Redeemed = Consumed**, **Spoilt = Reversed**. Valid PIN/serial validation errors do not require the website guide's extra business code 5005. An explicit supplier response saying **Voucher is not in a redeemable state** satisfies a matching negative redemption case; its actual HTTP status and business code remain visible in the evidence.

The recorder reassesses already captured responses without sending more voucher requests. Previous assessments and source execution IDs are retained. A redeemed-status case needs its real redemption date/time and reference, using captured PaySME redemption history when available; missing metadata is never invented. Missing product information, unsuitable fixtures, network failures and uncertain financial outcomes are not marked passed.

## Submission

Each cycle shows **Excel: x/18 passed**. When all three reach 18/18, the results are ready to download and submit. **Download Excel** includes a cover, Status and Redemption tabs for each cycle with the supplier's original case IDs, descriptions, prerequisites, steps and expected-result columns, followed by Actual Result, Client Reference and Pass/Fail. Separate supporting tabs retain optional checks, customer attempts and redacted technical evidence, including receipt IDs and trace IDs. CSV and full JSON remain available. **Download required Excel cases CSV** is an additional submission export containing only the original 18 Excel IDs for each of three cycles (54 rows), with expected/actual results, references and pass/fail; optional website-guide cases are excluded.

Expired, reversed and unsupported-product fixtures are still needed for their corresponding Excel IDs. A cancelled-voucher scenario from the website is optional and does not replace a reversed-voucher Excel test.

## Live activation and cleanup

After the 18 Excel cases pass in all three cycles, export the evidence, obtain Lesaka's approval, save live credentials separately and use the Lesaka card's Live switch. No SDK upload or URL change is needed. Live activation and cleanup refuse unresolved payments. Test checkouts remain permanently excluded from live settlement and reporting; cleanup removes only this business's test campaign and voucher inventory.
Selecting a cycle tab does not reassign existing customer checkouts. If a different cycle's session is active, the portal blocks new checkout buttons and asks you to start customer testing for the selected cycle. Create a new checkout after switching; older links and results retain their original cycle.
