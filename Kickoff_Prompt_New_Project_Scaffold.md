# Kickoff Prompt — Scaffold a New AI-Assisted Full-Stack Project

> **How to use this:** Open VS Code in an **empty folder** that will become your workspace. Open Copilot Chat, switch to **Agent** mode, and paste everything below the line into the chat.
>
> **You do not need to install or configure anything beforehand.** The agent is instructed to check your machine itself, tell you in plain language what's missing and why, get your approval, and then help you install it. Just paste the prompt and answer its questions.
>
> This scaffold mirrors the architecture of a production application that was built end-to-end with 100% AI-agent-assisted development. The stack choices are deliberate — they are optimized for an agent being able to reliably make changes across the whole stack. Open-source equivalents are used here; see the appendix for the internal-package swaps if you later build inside a company-provided shell workspace.

---

## ROLE

You are scaffolding a new full-stack project from scratch for a developer who will do **100% AI-agent-assisted development** in VS Code with Copilot Chat. Your job in this session is to produce a **working skeleton plus one complete vertical slice**, and the agent-instruction files that will govern all future sessions.

Work in **phases, in order**. After each phase, stop and give me a one-paragraph status report before continuing. Do not skip ahead.

If a command fails, diagnose and fix it — do not leave a phase in a broken state and move on.

### How to treat me

Assume I am **not** a systems person and that I have installed **nothing**. Do not assume any tool, runtime, certificate, extension, account, or setting is already in place, and do not ask me whether something is installed — **find out yourself by running the check**, then tell me the result.

Throughout this session:

- **You are responsible for detecting every dependency.** If a phase needs something, verify it exists before you rely on it.
- **Never hand me a command to run that you could run yourself.** Run it in the terminal and report what happened.
- **Explain in plain language.** When something is missing, tell me *what it is*, *why this project needs it*, *how big the install is*, and *whether it costs money* — in one or two sentences, without jargon. Assume I have never heard of it.
- **Get my explicit approval before installing anything**, before changing any machine-wide setting, and before anything that requires administrator rights or a reboot. Present the choice, wait for my answer.
- **Then do the work for me.** Once approved, run the install, verify it, and continue. Only hand a task back to me when it genuinely cannot be automated (a GUI installer, a login, a reboot, an admin prompt) — and when you do, give me numbered click-by-click steps, one task at a time, and wait for me to confirm before moving on.
- **Never ask me for a password, license key, token, or any other secret in chat.** If a step needs one, tell me to enter it directly in the terminal or in the app's own dialog.
- **Never silently skip a blocked dependency.** Stop, explain the blocker and my options, and wait.

---

## PHASE 0A — Environment audit (do this first, before asking me anything else)

Run the checks below yourself in the terminal. Do not ask me to run them. Detect my OS and CPU architecture first (`$PSVersionTable` / `uname -m`) and adapt commands accordingly.

**Detect:**

| What | Why this project needs it | Check |
|---|---|---|
| Git | Version control for the two repos | `git --version` |
| .NET SDK 9.0.100+ | Builds and runs the backend API | `dotnet --list-sdks` |
| Node.js 22 LTS+ | Runs the frontend build tooling | `node -v` |
| pnpm 10+ | Installs frontend packages | `pnpm -v` |
| **A running container runtime** (Docker Desktop or Podman Desktop) | The backend starts its own SQL Server database in a container. **Nothing works without this.** | `docker info` then `podman info` |
| ASP.NET Core HTTPS dev certificate | Lets the browser talk to the local API over HTTPS | `dotnet dev-certs https --check --trust` |
| Free disk space ≥ 10 GB | Container image, package caches, and test browsers | platform-appropriate command |
| Ports 5173, 5434, 17000–18888 free | Frontend, database, and the Aspire dashboard bind to these | check listeners |
| CPU architecture | The standard SQL Server image is Intel-only | `uname -m` / `$env:PROCESSOR_ARCHITECTURE` |
| GitHub CLI (`gh`) — *optional* | Lets me create repos and open pull requests for you | `gh auth status` |
| Proxy / private registry config | A corporate network can block package downloads | check `npm config get proxy`, existing `.npmrc` / `NuGet.config` |

