# Versionamento no GitHub — FUT Pilot

Todas as atualizações vão para a branch **`main`**. Cada commit na main é a versão mais recente.

## Fluxo padrão

1. Desenvolver e commitar na `main`
2. Atualizar `manifest.json` / `package.json` com a versão (ex.: `2.4.6`)
3. Enviar:

```powershell
cd C:\Users\etava\Projects\fc26-copilot
git push origin main
```

## Tag opcional (Release no GitHub)

Se quiser marcar uma versão no histórico (ZIP baixável), use tag **sem** branch separada:

```powershell
git tag -a v2.4.5 -m "FUT Pilot v2.4.5"
git push origin v2.4.5
gh release create v2.4.5 --title "FUT Pilot v2.4.5" --notes-file RELEASE-v2.4.5.md
```

Ou use o script (só bump + tag):

```powershell
.\scripts\publish-version.ps1 -Version 2.4.6
git push origin main
git push origin v2.4.6
```

## Primeira vez — criar o fork

Se `git push` der **Repository not found**:

1. Fork: https://github.com/Eng-Abdelrahman-Mostafa/fc26-copilot/fork  
   **ou** repo novo: https://github.com/new → `fc26-copilot`
2. Autenticar e enviar:

```powershell
gh auth login
git remote set-url origin https://github.com/SunFlower-Nz/fc26-copilot.git
git push -u origin main
```

## Histórico na main

| Versão | Conteúdo principal |
|--------|-------------------|
| v2.0 | Solver DME, submit semi-auto, proteção de cartas |
| v2.4.x | FUT Pilot, popup DME, navegação Web App, MCP reset_rate_limits |
| v2.4.5 | Solver alinhado à análise, fix rate limit 494, dom navigation |
