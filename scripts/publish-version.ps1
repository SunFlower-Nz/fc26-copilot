param(
  [Parameter(Mandatory = $true)]
  [string]$Version,

  [string]$NewRepo = "",

  [switch]$SkipTag
)

$ErrorActionPreference = "Stop"
$tag = "v$Version"
$branch = "release/v$Version"

Write-Host "FUT Pilot publish: $tag -> branch $branch" -ForegroundColor Cyan

# manifest + package.json
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

git branch -f $branch HEAD
Write-Host "Branch $branch -> $(git rev-parse --short HEAD)"

if (-not $SkipTag) {
  git tag -a $tag -m "FUT Pilot $tag" -f
  Write-Host "Tag $tag created"
}

if ($NewRepo) {
  $gh = Get-Command gh -ErrorAction SilentlyContinue
  if (-not $gh) {
    throw "GitHub CLI (gh) required for -NewRepo. Run: gh auth login"
  }
  gh repo create $NewRepo --public --source=. --remote "version-$Version" --push
  Write-Host "New repo: https://github.com/$NewRepo (remote: version-$Version)" -ForegroundColor Green
}

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  git push origin main"
Write-Host "  git push origin $branch"
if (-not $SkipTag) { Write-Host "  git push origin $tag" }
Write-Host "  gh release create $tag --title `"FUT Pilot $tag`" --generate-notes"
