# FUT Pilot - script de apoio (Windows)
param(
  [switch]$BridgeOnly,
  [switch]$Build
)

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

Write-Host "=== FUT Pilot ===" -ForegroundColor Cyan

if ($Build) {
  Write-Host "Build..." -ForegroundColor Yellow
  npm run build
}

if (-not $BridgeOnly) {
  Write-Host "Extensao: carregue dist/ em chrome://extensions" -ForegroundColor Gray
}

$bridgeDir = Join-Path $Root "mcp-bridge"
if (Test-Path $bridgeDir) {
  Set-Location $bridgeDir
  if (-not (Test-Path "node_modules")) {
    Write-Host "Instalando dependencias do bridge..." -ForegroundColor Yellow
    npm install
  }
  Write-Host "Bridge: http://localhost:3926" -ForegroundColor Green
  Write-Host "No Cursor: Settings > MCP > fut-pilot deve estar verde." -ForegroundColor Cyan
  node server.js
}
