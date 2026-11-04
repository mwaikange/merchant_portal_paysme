# Merchant portal repository coordination

- This is the standalone PaySME merchant portal deployed at `merchant.paysme.site`.
- Every merchant-portal code change must also be mirrored in `mwaikange/pay-sme-flow-creator` before either repository is pushed.
- Before pushing, verify both repositories are aligned for shared portal files and run their relevant checks.
- Public website registration remains at `https://www.paysme.site/signup`; merchant sign-in and protected portal routes remain in this application.
- Work efficiently: use the shortest viable path, avoid repeated diagnostics, and do not waste tokens. If permissions block completion, stop early and report the exact blocker and single next action.
- Whenever SDK behavior, payment methods, API contracts or the SDK version change, update the merchant-facing guide (`public/docs/PaySME_Payment_Modal_API_Integration.md`), regenerate and visually verify its PDF, update the SDK README/changelog and the portal documentation version/date/links in the same change. Cover changed setup, methods, parameters, callbacks, eligibility, errors and retries. Do not complete an SDK release with stale documentation; mirror these updates in both repositories before pushing.
- Commit and push completed authorized changes after the relevant checks pass, unless the user requests otherwise.
- Stay within the user's requested task. Avoid unrelated investigation, extra features, repeated diagnostics and unnecessary token use. Make the smallest complete change, run targeted checks, keep updates brief, and finish the task.
