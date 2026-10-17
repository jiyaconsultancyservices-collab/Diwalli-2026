# TTC Crackers order backend

## Administrator

Open https://jiyaconsultancyservices-collab.github.io/Diwalli-2026/admin.html and sign in with **jiyaconsultancyservices@gmail.com** using Google. Other accounts cannot read order documents. The dashboard lists customer name, phone, delivery address, pincode, requested items, total, timestamp, and status. Phone numbers are tap-to-call. Search and status filters operate on loaded orders; load older pages as needed. The latest 100 update live.

Orders are **requests, not payments or guaranteed stock reservations**. An order is saved before WhatsApp opens. The customer must still press Send in WhatsApp. The app cannot detect whether they actually send that message; verify with the customer before confirming. Review catalogue prices and availability. Browser-provided prices are not authoritative; this is not a payment backend.

## Checkout and numbering

- Firebase project: `ttc-crackers-orders`; Firestore Standard database, Mumbai (`asia-south1`). No billing-plan upgrade or paid feature was enabled.
- New backend numbering starts at `TTC-100`. Existing WhatsApp-only orders are not automatically imported and may have overlapping legacy browser-local numbers. Use the order date/customer to distinguish them.
- Authenticated anonymous checkout sessions atomically create an order, increment a shared counter, and create a receipt. Orders are private; only the submitting session can read its non-sensitive receipt.
- Unchanged checkout retries reuse the receipt and ID. A changed cart/customer or **Start a new order** creates a new request. This is per browser session: clearing site data or using another device cannot deduplicate a previous request.
- Order saving fails closed: a database failure does not silently send an untracked WhatsApp message. The basket remains available to retry.
- Customer details are remembered locally for convenience, as in the original store. The new draft marker stores only a hash, random submission ID and anonymous UID, not an additional copy of the address.

## Security and operating limits

Firestore rules enforce the verified Google email and Google provider on all order reads/status updates. Admin can change only status and server timestamp, not customer details or totals; deletion is disabled. Checkout cannot list/read orders, change saved requests, forge status, reset the counter, or allocate an ID without a matching order and receipt. All admin-rendered customer/item strings use text nodes, never HTML.

Client order validation checks quantities and totals; security rules validate the customer fields, top-level order schema, timestamp and atomic numbering. Rules do not verify individual product prices against a server catalogue. Treat incoming requests as untrusted and confirm prices manually. Public anonymous submission is not abuse-proof; monitor Firebase usage and cancelled/spam requests. App Check/rate-limited server processing are not enabled. For high traffic or automatic payments, add an authoritative catalogue, server validation and abuse protection first. Firebase free-plan quotas apply.

The Firebase web configuration is intentionally public and grants no admin access. Never add service-account keys, OAuth secrets or CLI login files to this repository. Admin sign-in uses session persistence and clears the visible customer data on sign-out. Sign out on shared devices.

## Development and deployment

Requires Node **24.12+** and Java **21+** for local tests. Static store needs no build.

```sh
npm ci
npm test
npm run test:rules
firebase login
firebase deploy --only auth,firestore:rules --project ttc-crackers-orders
node scripts/initialize-counter.cjs
```

`initialize-counter.cjs` refuses to reset existing numbering or initialize over existing orders. Never manually lower or reset the live counter.

Authorized Firebase Auth domains include `jiyaconsultancyservices-collab.github.io`, `ttc-crackers-orders.firebaseapp.com`, `ttc-crackers-orders.web.app`, `localhost`, and `127.0.0.1`. Google auth redirects through the Firebase auth handler. Preview via HTTP (not `file://`) to load JavaScript modules. Publish the static files by pushing main to the existing GitHub Pages repository. Tests use the **demo-ttc-orders** emulator, not the live project; no WhatsApp messages are sent.

Rollback: revert the frontend commit to return to the previous WhatsApp-only checkout. Keep production rules locked down and leave stored orders and the counter intact. Do not deploy the old prototype public-create rules.
