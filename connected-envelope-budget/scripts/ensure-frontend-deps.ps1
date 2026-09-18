# Verifies the frontend's pnpm-installed dependencies are intact and reinstalls them if not.
# Guards against the node_modules junctions breaking after the project folder is moved or copied.
$ErrorActionPreference = 'Stop'

$frontendDir = Resolve-Path (Join-Path $PSScriptRoot '..\frontend')
Push-Location $frontendDir
try {
    $pnpmStore = Join-Path $frontendDir 'node_modules\.pnpm'
    $reactLink = Join-Path $frontendDir 'node_modules\react'
    $viteBin = Join-Path $frontendDir 'node_modules\.bin\vite.cmd'

    $healthy = (Test-Path $pnpmStore) -and (Test-Path $reactLink) -and (Test-Path $viteBin)

    if (-not $healthy) {
        Write-Host 'Tally: frontend dependencies missing or stale - reinstalling...'
        if (Test-Path 'node_modules') {
            Remove-Item -Recurse -Force 'node_modules'
        }
        pnpm.cmd install
    } else {
        Write-Host 'Tally: frontend dependencies OK.'
    }
}
finally {
    Pop-Location
}
