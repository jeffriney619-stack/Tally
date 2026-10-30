# Tally — Handoff & Operations Guide

Read this first on any new machine, with any AI coding agent (Claude, ChatGPT,
Copilot, etc.), with **zero assumptions** that anything is already set up.
Nothing about Tally depends on this specific computer or chat session —
everything lives in two places: the **GitHub repo** and two **cloud hosts**
(Render for the backend, Vercel for the frontend). A new machine just needs
the tools below installed and to clone the repo.

## 0. The three things that already exist in the cloud (nothing to recreate)

| Thing | Where | Notes |
|---|---|---|
| Source code | `https://github.com/jeffriney619-stack/Tally` (public, branch `main`) | Clone this on the new machine. |
| Live backend | Render service → `https://tally-backend-jnc7.onrender.com` | Auto-deploys from `main` on every push. |
| Live frontend | Vercel project → `https://tally-frontend-orcin.vercel.app` | Auto-deploys from `main` on every push. |

**Key fact:** Render and Vercel are already wired to watch this GitHub repo's
`main` branch (configured once, at the hosting-provider account level — not
per-computer). Pushing a commit to `main` from *any* machine triggers both
auto-deploys automatically. You do not need Render/Vercel CLI tools, API
keys, or dashboard access just to ship a change — only `git push` access to
the GitHub repo is required.

## 1. Prerequisites to install on the new machine

- **Git** (any recent version).
- **.NET SDK 10** (backend targets `net10.0`).
- **Node.js** (LTS) + **pnpm** (frontend package manager; `npm i -g pnpm` if
  not present).
- A **GitHub account with push access to `jeffriney619-stack/Tally`**
  (either the same account, or one added as a collaborator). On first
  `git push`, Git will prompt for GitHub sign-in (browser popup via Git
  Credential Manager) or a Personal Access Token — this is a one-time setup
  per machine.
- (Optional, only needed for AI features — see §4) An **OpenAI API key**.

## 2. Get the code

```powershell
git clone https://github.com/jeffriney619-stack/Tally.git
cd Tally
```

Everything referenced below is relative to this cloned folder. The app
itself lives in `connected-envelope-budget/` (`backend/` = ASP.NET Core API,
`frontend/` = React + Vite app).

## 3. Launching Tally locally (fresh machine, first time)

**Backend** (new terminal):
```powershell
cd connected-envelope-budget/backend
dotnet run --launch-profile http
```
- Listens on `http://localhost:5080`.
- On first run it auto-creates the SQLite file (`connected-budget.db`) and
  all tables via explicit `CREATE TABLE IF NOT EXISTS` statements in
  `Program.cs` (EF Core's `EnsureCreated()` is deliberately not relied on
  here — see the "Critical EF Core / SQLite gotcha" note in repo memory /
  commit history if adding new tables later).

**Frontend** (separate terminal):
```powershell
cd connected-envelope-budget/frontend
pnpm install
pnpm dev
```
- Listens on `http://localhost:5173`, talks to the backend via
  `VITE_API_URL` (defaults to `http://localhost:5080` if unset — no config
  needed for local dev).

**Login:** seeded demo account — username `jriley`, password `prototype`.

> macOS/Linux note: the commands above are identical except `pnpm` (not
> `pnpm.cmd`). On Windows, if `pnpm` alone fails, use `pnpm.cmd` explicitly —
> this machine has PowerShell script execution restricted, which blocks the
> plain `pnpm` shim but not `pnpm.cmd`.

## 4. Local-only secrets (AI features) — these do NOT come from git

