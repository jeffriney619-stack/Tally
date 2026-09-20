param(
    [Parameter(Mandatory = $false)]
    [string]$Message,

    [Parameter(Mandatory = $false)]
    [string]$TargetBranch = "main",

    [Parameter(Mandatory = $false)]
    [string]$RemoteName = "origin",

    [Parameter(Mandatory = $false)]
    [string]$BackendHealthUrl = "https://tally-backend-jnc7.onrender.com/health",

    [Parameter(Mandatory = $false)]
    [string]$FrontendUrl = "https://tally-frontend-orcin.vercel.app",

    [Parameter(Mandatory = $false)]
    [switch]$SkipPull,

    [Parameter(Mandatory = $false)]
    [switch]$SkipHealthChecks
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Text)
    Write-Host "[deploy] $Text"
}

function Exec-Git {
    param([string[]]$GitArgs)
    & git @GitArgs
    if ($LASTEXITCODE -ne 0) {
        throw "git $($GitArgs -join ' ') failed with exit code $LASTEXITCODE"
    }
}

function Has-LocalChanges {
    $status = (& git status --porcelain) -join ""
    return -not [string]::IsNullOrWhiteSpace($status)
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw "Git is not installed or not available on PATH."
}

$insideRepo = (& git rev-parse --is-inside-work-tree 2>$null)
if ($insideRepo -ne "true") {
    throw "This folder is not a Git repository. Run this script from within your Tally repo."
}

$repoRoot = (& git rev-parse --show-toplevel).Trim()
Set-Location $repoRoot
Write-Step "Repo root: $repoRoot"

$remoteUrl = (& git remote get-url $RemoteName 2>$null)
if ([string]::IsNullOrWhiteSpace($remoteUrl)) {
    throw "No '$RemoteName' remote configured."
}
Write-Step "Remote: $RemoteName -> $remoteUrl"

$currentBranch = (& git rev-parse --abbrev-ref HEAD).Trim()
if ($currentBranch -ne $TargetBranch) {
    Write-Step "Switching branch: $currentBranch -> $TargetBranch"
    Exec-Git -GitArgs @("checkout", $TargetBranch)
}

if (-not $SkipPull) {
    Write-Step "Pulling latest '$TargetBranch' with fast-forward only"
    Exec-Git -GitArgs @("pull", "--ff-only", $RemoteName, $TargetBranch)
}

if (Has-LocalChanges) {
    if ([string]::IsNullOrWhiteSpace($Message)) {
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
        $Message = "Tally update: $timestamp"
    }

    Write-Step "Staging all local changes"
    Exec-Git -GitArgs @("add", "-A")

    Write-Step "Creating commit: $Message"
    Exec-Git -GitArgs @("commit", "-m", $Message)
} else {
    Write-Step "No local changes detected; skipping commit"
}

Write-Step "Pushing '$TargetBranch' to '$RemoteName'"
Exec-Git -GitArgs @("push", "-u", $RemoteName, $TargetBranch)

if (-not $SkipHealthChecks) {
    Write-Step "Checking backend health: $BackendHealthUrl"
    try {
        $backend = Invoke-RestMethod -Method Get -Uri $BackendHealthUrl -TimeoutSec 20
        $backendStatus = if ($null -ne $backend.status) { $backend.status } else { "unknown" }
        Write-Step "Backend response status: $backendStatus"
    } catch {
        Write-Warning "Backend health check failed: $($_.Exception.Message)"
    }

    Write-Step "Checking frontend reachability: $FrontendUrl"
    try {
        $frontend = Invoke-WebRequest -Method Get -Uri $FrontendUrl -TimeoutSec 20 -MaximumRedirection 5 -UseBasicParsing
        Write-Step "Frontend HTTP status: $($frontend.StatusCode)"
    } catch {
        Write-Warning "Frontend check failed: $($_.Exception.Message)"
    }
}

Write-Step "Done. GitHub is updated; Render and Vercel should auto-deploy from '$TargetBranch'."
