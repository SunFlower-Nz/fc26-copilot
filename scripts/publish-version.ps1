param(
  [Parameter(Mandatory = $true)]
  [string]$Version,

  [switch]$SkipTag
)

$ErrorActionPreference = "Stop"
$tag = "v$Version"

Write-Host "FUT Pilot $Version -> main" -ForegroundColor Cyan

$manifestPath = Join-Path $PSScriptRoot "..\manifest.json"
$packagePath = Join-Path $PSScriptRoot "..\package.json"

$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$manifest.version = $Version
$manifest | ConvertTo-Json -Depth 10 | Set-Content $manifestPath -Encoding UTF8

$package = Get-Content $packagePath -Raw | ConvertFrom-Json
$package.version = $Version
$package | ConvertTo-Json -Depth 10 | Set-Content $packagePath -Encoding UTF8

Write-Host "Updated manifest.json and package.json to $Version"

git add manifest.json package.json
$status = git status --porcelain
if ($status) {
  git commit -m "chore: bump version to $Version"
}

if (-not $SkipTag) {
  git tag -a $tag -m "FUT Pilot $tag" -f
  Write-Host "Tag $tag created"
}

Write-Host ""
Write-Host "Next:" -ForegroundColor Yellow
Write-Host "  git push origin main"
if (-not $SkipTag) { Write-Host "  git push origin $tag" }
