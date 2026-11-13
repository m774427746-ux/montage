# ASBARIX Monitoring

Scheduled GitHub Actions that watch https://asbarix.vercel.app and email **adv.asbar@gmail.com** through Resend.
Timezone for email timestamps: Asia/Riyadh. Cron schedules in GitHub run in UTC.

| Workflow | Schedule (UTC) | What it does |
|---|---|---|
| `monitor-health` | every 15 min | HTTP->HTTPS, `/login`, its assets, `/`, `/api/health` (Redis PING), 401 on protected APIs, SSL expiry. Alerts after **2 consecutive** failures, one email per outage, one recovery email. |
| `monitor-ops` | every 6 h | Latest Vercel production deployment state (needs `VERCEL_TOKEN`), failed GitHub Actions, 5xx probes, response time vs 7-day median. |
| `monitor-security` | daily 02:23 | `npm audit`, security headers, CORS, anonymous access to protected routes, secret-pattern scan (file + type only, never values), exposed files. |
| `monitor-weekly` | Sunday 05:00 | `npm test` + build of the production branch, audit summary, weekly email (always sent). |

All probes are read-only single GETs. No writes, no login attempts, no load.

## Required GitHub settings (Settings > Secrets and variables > Actions)

| Name | Type | Required | Notes |
|---|---|---|---|
| `RESEND_API_KEY` | Secret | **yes** | Resend dashboard > API Keys (sending access is enough). |
| `VERCEL_TOKEN` | Secret | recommended | Vercel > Account Settings > Tokens, scoped to team `m774427746-ux's projects`. Without it the ops check skips Vercel. |
| `MONITOR_FROM` | Variable | for non-owner delivery | e.g. `ASBARIX Monitor <alerts@your-verified-domain>`. Default `onboarding@resend.dev` only delivers to the Resend account owner's own email. |
| `ALERT_EMAIL` | Variable | no | Defaults to `adv.asbar@gmail.com`. |
| `PROD_REF` | Variable | no | Branch the daily/weekly checks audit. Default is the current production branch; set to `main` once production is merged into `main`. |

## Prove it works (before trusting it)

```bash
node scripts/monitor/selftest.mjs                              # logic only, mock Resend, sends nothing
RESEND_API_KEY=... node scripts/monitor/selftest.mjs --real    # sends real emails (1 alert + 1 recovery) to ALERT_EMAIL
```

The self-test runs a local fake site: healthy, 1 failure (no mail), 2nd failure (one alert), more failures (no duplicates), recovery (one mail).
After merging, also run each workflow once from Actions > Run workflow.

## Production safety

`main` is Vercel's production branch but is far behind the code that is live (production is deployed from `codex/*` branches).
`vercel.json` on `main` therefore sets `git.deploymentEnabled.main = false`, so merging monitoring files into `main` cannot redeploy old code.
Before merging the live code into `main` later, check the Vercel dashboard first: that merge will bring its own `vercel.json` and re-enable deploys of `main`, which is then correct because `main` will equal production.
Never promote or roll back to a deployment older than `dpl_9QnqU1hP8eQdjBHzmseifXQEQsa4` without checking.

## `api/health.js`

- GET/HEAD only; returns `{ok, redis, ms}`; runs only `PING`; no keys, values or env data.
- Adds one serverless function (now 11 under `api/`, Hobby limit is 12). Do not add another without merging handlers (as was done for `manage`/`prices`).

## Hardening plan (not applied: each can break the site)

Findings from the daily scan: no `Content-Security-Policy`, no clickjacking protection, `npm audit`: `exceljs`/`uuid` moderate.

1. **Clickjacking (low risk, do first).** No `<iframe>` exists in `src/`. Add `X-Frame-Options: DENY` and `frame-ancestors 'none'` to `vercel.json` headers. Verify on a preview: login, admin, scanner, designer open normally.
2. **CSP in Report-Only (no break risk).** `app.html` and `acrylic-tools.html` have one inline `<script>` each and inline `<style>`; the build also injects an inline script. Start with `Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` and watch the browser console on a preview for a week.
3. **Enforce CSP** after a clean week. Later, move inline scripts to files or add nonces to drop `'unsafe-inline'`.
4. **Permissions-Policy** (`camera=(self)` is likely needed by the barcode scanner: test scanning before enabling; `microphone=()`, `geolocation=()` are safe).
5. **exceljs/uuid.** Fix needs a semver-major `exceljs` upgrade: do it in a branch, run `npm test`, then test Excel import/export (`/api/admin-excel`) by hand on a preview before production.
6. **`url.parse()` deprecation** (99 runtime warnings/7d from `/api/manage`, `/api/prices`): harmless today, comes from a dependency or Node runtime path; revisit after the exceljs upgrade.
