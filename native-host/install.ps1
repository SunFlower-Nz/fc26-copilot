#Requires -Version 5.1
<#
.SYNOPSIS
  Instala o Native Messaging host do FC26 Copilot no Windows.

.PARAMETER ExtensionId
  ID da extensão Chrome (chrome://extensions → Detalhes).

.EXAMPLE
  .\install.ps1 -ExtensionId "abcdefghijklmnopqrstuvwxyzabcd"
#>
param(
  [Parameter(Mandatory = $true)]
  [string]$ExtensionId
)

$ErrorActionPreference = 'Stop'
$HostDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$NodePath = (Get-Command node -ErrorAction Stop).Source
$HostJs = Join-Path $HostDir 'host.js'
$ManifestName = 'com.fc26.copilot.json'
$ManifestPath = Join-Path $HostDir $ManifestName

$manifest = Get-Content $ManifestPath -Raw | ConvertFrom-Json
$manifest.path = "`"$NodePath`" `"$HostJs`""
$manifest.allowed_origins = @("chrome-extension://$ExtensionId/")
$manifest | ConvertTo-Json -Depth 5 | Set-Content $ManifestPath -Encoding UTF8

$regPath = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.fc26.copilot'
New-Item -Path $regPath -Force | Out-Null
Set-ItemProperty -Path $regPath -Name '(default)' -Value $ManifestPath

Write-Host "Native host instalado."
Write-Host "  Manifest: $ManifestPath"
Write-Host "  Registry: $regPath"
Write-Host ""
Write-Host "MCP no Cursor (stdio, sem aba bridge):"
Write-Host "  node `"$HostDir\mcp-stdio-bridge.js`""
