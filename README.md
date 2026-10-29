# Invoice Studio — free, offline-first invoicing MVP

Standalone web application. No Node, backend, paid account, or API keys required to run.

## Launch

Open `index.html` in Chrome, Safari or Firefox on desktop, or host this folder on any HTTPS static host such as Cloudflare Pages. For reliable browser storage and mobile PWA installation, use an HTTPS origin (or localhost).

For local development:

```sh
python3 -m http.server 8080
# visit http://localhost:8080
```

## Included

- Dashboard with billed, paid, outstanding and overdue figures
- Customers with contact and optional tax ID
- Products and services catalog with prices, units, categories, taxability
- Draft, sent, partially paid, paid and overdue invoices
- Estimates, accepted/declined status, convert estimate to invoice
- Invoice editor with line items, discount, configurable tax, notes, due date
- Invoice payments (partial and full) and outstanding-balance tracking
- Professional printer-friendly invoices: use **Print / Save PDF** to save via the browser's PDF printer
- Email and WhatsApp message handoff (user attaches PDF manually)
- Expense entry and income/expense summaries, CSV exports
- Business profile, logo, tax ID, numbering, currency, payment instructions
- JSON backup and restore (download backups regularly)
- Installable mobile-first PWA and offline asset cache on HTTPS

## IMPORTANT: Scope and limitations

This is a **single-device, locally stored MVP**, not a hosted SaaS or full accounting platform. Data remains in the browser's localStorage and is **not** backed up automatically, synced between devices, encrypted at rest by this app, or recoverable after browser storage is cleared. Never use private/incognito mode for permanent records. Download a backup before changing browsers or devices. Treat imported backup files as sensitive.

Automatic emails, customer portals, payment gateways, automated recurring invoicing, login/team access, inventory stock management, and cross-device sync are NOT implemented. Email/WhatsApp actions create message drafts but do not attach a PDF or send anything automatically. Print / Save PDF invokes browser printing.

VAT/tax calculation is configurable and disabled by default. It is not a compliance certification: check local invoice requirements, registration status, and tax rules before using generated invoices as official tax documents. Income vs expenses is informational only, not a formal P&L or cash-basis accounting statement.

## Deployment

Upload the entire folder to Cloudflare Pages as a static site. No build command; output directory `/`. Before a public multi-user launch, add server-side auth, RLS-isolated database persistence, backups, and security/compliance testing. Do **not** market the browser-only version as synchronized/cloud-hosted or as a secure multi-user service.

## Files

- `index.html` application shell
- `app.js` all business logic and rendering
- `styles.css` UI and print styles
- `manifest.webmanifest`, `sw.js`, `icon.svg` installability/offline support

License: private prototype until ownership and licensing are decided.