# Tally — Your Setup Checklist (things only you can do)

This is your half of the handoff. The AI agent (whichever one helps you next)
can clone the repo, install tools, run the app, and push code — but it has
**no login access to Render, Vercel, Twilio, or OpenAI's dashboards**. Only
you can do the items below, because they require signing into accounts and
copying private keys that should never be pasted into an AI chat.

Give the other document, `TALLY_HANDOFF_AND_OPERATIONS_GUIDE.md`, to your
new AI agent. Keep this one for yourself.

## 1. GitHub — confirm repo access on the new machine

- Repo: `https://github.com/jeffriney619-stack/Tally` (public, branch `main`).
- On the new computer, sign into the **same GitHub account** (`jeffriney619-stack`)
  when Git/VS Code prompts for authentication on your first `git push`.
  - If you'd rather use a different GitHub account on the new machine, go to
    the repo's **Settings → Collaborators** and add that account first, or
    it won't have push access (the repo being public only lets others *read*
    it, not push to it).
- Nothing else to configure here — no keys to copy, no settings to change.

## 2. Render (hosts the live backend API)

Service: whatever you named it in Render — URL is
`https://tally-backend-jnc7.onrender.com`.

Log into [render.com](https://render.com) and open that service, then:

- **Environment tab** — confirm these are set (add any that are missing):
  | Key | Value |
  |---|---|
  | `JwtSecret` | A long random string (generate one, e.g. in a password manager). **Do not leave this unset** — the app currently falls back to a hardcoded, publicly-visible default if missing. |
  | `OPENAI_API_KEY` | Your real OpenAI key (see §4 below for where to get/rotate it). |
  | `CORS_ORIGINS` | `https://tally-frontend-orcin.vercel.app` (plus `http://localhost:5173` if you also want local frontend dev to be able to call the *production* backend, which is usually not needed). |
- **Disks tab** — check whether a persistent disk is attached and mounted
  over the backend's working directory (where `connected-budget.db` lives).
  - If **no disk is attached**: your production data may reset to whatever
    `connected-budget.db` is in the latest GitHub commit every time the
    service redeploys. Decide if that's acceptable, or ask your agent to
    help set up a Render persistent disk (this requires a paid Render plan
    on some tiers — check current Render pricing).
- **Deploys tab** — confirm it's connected to the `jeffriney619-stack/Tally`
  GitHub repo, branch `main`, and auto-deploy is ON. (It already was working
  before this handoff, so this should just be a quick visual confirmation.)

## 3. Vercel (hosts the live frontend)

Project: URL is `https://tally-frontend-orcin.vercel.app`.

Log into [vercel.com](https://vercel.com) and open that project, then:

- **Settings → Environment Variables** — confirm `VITE_API_URL` is set to
  `https://tally-backend-jnc7.onrender.com` (so the live site calls your
  real backend, not `localhost`).
- **Settings → Git** — confirm it's connected to `jeffriney619-stack/Tally`,
  branch `main`, auto-deploy ON.

## 4. OpenAI (powers the AI envelope assistant + transaction categorization)

- Get or rotate a key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys).
- Put the key in **two** places if you want AI features working both locally
  and in production:
  1. **Render** → `OPENAI_API_KEY` env var (§2 above) — for the live site.
  2. **Your new local machine** — give the key to your coding agent to set up
     via one of the three local options described in
     `TALLY_HANDOFF_AND_OPERATIONS_GUIDE.md` §4 (a gitignored config file,
     a local environment variable, or `dotnet user-secrets`). **Say the key
     out loud to the agent to type into a local file/terminal is fine — just
     never ask it to commit that key into a file that gets pushed to GitHub**
     (the repo is public).

## 5. Twilio (SMS feature — currently paused, not wired into the app yet)

Per the project's working notes, SMS send/receive was never finished or
turned on in the code — only the Twilio *account-side* registration was
started and paused. Nothing here blocks running or deploying Tally today.
If/when you want to resume it:

- Log into [twilio.com/console](https://www.twilio.com/console) with the
  account used before.
- You previously got this far (all already done, nothing to redo):
  - Account upgraded to Pay-as-you-go.
  - A Compliance Profile ("Tally SMS Integration", Individual type) — Approved.
  - An A2P 10DLC Brand ("Tally SMS Integration", Sole Proprietor) — Approved,
    identity verified.
  - A Messaging Service ("Tally SMS") created.
- **What's still blocking it**: the Campaign registration step requires a
  live, public Privacy Policy page and Terms & Conditions page with specific
  required legal language (see the project's SMS feature spec doc,
  `docs/SMS_FEATURE_SPEC.md`, for the exact required wording). Once Tally has
  any public URL you can host those two pages on, go back to Twilio's
  Campaign registration (Console → Regulatory Compliance → A2P 10DLC →
  Campaigns) and finish it, then buy a local phone number and attach it to
  the Messaging Service.
- Your Twilio **Account SID** and **Auth Token** (Console home page) are not
  in the code yet at all — when the SMS feature is actually built, those
  will need to go into Render's environment variables the same way the
  OpenAI key does. Don't paste them anywhere until that code exists.

## 6. Quick "am I done?" checklist

- [ ] Signed into GitHub on the new machine, `git push` works
- [ ] Render: `JwtSecret` set to a real secret (not the hardcoded default)
- [ ] Render: `OPENAI_API_KEY` set (if you want live AI features)
- [ ] Render: confirmed/decided on persistent disk for the database
- [ ] Vercel: `VITE_API_URL` confirmed pointing at the Render backend
- [ ] Decided whether to resume Twilio/SMS work (optional, not blocking)