**Then report to me in a single table** with three columns — *What it's for* (plain language), *Status* (✅ found / ❌ missing / ⚠️ needs attention), and *What I propose to do about it*. Separate **blockers** from **nice-to-haves**, and give me the total download size and roughly how long it will take.

**Then wait for my approval before installing anything.**

### Remediation guidance

- **Things you can install for me automatically** (after approval): Git, .NET SDK, Node.js, pnpm, GitHub CLI. Use `winget install` on Windows, `brew install` on macOS, the distro package manager on Linux. For pnpm prefer `corepack enable` + `corepack prepare pnpm@latest --activate`. After each install, open a fresh terminal and re-verify — PATH changes don't apply to an existing session.
- **HTTPS certificate:** run `dotnet dev-certs https --trust` yourself. Warn me first that a Windows or macOS security dialog will pop up and that I should click **Yes**/**Allow**.
- **Container runtime — explain this one carefully, it's the most common stumbling block.** Tell me: the backend runs its database inside a container so I don't have to install a database server, and this needs one of two free-to-download apps. Then lay out the choice:
  - **Podman Desktop** — free for everyone. Recommended default.
  - **Docker Desktop** — more common, but **requires a paid license at companies above roughly 250 employees or $10M revenue.** Ask me whether my employer already has a license before recommending it.

  Both need a GUI installer and, on Windows, WSL2 (which may require a reboot). Walk me through it one numbered step at a time, wait for me to confirm the app is **running** (not just installed), then re-run `docker info` / `podman info` yourself to confirm.
- **Apple Silicon Mac:** the standard SQL Server container image is Intel-only. Tell me plainly that my Mac's chip can't run it directly, and that you'll use a compatible database image (`azure-sql-edge`) in the AppHost instead. Make that substitution yourself in Phase 2; don't make me decide.
- **Port conflicts:** don't ask me to free the port. Pick different ports, use them consistently across the AppHost, the frontend config, and the start scripts, and tell me which ones you chose.
- **Windows long paths:** if not enabled, explain that deeply nested folders can otherwise break the build, and that fixing it needs administrator rights. Give me the exact steps and let me run them, then re-verify.
- **VS Code extensions:** these let you see compiler and lint errors, which is how you catch and fix your own mistakes — tell me that's why you want them. Install them for me if you can; otherwise give me the exact marketplace names, one list, and confirm once I've installed them. Ask for: **C# Dev Kit**, **Biome**, **Tailwind CSS IntelliSense**, **Playwright Test for VS Code**, **SQL Server (mssql)**, **EditorConfig for VS Code**.
- **Corporate proxy / private registry:** if detected, sort this out *now*, before Phase 2 or Phase 4 fails halfway through a package restore. Tell me what you found and what you need from my IT setup.

### Do not install these — tell me so if I ask

- A local SQL Server. The container provides one; a local install only causes port conflicts.
- The .NET Aspire workload. Since .NET 9 it ships as regular packages; `dotnet workload install aspire` is outdated advice you may find online.
- Node version managers, ESLint, or Prettier — not used by this stack.

**Gate:** do not start Phase 1 until every blocker is ✅ and I have said to proceed. The container runtime in particular must be **running**, verified by you, not by my say-so.

---

## PHASE 0B — Interview me (after the environment audit, before writing any code)

Ask me the following, then **wait for my answers**:

1. **Project name** — short kebab-case slug (e.g. `equipment-tracker`). Repos will be `<slug>-backend` and `<slug>-frontend`; the .NET root namespace will be the PascalCase form.
2. **Domain in one paragraph** — what the app does and who uses it.
3. **Core entities** — 3–5 nouns the app is built around, and roughly how they relate (e.g. "a *Site* has many *Assets*; each *Asset* has many *Inspections*").
4. **The one vertical slice** — pick a single entity to build end-to-end in this session. Recommend the simplest root entity with no dependencies.
5. **Ticket prefix** — the JIRA-style prefix used in commit messages (e.g. `ACME-`), or `none` if not applicable.

Echo my answers back as a short summary and confirm before proceeding. If I give vague or incomplete answers, ask follow-ups — do not invent domain details.

---

## PHASE 1 — Workspace layout

Create this structure in the current folder:

```
<workspace root>/
├── <slug>-backend/          # git repo #1
├── <slug>-frontend/         # git repo #2
├── docs/                    # specs and plan prompts (shared, not in either repo)
├── start-backend.bat
├── start-frontend.bat
└── README.md
```

- `git init` in each of the two repo folders (the workspace root itself is **not** a repo).
- Add a sensible `.gitignore` to each (`dotnet new gitignore` for the backend; Node/Vite ignores for the frontend).
- `start-backend.bat` → `cd <slug>-backend && dotnet run --project src/AppHost`
- `start-frontend.bat` → `cd <slug>-frontend && pnpm dev`
- Root `README.md`: one paragraph on the domain, the two-repo layout, and how to start each side.

---

## PHASE 2 — Backend skeleton (.NET 9 + Aspire)

Create `<slug>-backend` with this project layout:

```
<slug>-backend/
├── <Name>.sln
├── global.json                  # pin the .NET SDK major version
├── Directory.Build.props        # shared: TargetFramework net9.0, Nullable enable,
│                                #   ImplicitUsings enable, TreatWarningsAsErrors
├── Directory.Packages.props     # central package management (ManagePackageVersionsCentrally=true)
├── .editorconfig
├── NLogConfigs/NLog.config
├── src/
│   ├── AppHost/                 # .NET Aspire orchestrator
│   ├── <Name>.Core/             # entities, DbContext, services (no ASP.NET dependency)
│   ├── <Name>.DataMigrations/   # DbUp console app + .sql scripts
│   └── <Name>.RestApi/          # controllers, DTOs, Program.cs
└── test/
    └── <Name>.Tests.Unit/
```

Requirements:

- **Central package management is mandatory.** Every `PackageReference` in every `.csproj` is version-less; all versions live in `Directory.Packages.props`. Use current stable versions — verify them, don't guess.
- **`src/AppHost`** is a .NET Aspire AppHost. It must orchestrate, in dependency order:
  1. A SQL Server container with a data volume and a stable generated password, on a non-default host port (e.g. 5434) so it never collides with a locally installed SQL Server.
  2. A database resource on that server.
  3. The `DataMigrations` project, referencing the database and waiting for it.
  4. The `RestApi` project, referencing the connection string, waiting for migrations to finish.

  This is the single most important piece: `dotnet run --project src/AppHost` must be the **only** command needed to get a working local backend with a provisioned database. No docker-compose, no manual DB setup, no connection strings to edit.

- **`<Name>.DataMigrations`** uses **DbUp** (SQL Server provider) to run embedded `.sql` scripts in filename order.
  - Scripts live in `Schema/` and are named `_YYYY_MM_DD_NN_description.sql` (leading underscore so they are valid embedded-resource identifiers; date + sequence gives deterministic ordering).
  - Scripts are embedded resources (`<EmbeddedResource Include="Schema\*.sql" />`).
  - **SQL scripts are the schema source of truth. EF Core migrations are never used.** Entities are hand-written to match the SQL. Say this explicitly in the project's README and in the copilot-instructions file later.
  - Migrations must be idempotent-safe to re-run in the sense that DbUp's journal table tracks what has run.

- **`<Name>.Core`** holds EF Core entities, a `AppDbContext`, and service classes. Entities map to `snake_case` table and column names via Fluent API configuration (keeps the SQL readable and matches the migration scripts). Include a `BaseEntity` with `Id` (string GUID or `Guid`), `CreatedAt`, `CreatedBy`, `UpdatedAt`, `UpdatedBy`.

- **`<Name>.RestApi`**:
  - Controller-based (not minimal APIs) — controllers give the agent a predictable, greppable file-per-resource structure.
  - URL-segment API versioning via `Asp.Versioning.Mvc`: routes are `api/v{version:apiVersion}/[controller]`, so v1 endpoints are `/api/v1.0/...`.
  - Swagger/OpenAPI UI enabled in Development.
  - NLog for logging, configured from `NLogConfigs/NLog.config`, writing to console and to a rolling file.
  - CORS policy allowing the Vite dev origin (`http://localhost:5173`).
  - A `GET /health` endpoint.

- **`<Name>.Tests.Unit`** uses MSTest + Moq + Shouldly. Add Testcontainers (`Testcontainers.MsSql`) as a dependency and one integration test that spins up SQL Server, runs the DbUp migrations against it, and asserts the vertical-slice table exists. This proves migrations are testable in CI without a shared database.

**Verify before ending this phase:** `dotnet build` succeeds with zero warnings, and `dotnet run --project src/AppHost` starts the Aspire dashboard with all resources healthy.

---

## PHASE 3 — Backend vertical slice

For the single entity I chose in Phase 0B, implement the full path:

1. `Schema/_<today>_01_create_<table>.sql` — the table, with PK, timestamps, and appropriate constraints/indexes. Use `CHECK` constraints for any status/enum columns rather than lookup tables.
2. The EF entity in `<Name>.Core/Models/` + `DbSet` and Fluent API config in `AppDbContext`.
3. A `<Entity>sController` in `<Name>.RestApi/Controllers/` with `GET /` (list, with at least one filter query param), `GET /{id}`, `POST /`, `PUT /{id}`, `DELETE /{id}`.
4. Explicit **request and response DTOs** in the API project — controllers must never accept or return EF entities directly.
5. Server-side validation on create/update; return `400` with a problem-details body on failure, `404` when not found.
6. Unit tests for the controller's happy path and its validation failures.

Seed 3–5 realistic sample rows via a separate `Local/` script that only runs in development, so the UI has something to display.

---

## PHASE 4 — Frontend skeleton (React 19 + React Router v7 + Vite)

Create `<slug>-frontend` using pnpm. Target this configuration:

| Concern | Choice |
|---|---|
| Framework | React 19 + React Router v7 in **framework mode**, `ssr: false` in `react-router.config.ts` (SPA output, but with the file-based route config and typegen) |
| Build | Vite 7 + `@vitejs/plugin-react`, `vite-tsconfig-paths` |
| Language | TypeScript, strict |
| Styling | Tailwind CSS v4 via `@tailwindcss/vite`, CSS-first config in `app/app.css` |
| Components | shadcn/ui (`components.json`, components generated into `app/components/ui/`) + `lucide-react` icons + `clsx` + `tailwind-merge` + `class-variance-authority` |
| Server state | TanStack Query v5 |
| Validation | Zod |
| i18n | `react-intl` — **every** user-facing string goes through `<FormattedMessage>` / `intl.formatMessage`, with an `en` message catalog in `app/locales/` |
| Lint + format | **Biome** (single tool; do not install ESLint or Prettier) |
| Unit tests | Vitest + Testing Library + jsdom |
| E2E tests | Playwright, with `desktop` and `mobile` projects, plus `@axe-core/playwright` for an accessibility smoke test |
| Releases | Changesets |

Folder layout under `app/`:

```
app/
├── root.tsx           # providers: QueryClient, IntlProvider, AuthProvider
├── routes.ts          # declarative route table
├── app.css            # Tailwind v4 config + design tokens
├── components/        # ui/ (shadcn primitives) + feature components
├── contexts/          # AuthContext etc.
├── hooks/
├── lib/               # utils, test-utils (renderWithProviders)
├── locales/           # en.json
├── routes/            # one file per route
├── services/          # api.ts + one <entity>Service.ts per resource
└── types/             # shared TS types mirroring the API DTOs
```

`package.json` scripts, at minimum:

```
dev, build, start, lint (biome check .), lint:fix, typecheck (react-router typegen && tsc),
test:unit (vitest run), test:e2e (playwright test), test (both)
```

**Hard conventions to encode now** (these are what keep an agent-built UI from drifting):
- **One responsive breakpoint only:** 768px, i.e. Tailwind's `md`. Mobile-first — write base classes for mobile and `md:` overrides for desktop. No `sm:`, `lg:`, `xl:`, `2xl:`.
- **No hand-written layout CSS and no inline style objects.** Tailwind utilities only. `app.css` holds design tokens, nothing else.
- **No raw string literals in JSX.** All copy goes through react-intl.
- `services/api.ts` is the only place `fetch` is called. It owns the base URL, the auth header, JSON serialization, and error normalization. Feature services call into it.

**Verify before ending this phase:** `pnpm typecheck`, `pnpm lint`, and `pnpm test:unit` all pass, and `pnpm dev` serves a page.

---

## PHASE 5 — Auth abstraction (with a local-dev bypass)

Wire OIDC in a way that is production-shaped but runs locally with no identity provider:

- Install `oidc-client-ts` + `react-oidc-context`.
- Read config from Vite env vars: `VITE_OIDC_AUTHORITY`, `VITE_OIDC_CLIENT_ID`, `VITE_OIDC_REDIRECT_URI`, and `VITE_DISABLE_AUTH`.
- Create an `AuthProvider` in `app/contexts/` exposing a stable interface: `{ isAuthenticated, isLoading, user, token, signIn, signOut }`.
  - When `VITE_DISABLE_AUTH === 'true'`, the provider short-circuits and returns a hard-coded mock user with a null token. **Nothing else in the app may branch on `VITE_DISABLE_AUTH`** — the bypass exists in exactly one file.
  - Otherwise it delegates to `react-oidc-context`.
- Add an `AuthGate` component in `root.tsx` that renders a loading state while auth resolves and does **not** trigger a sign-in redirect while OIDC callback params are present in the URL (this prevents redirect loops).
- `services/api.ts` attaches the bearer token when one exists.
- On the backend, add JWT bearer authentication configured from `Authentication:Authority` / `Authentication:Audience`, and an `Authentication:Disabled` flag that, when true in Development only, registers a permissive policy. Controllers carry `[Authorize]` from day one so nothing has to be retrofitted later.
- Commit a `.env.example` with `VITE_DISABLE_AUTH=true` and the empty OIDC keys, and document how to point it at a real Keycloak / Entra ID / Auth0 realm.

---

## PHASE 6 — Frontend vertical slice

For the same entity from Phase 3:

1. `types/<entity>.ts` — TS types mirroring the API DTOs.
2. `services/<entity>Service.ts` — list/get/create/update/delete, calling `api.ts`.
3. TanStack Query hooks in `hooks/` — `use<Entity>List`, `use<Entity>`, and mutation hooks with cache invalidation.
4. Routes registered in `app/routes.ts`: a list page and a detail/edit page under a shared layout route with the app nav.
5. List page: loading, empty, and error states; a filter control wired to the API's filter param.
6. Detail page: a form using shadcn form primitives + Zod validation, create and update, with a toast/confirmation on success.
7. All strings in `app/locales/en.json`.
8. One Vitest test rendering the list page against a mocked service, and one Playwright e2e test that loads the list page and asserts the seeded rows appear.

**Verify before ending this phase:** with the backend running via `start-backend.bat` and the frontend via `start-frontend.bat`, the list page displays the seeded rows from SQL Server, and a new record created in the UI persists and survives a refresh. Report the actual URLs.

---

## PHASE 7 — Agent instruction files

Now that the scaffold exists, write the instruction files **from what you actually built** — real commands, real paths, real conventions. Do not write aspirational content.

Create `.github/copilot-instructions.md` in **each** repo. Each should be concise (aim for under 100 lines) and cover:

1. **What this repo is** — one paragraph, and what the *other* repo is.
2. **Stack + versions** — a short table.
3. **How to run, build, test, lint** — exact commands.
4. **Project layout** — the folder tree with one line per folder explaining what belongs there.
5. **Non-negotiable conventions** — the rules listed in Phases 2, 4, and 5 above. Be imperative and specific. Examples for the backend: "SQL scripts in `Schema/` are the schema source of truth; never use EF migrations", "controllers never accept or return EF entities", "new packages get their version added to `Directory.Packages.props`, never to a `.csproj`". For the frontend: "768px is the only breakpoint", "no inline styles", "all copy through react-intl", "`fetch` is called only in `services/api.ts`".
6. **How to add a new feature** — the ordered checklist matching the vertical slice you just built (SQL migration → entity → DbContext → controller + DTOs → tests | types → service → query hooks → route → page → locale strings → tests).
7. **Before committing** — backend: `dotnet build` clean + `dotnet test`. Frontend: `pnpm typecheck` + `pnpm lint` + `pnpm test:unit`, and add a changeset. Commit messages are prefixed `<TICKET-PREFIX><number>: description` (omit if I answered `none`).

Also create, in the workspace-root `docs/` folder:

- **`WORKFLOW.md`** — the change-delivery ritual: sync with main → branch `feature/<TICKET>` in each repo that changes → implement → sync with base branch again before committing → run typecheck/lint/tests → commit with the ticket prefix → verify every commit message on the branch carries the prefix → push → open PRs → merge → verify in the deployed environment.
- **`FUNCTIONAL_SPEC.md`** — a starter spec seeded from my Phase 0B answers, with these headings and a note that they must stay filled in: `Intent`, `Scope` / `Out of Scope`, `Conceptual Model` (the entities and their relationships), `Behavior Definitions`, `Invariants`, `Implementation Discipline`, `Definition of Done`. Fill in what you can from the interview and mark the rest `TBD`.
- **`docs/README.md`** — explaining the working method this folder exists to support:

  > **Spec → Plan → Implement.** Before any feature, write or update a `*_SPEC.md` describing the intended behavior and its invariants — no code. Then produce a `plan-<feature>.prompt.md` that breaks the spec into 5–8 sequentially dependent phases (typically: SQL migration → entities/DbContext → API endpoints → frontend service + hooks → UI → tests), each naming the exact files to touch. Then run the plan one phase at a time, verifying after each. The specs are the durable artifact; chat history is not. When behavior changes, update the spec in the same PR.

---

## PHASE 8 — Final verification and handoff

1. Run, and report actual output for: backend `dotnet build` + `dotnet test`; frontend `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`, `pnpm test:e2e`.
2. Make the initial commit in each repo.
3. Print a summary containing:
   - The two start commands and the URLs they serve (API, Swagger, Aspire dashboard, frontend).
   - The exact file paths touched by the vertical slice, in dependency order — this is the template for every future feature.
   - Anything you stubbed, deferred, or had to deviate from in this prompt, and why.
   - The 3 things I should do next.

---

## CONSTRAINTS FOR THIS WHOLE SESSION

- **Dependency ownership is yours for the entire session, not just Phase 0A.** New prerequisites surface later: the SQL Server container image (~1.5 GB) is pulled the first time the AppHost runs in Phase 2, and the Playwright test browsers (~1 GB) are downloaded in Phase 4. Before each, tell me what's about to download, how big it is, and get a go-ahead. If a later phase reveals something missing, stop and run the same detect → explain → approve → install → verify loop from Phase 0A.
- If a command fails because of a missing or misconfigured dependency, **say so plainly and fix the dependency** — do not work around it, stub it out, or quietly change the architecture to avoid it.
- Verify current stable package versions rather than assuming; if a version in this prompt is stale, use the current one and say so.
- Do not add libraries beyond those listed. In particular: no ESLint/Prettier (Biome covers both), no Redux or other global state library (TanStack Query + React context is sufficient), no EF Core migrations, no docker-compose.
- No secrets in committed files. Use `.env.example` and user-secrets / Aspire-generated credentials.
- Keep every file small enough to be read whole by an agent in a later session. Prefer many small, well-named files over few large ones.
- Stop and ask if anything in Phase 0B was ambiguous rather than inventing domain details.

---

## APPENDIX — Swaps for a company-provided shell workspace

If you later scaffold inside an Alarm.com shell workspace with access to the internal npm registry and NuGet feed, these open-source choices map 1:1 onto the internal ones. The architecture is unchanged.

| This scaffold uses | Internal equivalent |
|---|---|
| shadcn/ui + Tailwind + `lucide-react` | `@adc/ui`, `@adc/theme`, `@adc/icons` |
| `react-intl` + FormatJS CLI | `@adc/gulp-i18n` (`pnpm i18n`, `i18n-export`, `i18n-import`) |
| DbUp | `Alarm.Data.Migrations.SqlServer` (same `_YYYY_MM_DD_NN_*.sql` convention) |
| Plain ASP.NET Core + `.editorconfig` | `Alarm.AspNetCore.RestApi`, `Alarm.Utilities.Core`, `Alarm.EditorConfig`, `Alarm.ApplicationStatus` |
| Hand-written GitHub Actions workflows | `adc-software/reusable-workflows-and-actions` shared workflows (CI, CodeQL, Gitleaks, branch protection, Dependabot→JIRA) |
| Generic OIDC config | Keycloak realm |
| Manual versioning | `Nerdbank.GitVersioning` + `Alarm.MSBuild` |
