# Studio release regression checks

Use Node 22 or newer. From the repository root:

```sh
npm ci --prefix tests/sprint
node --experimental-vm-modules --test tests/importer.test.mjs tests/sprint/*.test.mjs
```

Tests use synthetic accounts and mocked generation responses. They do not send SMS, charge credits, or change customer records. Coverage includes paid/free/guest initialization, email and SMS controls, safe phone linking, account-scoped draft lifecycle, result recovery, Quick Save outcomes, mobile marketplace handoff, allowance hints, import redirects, and preservation of the existing Studio and Back Room controls.

Real-device release check: sign in using an existing email account, link its phone in Plan, receive and verify a code, then sign out and sign in using that phone. Confirm the same plan and saved drafts return. Also complete Quick Save in iPhone Safari and verify the selected photo destination and pasted title/description.
