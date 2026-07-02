# FUT Pilot

Extensão Chrome + servidor **MCP** que conecta assistentes de IA (Cursor, Claude, etc.) ao **EA SPORTS FC 26 Ultimate Team Web App**. Em vez de clicar na interface ou usar automação frágil de DOM, o FUT Pilot fala diretamente com a **API interna da EA** — mais rápido, estável e auditável.

> Fork evoluído a partir de [fc26-copilot](https://github.com/Eng-Abdelrahman-Mostafa/fc26-copilot) (Eng-Abdelrahman-Mostafa).

**Primeira vez?** Veja [SETUP.md](SETUP.md) para instalação passo a passo.

---

## O que o FUT Pilot faz

| Área | Capacidades |
|------|-------------|
| **Mercado** | Buscar, comprar (BIN), dar lance, listar cartas |
| **Clube** | Listar jogadores, não atribuídos, tradepile, watchlist |
| **DME / SBC** | Ler requisitos reais (`elgReq`), resolver elenco, aplicar e enviar (semi-auto) |
| **Analytics** | Portfolio, P/L, fodder, distribuição por rating, top gainers/losers (estilo FutNext) |
| **Preços externos** | FutBin em lote (não consome rate limit da EA) |
| **Cache** | Clube, elenco, DMEs, tradepile persistidos localmente |

---

## Por que não é igual ao FutNext / FC Enhancer?

O **FutNext FC Enhancer** injeta UI no Web App (solver 1 clique, atalhos, overlay de preços). O **FUT Pilot** é orientado a **agente + MCP**: você conversa com a IA, ela chama ferramentas, e você confirma ações sensíveis.

| FutNext Enhancer | FUT Pilot |
|------------------|-----------|
| Overlay no Web App | Painel da extensão + chat MCP |
| Assinatura paga | Open source, local |
| Solver visual 1 clique | `solve_sbc`, `analyze_sbcs`, `complete_sbc` |
| Club analytics | `get_club_analytics` + tela **Club Analytics** |

---

## Requisitos

- Google Chrome (ou Chromium)
- **Node.js 18+**
- Conta EA com acesso ao [Web App FUT](https://www.ea.com/ea-sports-fc/ultimate-team/web-app)
- Cursor / Claude Desktop / outro cliente MCP (opcional, para controle por linguagem natural)

---

## Instalação rápida

```bash
cd fc26-copilot          # ou fut-pilot, conforme seu clone
npm install
npm run build            # gera dist/
```

1. Abra `chrome://extensions`
2. Ative **Modo do desenvolvedor**
3. **Carregar sem compactação** → selecione a pasta `dist/`
4. Fixe **FUT Pilot** na barra de ferramentas

### Bridge MCP (Cursor / HTTP)

```bash
cd mcp-bridge
npm install
node server.js
```

Abra `http://localhost:3926`, cole o **Extension ID** (`chrome://extensions`) e clique **Connect**.

### Configurar MCP no Cursor

Edite `~/.cursor/mcp.json` (ou configuração MCP do projeto):

```json
{
  "mcpServers": {
    "fut-pilot": {
      "command": "node",
      "args": ["C:/Users/SEU_USUARIO/Projects/fc26-copilot/mcp-bridge/server.js"]
    }
  }
}
```

> **Migração:** se você usava `fc26-copilot` no MCP, renomeie a chave para `fut-pilot` (ou mantenha o path, só o nome da entrada).

---

## Fluxo de uso

```
Você (chat)  →  MCP Bridge (:3926)  →  Extensão Chrome  →  Web App EA
                      ↓
              Ferramentas JSON-RPC
              (search, solve_sbc, …)
```

1. Web App aberto e **logado**
2. Bridge conectado (verde)
3. No chat: *"Analisa meus DMEs"* ou *"Qual o melhor upgrade hoje?"*

---

## Ferramentas MCP (completo)

### Mercado de transferências

| Ferramenta | Descrição | Confirmação |
|------------|-----------|:-----------:|
| `search_transfer_market` | Busca com filtros (posição, rating, preço, liga…) | Não |
| `buy_now` | Compra imediata (BIN) | **Sim** |
| `place_bid` | Lance em leilão | **Sim** |
| `list_on_market` | Listar carta no mercado | **Sim** |

### Clube e inventário

| Ferramenta | Descrição | Confirmação |
|------------|-----------|:-----------:|
| `get_club_players` | Jogadores do clube (cache ou refresh) | Não |
| `get_unassigned` | Itens não atribuídos | Não |
| `send_to_tradepile` | Enviar para tradepile | Não |
| `send_to_club` | Enviar para o clube | Não |
| `get_fut_cache` | Ler cache local completo | Não |
| `refresh_fut_cache` | Atualizar cache da EA | Não |
| `get_active_squad` | Elenco titular + formação | Não |

### Tradepile e watchlist

| Ferramenta | Descrição | Confirmação |
|------------|-----------|:-----------:|
| `get_tradepile` | Itens listados, vendidos, expirados | Não |
| `get_watchlist` | Alvos de transferência | Não |
| `relist_all` | Relistar expirados | **Sim** |
| `clear_sold` | Limpar vendidos | Não |

### DME / SBC

| Ferramenta | Descrição | Confirmação |
|------------|-----------|:-----------:|
| `get_active_sbcs` | DMEs ativos | Não |
| `get_sbc_sets` | Sets por categoria | Não |
| `get_sbc_requirements` | Requisitos parseados + resumo PT | Não |
| `get_sbc_squad` | Rascunho atual do DME | Não |
| `analyze_sbcs` | **Varre DMEs**, lê `elgReq`, ranqueia custo-benefício | Não |
| `solve_sbc` | Preview do elenco (por `challenge_id`) | Não |
| `solve_sbc_set` | Resolve set inteiro (preview) | Não |
| `apply_sbc_solution` | Aplica elenco (PUT squad) | **Sim** |
| `submit_sbc` | Envia DME (consome cartas) | **Sim** |
| `complete_sbc` | solve → apply → submit (1 fluxo) | **Sim** |

#### Exemplos SBC

```
analyze_sbcs()
analyze_sbcs(daily_only: true, use_futbin_prices: true)
solve_sbc(challenge_id: "17")
complete_sbc(challenge_name: "Silver Upgrade", confirm: true)
```

**Prioridade de cartas no solver:** armazenamento SBC → inegociáveis → negociáveis (menor preço FutBin/mercado).

**Proteção:** cartas 87+, titulares configurados, promos/Future Stars bloqueados por padrão. Use `allow_last_resort: true` só se confirmar uso de carta especial.

### Analytics e preços

| Ferramenta | Descrição | Confirmação |
|------------|-----------|:-----------:|
| `get_club_analytics` | Portfolio, P/L, fodder, charts, gainers/losers | Não |
| `get_player_market_data` | Preço FutBin (não usa EA) | Não |
| `get_coin_balance` | Saldo de coins | Não |

### Sistema

| Ferramenta | Descrição |
|------------|-----------|
| `get_session_status` | Web App, auth, rate limits |
| `keepalive` | Ping anti-timeout de sessão |

---

## Interface da extensão

### Popup

- Status: Web App / Sessão / MCP
- Saldo, rate limits, modo de operação
- **Proteção SBC** (rating mínimo + nomes)
- Resumo **Club Analytics** + botão para painel completo

### Club Analytics (nova aba)

Abra pelo popup → **Abrir painel completo**:

- Portfolio, Investments, Unrealized P/L, Fodder, Transfer List
- Distribuição por rating (Bronze / Silver / Gold)
- Investimento vs valor atual por overall
- Top Gainers / Top Losers
- Toggle **FutBin** + botão **Atualizar**

---

## Modos de operação

| Modo | Comportamento |
|------|---------------|
| **Monitor** | Somente leitura |
| **Assisted** | IA sugere, você confirma |
| **Semi-Auto** | Padrão — writes exigem `confirm: true` em DME/submit |
| **Auto** | Automação ampliada (use com cuidado) |

---

## Segurança da conta

Rate limiter em **todas** as chamadas EA:

| Ação | Delay | Máx/hora | Máx/dia |
|------|-------|----------|---------|
| Busca mercado | 7–15s | 200 | 2.500 |
| Compra / lance | 1–3s | 50 | 400 |
| Leitura clube | 3–8s | 80 | 800 |
| Global | 2–4s | 300 | 3.000 |

Proteções automáticas: **429** (backoff), **461** (ban 24h), **401** (relogin), captcha (parada total).

### Boas práticas

- Não ignore avisos de pausa (60 min)
- Confirme sempre antes de `complete_sbc` / `submit_sbc`
- Recarregue a extensão após `npm run build`
- Use `analyze_sbcs` antes de gastar fodder em DMEs caros

---

## Arquitetura

```
Cliente MCP (Cursor)
    │  JSON-RPC / HTTP :3926
    ▼
mcp-bridge/server.js
    │  WebSocket
    ▼
background/service-worker.js  ← MCP server, rate limit, cache
    │  chrome.tabs.sendMessage
    ▼
content/content-script.js
    │  postMessage
    ▼
content/page-inject.js  →  API EA (utas…/fc26)
```

### Estrutura do projeto

```
├── background/
│   ├── analytics/          # FutBin batch, club analytics
│   ├── cache/              # fut-cache.js
│   ├── sbc/                # solver, parser, analyzer, catalog
│   └── tools/              # MCP tools por domínio
├── content/                # bridge para page context
├── mcp-bridge/             # servidor HTTP/stdio para Cursor
├── ui/
│   ├── popup.*             # popup da extensão
│   └── analytics.*         # painel Club Analytics
├── shared/                 # constants, logger, positions
├── tests/                  # jest (parser, solver, analyzer)
└── docs/sbc-api.md         # referência API SBC EA
```

---

## Desenvolvimento

```bash
npm run dev      # watch + source maps
npm test         # 19 testes (parser, solver, analyzer)
npm run build    # dist/ produção
```

Regras críticas (resumo):

1. Toda chamada EA passa por `rateLimiter.throttle()` + `safeEACall()`
2. Writes sensíveis: `requiresConfirmation: true`
3. Handlers `onMessage`: usar `.then(sendResponse)` + `return true`
4. Estado persistente em `chrome.storage.local`

Detalhes: `.claude/skills/SKILL.md`

---

## Migração FC26 Copilot → FUT Pilot

| Item | Ação |
|------|------|
| Nome na Chrome Web Store / popup | Atualizado para **FUT Pilot** |
| MCP config | Renomear chave para `fut-pilot` (opcional) |
| Pasta do projeto | Pode continuar `fc26-copilot` |
| Cache / proteção | Chaves internas `fc26_*` mantidas (sem perder config) |
| Após pull/build | Recarregar extensão em `chrome://extensions` |

---

## Créditos

- Projeto base: [Eng-Abdelrahman-Mostafa/fc26-copilot](https://github.com/Eng-Abdelrahman-Mostafa/fc26-copilot)
- Fork: [SunFlower-Nz/fc26-copilot](https://github.com/SunFlower-Nz/fc26-copilot)

---

## Disclaimer

Esta extensão interage com serviços da EA de forma **não oficial**. O uso de ferramentas automatizadas pode violar os Termos de Serviço da EA. Banimentos são possíveis. Uso por conta e risco, fins educacionais/pessoais. Os mantenedores não se responsabilizam por ações tomadas pela EA contra sua conta.
