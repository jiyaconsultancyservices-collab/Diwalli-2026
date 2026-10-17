TTC CRACKERS — DIWALI 2026
==========================

Store: https://jiyaconsultancyservices-collab.github.io/Diwalli-2026/
Admin: https://jiyaconsultancyservices-collab.github.io/Diwalli-2026/admin.html
Order WhatsApp: +91 93426 34197
Admin Google account: jiyaconsultancyservices@gmail.com

index.html           Store, catalogue, family combos and checkout
admin.html / admin.js Private Google sign-in and orders dashboard
order-backend.js      Authenticated order storage
order-core.js         Validation, numbering and WhatsApp message
firebase-config.js   Public Firebase web configuration (not a password)
firestore.rules      Server-enforced customer-data access controls
BACKEND.md           Setup, testing, numbering and operating notes
images/              Product and hero images

The storefront is hosted on GitHub Pages. Push changes to main to publish.
Use an HTTP preview server rather than opening index.html as a local file.
For backend tests and deployment, read BACKEND.md.

Orders saved in the dashboard are customer requests, not payments.
Customers still tap Send in WhatsApp. Confirm prices and availability.
Only new backend orders are recorded; old WhatsApp orders are not imported.
