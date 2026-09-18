# Tally (Connected Envelope Budget) — agent instructions

## Project layout
- `backend/` — ASP.NET Core (.NET 10) + EF Core + SQLite API. Runs on `http://localhost:5080`.
- `frontend/` — React + TypeScript + Vite. Runs on `http://localhost:5173`.
- `scripts/ensure-frontend-deps.ps1` — verifies `frontend/node_modules` is intact (checks `.pnpm`, `react`, `.bin/vite.cmd`) and reinstalls automatically if broken. This project's `node_modules` has previously broken after being moved/copied on Windows because pnpm uses absolute-path junctions — always run this before starting the frontend if there's any doubt.

## How to run ("run Tally")
Preferred: VS Code task **"Run Tally"** (default build task — Ctrl+Shift+B, or Terminal > Run Task > Run Tally). It runs the dependency preflight, then starts backend and frontend together. Defined in `.vscode/tasks.json`.

Manual equivalent if not using the task runner:
```powershell
powershell -File scripts/ensure-frontend-deps.ps1
cd backend; dotnet run --launch-profile http    # http://localhost:5080
cd frontend; pnpm.cmd exec vite                  # http://localhost:5173
```
Verify with `Invoke-RestMethod http://localhost:5080/health` and by checking the frontend terminal for "ready in".

## Known simulated boundaries
Bank aggregation, SMS delivery, Claude, recovery email, and production auth are all simulated in this prototype — do not assume real external integrations exist.
