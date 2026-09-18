param(
    [Parameter(Mandatory = $false)]
    [string]$Message
)

$ErrorActionPreference = "Stop"

function Write-Info {
    param([string]$Text)
    Write-Host "[backup] $Text"
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw "Git is not installed or not available on PATH."
}

$insideRepo = git rev-parse --is-inside-work-tree 2>$null
if ($insideRepo -ne "true") {
    throw "This folder is not a Git repository. Run this script from your repo root."
}

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if ([string]::IsNullOrWhiteSpace($branch) -or $branch -eq "HEAD") {
    throw "Unable to determine current branch."
}

$remoteName = "origin"
$remoteUrl = git remote get-url $remoteName 2>$null
if ([string]::IsNullOrWhiteSpace($remoteUrl)) {
    throw "No '$remoteName' remote configured. Add a remote first."
}

$statusShort = git status --porcelain
if ([string]::IsNullOrWhiteSpace(($statusShort -join "").Trim())) {
    Write-Info "No local changes detected. Nothing to commit."
    Write-Info "Verifying remote sync..."
    git push $remoteName $branch
    Write-Info "Done."
    exit 0
}

if ([string]::IsNullOrWhiteSpace($Message)) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
    $Message = "Backup: $timestamp"
}

Write-Info "Staging all changes..."
git add -A

Write-Info "Creating commit..."
git commit -m $Message

Write-Info "Pushing to $remoteName/$branch..."
git push -u $remoteName $branch

Write-Info "Backup complete."