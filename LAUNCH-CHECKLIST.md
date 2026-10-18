# Crown the Game: launch checklist

## 1. Files (all in the repo root, replacing the old ones)
`api.mjs`, `questions.mjs`, `index.html`, `app.js`, `admin.html`, `admin.js`, `netlify.toml`, `package.json`
(`questions.mjs` holds all 1,000+ questions. Add new ones at the bottom of that file. `netlify.toml` now also copies it into the function, so upload the new `netlify.toml` too.)

## 2. Netlify environment variables
| Name | Notes |
|---|---|
| `ADMIN_KEY` | **NEW and required.** 32+ random characters. Also signs login codes. The contest will not start without it. |
| `RESEND_API_KEY`, `MAIL_FROM` | Email provider (or use the SMTP_* variables instead). If neither is set, login now fails instead of silently logging codes. |
| `OWNER_EMAIL` | Where cash-out requests are emailed. |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Cloudflare bot check (free). Both must be set; with only one or neither, the check stays OFF. Remove the secret key to switch it off in an emergency. |
| `MAIL_HOURLY_CAP` | Optional, default 200 emails/hour (circuit breaker against email abuse). |

## 3. One-time, on your computer
Run `npm install` in the project folder and commit the `package-lock.json` it creates. This pins exact dependency versions.

## 4. After deploying
1. Open `https://YOUR-SITE/admin.html` and sign in with ADMIN_KEY.
2. Check "Setup check": email should say `resend` (or `smtp`), **Bot check must say `ON`**, and **Safe concurrent writes must say `working`**. If it says NOT WORKING, update `@netlify/blobs`.
3. Play a practice game, sign in with your own email, and confirm the code email arrives.

## 5. Every contest Tuesday
Open `/admin.html` after 10:05 PM ET: review winners (look for "answers very fast" or shared-network flags), pay cash-outs in Cash App/Venmo, click **Mark paid**.

## 6. Do before heavy promotion
- **Skim the questions.** The bank has 1,000+ questions (336 reserved for the contest). They are checked for duplicates and formatting, but not fact-checked against sources. Report any wrong ones and fix them in `questions.mjs`.
- Keep adding questions every few weeks so shared answers on social media go stale.
- Keep prizes small and keep reviewing winners. No online trivia can stop a person from searching or using AI inside 10 seconds; the server timer and review flags limit it, not eliminate it.
- Have a lawyer glance at the Official Rules (cash prizes, age check, tax reporting).
