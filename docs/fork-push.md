# Publicar no fork (SunFlower-Nz) — projeto **FUT Pilot**

Fork evoluído do [fc26-copilot](https://github.com/Eng-Abdelrahman-Mostafa/fc26-copilot) original.

## 1. Criar o fork (uma vez)

Abra e clique em **Fork**:
https://github.com/Eng-Abdelrahman-Mostafa/fc26-copilot/fork

## 2. Autenticar GitHub CLI

```powershell
gh auth login
```

Escolha: GitHub.com → HTTPS → Login with browser → conta **SunFlower-Nz**

## 3. Enviar commits

```powershell
cd C:\Users\etava\Projects\fc26-copilot
git push -u origin main
```

## Histórico enviado

| Commit | Conteúdo |
|--------|----------|
| `dcaaaa1` | MCP original (mercado, clube, SBC leitura) |
| `9532ecd` | v2 — solver DME, submit semi-auto, proteção |

## Remotes

- `origin` → seu fork `SunFlower-Nz/fc26-copilot`
- `upstream` → original `Eng-Abdelrahman-Mostafa/fc26-copilot`

## Versionamento (branch + tag por versão)

Ver **[docs/versioning.md](versioning.md)** — cada versão (ex.: 2.4.5) ganha branch `release/v2.4.5`, tag `v2.4.5` e opcionalmente repositório separado.

```powershell
.\scripts\publish-version.ps1 -Version 2.4.5
git push origin main release/v2.4.5 v2.4.5
```

Para sincronizar com o original depois:

```powershell
git fetch upstream
git merge upstream/main
git push origin main
```
