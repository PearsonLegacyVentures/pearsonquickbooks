# Invoice Studio — free invoicing with user accounts

A standalone, mobile-first invoicing web application for small businesses, developed by Bahamas AI Solutions. Source repository: `PearsonLegacyVentures/pearsonquickbooks`.

## Features built

- Email/password registration, email verification and reset; Google OAuth; selected username (username sign-in via rate-limited Edge Function)
- Multi-business accounts and multiple teammates per business (owner, admin, editor, viewer)
- Server-enforced workspace isolation via Postgres RLS and secure RPC functions
- Cloud persistence with revision checks: concurrent edits are rejected instead of silently overwriting data
- Customers, reusable products/services, estimates, conversion to invoices, invoices, partial/full payments, expense categories
- Configurable business identity (logo, name, address, tax ID, contact details, website), tax, currency, invoice numbering, default terms and bank/payment instructions
- Branded printable invoices and PDF via the browser's Print / Save PDF
- Branded printable management reports: income/expense summary, aging receivables, expense detail, invoiced tax and payments
- CSV and JSON backup/restore; mobile-first dashboard

**No paid subscriptions or invoicing limits are imposed in the code.** Production capacity depends on the service tiers and infrastructure paid for by the operator. The app is not a full accounting/general-ledger system; statements are management summaries, not audited accounts.

## Production setup and current progress

1. **Done:** Dedicated Supabase project `zjroclvywetevksdbfjd` in Pearson Legacy Ventures, US East, created at quoted $0/month, distinct from all other businesses.
2. **Done (structural only):** `supabase/schema.sql` was applied to this project using migration `initial_invoice_studio_multi_tenant_schema`; public table RLS is enabled. Authenticated cross-workspace tests with real users and advisor remediation review remain required.
3. **Done on development branch only:** `config.js` contains the project's public URL and publishable key. The `main` production branch remains deliberately unconfigured until end-to-end checks pass.
4. **Pending:** Configure Supabase Auth → Email + Confirm Email; custom SMTP; Site URL `https://finance.bahamasaisolutions.com` and allowed Redirect URLs covering both `https://finance.bahamasaisolutions.com/**` and `https://pearsonquickbooks.pages.dev/**`, plus the development preview origin.
5. Configure Google OAuth in Google Cloud and enable Google in Supabase Auth. Add the project's Supabase OAuth callback URL to Google's authorized redirect URIs. Google login will not work until provider credentials are configured.
6. Deploy `supabase/functions/username-login/index.ts` with `verify_jwt=false`; default origin allowlist uses the verified finance domain and Pages hostname, and `ALLOWED_ORIGINS` environment setting can override it. Keep service role and anon keys only in Supabase Edge Functions. Test rate limiting and add CAPTCHA/abuse monitoring before public launch.
7. **Existing, not yet updated:** Cloudflare Pages `pearsonquickbooks`, production domain `https://finance.bahamasaisolutions.com` (GitHub `main`). Preview builds run on development branches. Do not promote backend config to `main` until authentication/security tests pass.
8. Before onboarding customers: test registration/confirmation/reset/Google login, username login, invitations, viewer restrictions, cross-tenant RLS, concurrent edits, expired invites, record exports, PDF print on iOS and desktop, backups, alerts, accessibility and load handling.

## Local preview

`python3 -m http.server 8000` — open http://localhost:8000. Without Supabase configuration you will see the setup-required screen. There is no hard-coded demo login or bypass for production. `tests/qa_browser.py` tests the interface with a local mock cloud layer (not a live backend).

## Design/security notes

- Server uses a per-workspace JSON document for version 2 to preserve compatibility with the existing static app. A revision check prevents silent last-write-wins. This approach is suitable for an early release but **not** high-volume simultaneous edits, full double-entry bookkeeping, or large datasets. Normalize customers/documents/payments into independent tables, add an immutable audit log and server-side invoice sequence allocation before launching at scale.
- Supabase providers keep credentials; app never handles Google secrets or stores user passwords itself.
- Username-password endpoint must be deployed with server-side rate limits and secrets. It does not expose user email addresses in its response.
- Edit permissions are enforced by database checks; frontend read-only states are additional user experience safeguards.
- JSON import intentionally replaces all workspace data after confirmation. Workspace members should coordinate restores; backups are essential.
- No card processing, automated sending, external billing gateways, recurring invoicing scheduler, bank reconciliation, journal ledger, inventory accounting, or automated tax filings.
- Public `config.js` contains only publishable values; NEVER commit Supabase service-role keys, Google OAuth client secrets, SMTP passwords or credentials.

## Status

The dedicated Supabase project and initial database migration are now live. Browser config is staged on `setup/supabase-accounts`, not promoted to production. Local JavaScript syntax checks/browser UI tests were performed with a mock backend. **Real signup/login, cross-user security testing, SMTP, Google OAuth and production app-to-database operation remain unverified.** Do not market as a live SaaS until those pass.