`connected-envelope-budget/backend/appsettings.Development.json` is in
`.gitignore` and was **never pushed to GitHub** — it only ever existed on
the original machine. Without it (or an equivalent), the app still runs
fully, but AI-backed features (the envelope assistant, transaction
auto-categorization's OpenAI path) will respond with "not configured" and
fall back to deterministic/keyword logic instead of calling OpenAI.

To enable AI features on a new machine, either:

**Option A — recreate the file** at
`connected-envelope-budget/backend/appsettings.Development.json`:
```json
{
  "AiEnvelopeAssistant": {
    "Endpoint": "https://api.openai.com/v1/chat/completions",
    "ApiKey": "sk-...your-key...",
    "Model": "gpt-4.1-mini"
  }
}
```

**Option B — environment variables** (no file needed), read as a fallback
by the backend:
```powershell
$env:OPENAI_API_KEY = "sk-...your-key..."
# optional overrides:
$env:OPENAI_API_ENDPOINT = "https://api.openai.com/v1/chat/completions"
$env:OPENAI_MODEL = "gpt-4.1-mini"
```

**Option C — `dotnet user-secrets`** (the project already has a
`UserSecretsId` configured in `backend.csproj`):
```powershell
cd connected-envelope-budget/backend
dotnet user-secrets set "AiEnvelopeAssistant:ApiKey" "sk-...your-key..."
```

The **live production** OpenAI key (used by the Render-hosted backend) is
configured as an environment variable in the Render dashboard for that
service — separate from anything on this computer, and unaffected by losing
access to this machine.

## 5. Making edits

- Frontend code: `connected-envelope-budget/frontend/src/`. Dev server
  hot-reloads on save — no restart needed while editing.
- Backend code: `connected-envelope-budget/backend/`. `dotnet run` does not
  hot-reload by default; stop (Ctrl+C) and re-run after backend changes (or
  use `dotnet watch run --launch-profile http` for auto-restart).
- Before committing, it's good practice to run, from `frontend/`:
  ```powershell
  pnpm exec tsc --noEmit -p tsconfig.app.json
  pnpm exec biome check src
  ```

## 6. Deploying changes to GitHub (and triggering production deploy)

The repo includes `scripts/push-main-and-verify.ps1`, which:
1. Switches to / pulls `main` (fast-forward only).
2. Stages all changes (`git add -A`), commits (auto-generated timestamp
   message if none given), and pushes to `origin/main`.
3. Health-checks the live backend (`/health`) and frontend URLs after the
   push, since Render/Vercel auto-deploy from that push.

Run it from the repo root:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\push-main-and-verify.ps1 -Message "Describe the change here"
```

On macOS/Linux, either install PowerShell Core and run
`pwsh ./scripts/push-main-and-verify.ps1 -Message "..."`, or just run the
plain git equivalent and skip the health-check convenience:
```bash
git pull --ff-only origin main
git add -A
git commit -m "Describe the change here"
git push origin main
```

**No code changes to this script are required for a new machine or a
different agent to use it** — it has no hardcoded paths, credentials, or
machine-specific state. Its only hard requirement is that `git push` works,
which depends on GitHub authentication being set up on that machine (§1),
not on anything in this repo. (A short prerequisites comment was added to
the top of the script itself to make this explicit for future agents.)

Pushing to `main` is **production-affecting** — it immediately triggers
real deploys to the live Render/Vercel URLs users may already be using.
Treat it with the same care as any other production deploy.

## 7. Re-launching after new changes are deployed

- **Locally**: nothing special — stop and restart `dotnet run` (backend) if
  you changed backend code; the frontend dev server hot-reloads
  automatically.
- **Production**: nothing to do manually. Render and Vercel pick up the new
  `main` commit automatically (typically live within a minute or two of the
  push). Use the health-check output from §6, or simply reload
  `https://tally-frontend-orcin.vercel.app`, to confirm the new version is
  live.

## 8. Full environment variable / config reference

These are every config value the backend and frontend read at runtime. Local
dev works with **none** of these set (all have safe local defaults); they
matter for production (Render/Vercel) and for enabling AI features locally.
Setting the actual values in Render/Vercel dashboards is a human task — see
`TALLY_USER_ACCOUNT_SETUP_CHECKLIST.md` (the companion doc for the user,
not this agent-facing one) for that side of it.

| Variable | Read by | Purpose | Local default if unset |
|---|---|---|---|
| `JwtSecret` (config key, not env-var-style) | `backend/Program.cs` | Signs/validates login JWTs | Falls back to a **hardcoded, insecure** value — must be overridden in production |
| `CORS_ORIGINS` | `backend/Program.cs` | Comma-separated list of allowed frontend origins | `http://localhost:5173` + a couple of local variants |
| `OPENAI_API_KEY` (or config `AiEnvelopeAssistant:ApiKey`) | `EnvelopeAssistantController.cs`, `TransactionCategorizationController.cs` | Enables real OpenAI calls for envelope assistant + transaction categorization | Unset → features return "not configured" and fall back to deterministic/keyword logic (no crash) |
| `OPENAI_API_ENDPOINT` (or config `AiEnvelopeAssistant:Endpoint`) | same as above | Override OpenAI endpoint | `https://api.openai.com/v1/chat/completions` |
| `OPENAI_MODEL` (or config `AiEnvelopeAssistant:Model`) | same as above | Override model name | `gpt-4.1-mini` |
| `ConnectionStrings:BudgetDatabase` | `backend/Program.cs` | SQLite file location | `Data Source=connected-budget.db` |
| `VITE_API_URL` (frontend build-time env var) | `frontend/src/services/api.ts` | Backend base URL the SPA calls | `http://localhost:5080` |
| `PORT` | Render sets this automatically; read in `backend/Dockerfile`'s entrypoint | Container listen port | N/A (Docker-only) |

**Important data-persistence caveat found in this repo:** the SQLite file
`connected-envelope-budget/backend/connected-budget.db` is **committed to
git**, not gitignored. The backend's `Dockerfile` (used by Render) `COPY`s
the entire build context, including this file, into the image on every
build. Whether production data actually persists across deploys/restarts
depends on whether Render has a **persistent disk** mounted over that file's
path for this service — that is a Render dashboard setting this agent
cannot see or change. **Verify this with the user / Render dashboard before
assuming production data is safe across a redeploy.** If no persistent disk
is attached, every new deploy could reset the live database back to
whatever `connected-budget.db` contains in the pushed commit.

## 9. Known gaps / things to double-check when picking this back up

- `backend/Program.cs` falls back to a **hardcoded JWT signing secret**
  (`"your-secret-key-change-this-in-production-12345"`) if config key
  `JwtSecret` isn't set. Verify the Render service has a real `JwtSecret`
  env var configured — don't rely on the hardcoded fallback in production.
- `AiTransactionCategorizer` thresholds in `appsettings.json` are explicitly
  marked as placeholders pending a real evaluation pass against imported
  historical data (see `Tally_Transaction_AI_Categorization_Build_Plan.md`,
  §7/§8 — deferred, not started as of this writing).
- The SMS/Twilio integration (A2P 10DLC campaign) was paused mid-registration
  pending a public Privacy Policy/Terms URL — see repo history / product docs
  for where that was left.
