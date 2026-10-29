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

## Production setup (not yet completed)

1. Provision a **new dedicated** Supabase project for Invoice Studio. **Do not** use another venture's database. Confirm any paid plan or resource costs before provisioning.
2. Run `supabase/schema.sql` using the Supabase SQL editor against the new project, after reviewing schema and security policy. Check the security advisors and verify RLS using two unrelated test users. The SQL has not yet been applied to a live database.
3. Set `config.js` to the project's public URL and **publishable** (not secret/service-role) key. The blank committed template displays a setup-required screen; it deliberately prevents collecting customer records until the backend is configured.
4. Configure Supabase Auth → Email + Confirm Email; configure custom SMTP (the default sender is rate limited). Set Site URL and allowed Redirect URLs to the final HTTPS domain and localhost for development.
5. Configure Google OAuth in Google Cloud and enable Google in Supabase Auth. Add the project's Supabase OAuth callback URL to Google's authorized redirect URIs. Google login will not work until provider credentials are configured.
6. Deploy `supabase/functions/username-login/index.ts` with `verify_jwt=false` and `ALLOWED_ORIGINS=https://YOUR_APP_DOMAIN`. Keep the service role and anon keys only in the Supabase Edge Function environment. Confirm 5-attempt/15-min username-login rate limiting and invalid login responses. Consider CAPTCHA and abuse monitoring before large public launch.
7. Deploy static files from repository root on Cloudflare Pages (build command: none; output dir: `.`) or another HTTPS host. Configure a custom domain and HTTPS. Do not go live until authentication and privacy tests pass.
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

Application files and backend schema are provided in GitHub. Local JavaScript syntax checks and browser UI tests were performed with a mock backend. **Live database migrations, real signup/login, cross-user synchronization, email delivery, production hosting and Google OAuth have not yet been configured or validated.** Do not market as a live production SaaS until those pass.