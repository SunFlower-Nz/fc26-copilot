# FC26 Copilot - script de apoio (Windows)
# Uso: clique com botao direito > Executar com PowerShell

$BridgeUrl = "http://localhost:3926"
$ExtensionsUrl = "chrome://extensions"
$FutUrl = "https://www.ea.com/ea-sports-fc/ultimate-team/web-app"
$DistPath = Join-Path $PSScriptRoot "dist"

Write-Host ""
Write-Host "=== FC26 Copilot ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Pasta da extensao (carregar sem compactacao):" -ForegroundColor Yellow
Write-Host "  $DistPath"
Write-Host ""
Write-Host "Passos manuais no Chrome:" -ForegroundColor Yellow
Write-Host "  1. Abra chrome://extensions"
Write-Host "  2. Ative o Modo do desenvolvedor"
Write-Host "  3. Carregar sem compactacao -> selecione a pasta dist acima"
Write-Host "  4. Copie o ID da extensao"
Write-Host "  5. Abra o Web App FUT e faca login"
Write-Host "  6. Abra $BridgeUrl e cole o ID da extensao"
Write-Host ""

try {
    Start-Process "chrome.exe" $ExtensionsUrl
    Start-Sleep -Seconds 2
    Start-Process "chrome.exe" $FutUrl
    Start-Sleep -Seconds 2
    Start-Process "chrome.exe" $BridgeUrl
    Write-Host "Abas do Chrome abertas." -ForegroundColor Green
} catch {
    Write-Host "Nao foi possivel abrir o Chrome automaticamente. Abra as URLs manualmente." -ForegroundColor Red
}

Write-Host ""
Write-Host "No Cursor: Settings > MCP > fc26-copilot deve estar verde." -ForegroundColor Cyan
Write-Host ""
