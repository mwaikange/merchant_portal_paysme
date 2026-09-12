# Merchant portal repository coordination

- This is the standalone PaySME merchant portal deployed at `merchant.paysme.site`.
- Every merchant-portal code change must also be mirrored in `mwaikange/pay-sme-flow-creator` before either repository is pushed.
- Before pushing, verify both repositories are aligned for shared portal files and run their relevant checks.
- Public website registration remains at `https://www.paysme.site/signup`; merchant sign-in and protected portal routes remain in this application.
