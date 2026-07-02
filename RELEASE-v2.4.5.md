# FUT Pilot v2.4.5

## Novidades

- Renomeado para **FUT Pilot** (extensão + MCP)
- **Popup DME/SBC**: analisar diários, cards por challenge, Fazer DME, completar todos
- **Navegação automática** no Web App (`open_sbc_challenge`, `fut-navigation.js`)
- **MCP `reset_rate_limits`**: limpar full stop falso (ex.: EA 494)
- **494 mercado bloqueado** não dispara mais parada global de 24h
- **Solver** usa os mesmos requisitos da análise (`solveSbc` fix)
- **Cross-check EA**: confia validação da EA em DMEs de 1 carta
- Análise assíncrona no popup (job + polling)

## Tools MCP novas

- `reset_rate_limits`
- `open_sbc_challenge`
- `get_fut_navigation_state`

## Instalação

```powershell
npm run build
# chrome://extensions → Carregar sem compactação → pasta dist/
# Bridge: cd mcp-bridge && node server.js
```

## Notas

- Submit SBC pode retornar **446** (soft ban EA) após muitas tentativas — aguardar ~24h
- Daily Bronze no FC26 exige **prata** (requisito EA), não bronze
