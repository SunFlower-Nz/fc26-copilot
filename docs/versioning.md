# Versionamento no GitHub — FUT Pilot

Cada versão publicada fica **congelada** no GitHub de forma independente. Você escolhe uma das duas estratégias.

## Opção A — Recomendada: um repositório, branch + tag por versão

Repositório: `SunFlower-Nz/fc26-copilot` (ou `fut-pilot`)

| Versão | Branch | Tag | GitHub Release |
|--------|--------|-----|----------------|
| 2.4.5 | `release/v2.4.5` | `v2.4.5` | Release notes da versão |
| 2.4.6 | `release/v2.4.6` | `v2.4.6` | … |

- **`main`** — desenvolvimento contínuo (última versão)
- **`release/vX.Y.Z`** — snapshot imutável daquela versão (voltar, comparar, hotfix)
- **`vX.Y.Z`** — tag anotada para baixar ZIP da versão exata

### Publicar uma versão nova

```powershell
cd C:\Users\etava\Projects\fc26-copilot
.\scripts\publish-version.ps1 -Version 2.4.5
git push origin main
git push origin release/v2.4.5
git push origin v2.4.5
```

Com GitHub CLI (Release automático):

```powershell
gh release create v2.4.5 --title "FUT Pilot v2.4.5" --notes-file RELEASE-v2.4.5.md
```

---

## Opção B — Repositório GitHub **separado** por versão

Útil se quiser links distintos, permissões diferentes ou forks “congelados” por cliente.

| Versão | Repositório |
|--------|-------------|
| 2.4.5 | `SunFlower-Nz/fut-pilot-v2.4.5` |
| 2.4.6 | `SunFlower-Nz/fut-pilot-v2.4.6` |

### Criar repo só para esta versão

```powershell
.\scripts\publish-version.ps1 -Version 2.4.5 -NewRepo "fut-pilot-v2.4.5"
```

Requer `gh auth login` na conta **SunFlower-Nz**.

---

## Primeira vez — criar o fork

Se `git push` der **Repository not found**:

1. Fork: https://github.com/Eng-Abdelrahman-Mostafa/fc26-copilot/fork  
   **ou** criar repo vazio: https://github.com/new → `fc26-copilot`
2. Autenticar:

```powershell
gh auth login
git remote set-url origin https://github.com/SunFlower-Nz/fc26-copilot.git
git push -u origin main
git push origin --tags
git push origin 'release/*'
```

---

## Histórico deste fork

| Versão | Conteúdo principal |
|--------|-------------------|
| v2.0 | Solver DME, submit semi-auto, proteção de cartas |
| v2.4.x | FUT Pilot rename, popup DME, navegação Web App, MCP reset_rate_limits, ea-validator |
| v2.4.5 | Solver alinhado à análise, fix rate limit 494, dom navigation |
