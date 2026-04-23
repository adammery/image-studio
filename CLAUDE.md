# CLAUDE.md — Image Studio

Referenčná karta pre prácu na tomto repe. Pri práci na čomkoľvek v `image-studio/` toto precizuje ako projekt funguje, kam sa zapisuje, a čo robiť NEMÁME.

## Aktuálny stav (2026-04-23)

- **Plan 1 HOTOVÝ a mergnutý do `main`** — `feat/plan-1-core-mcp` FF-mergnutá, 57/57 testov zelených. MCP server live, user overil end-to-end.
- **Plan 2 spec napísaný** — `docs/superpowers/specs/2026-04-23-plan-2-extension-gui-design.md` (448 riadkov). Definuje novú layout: image vľavo, right panel (Crop/Resize/Compress), Compare pill (Slider/Side-by-side), zoom/pan, Save & Trash, Before/After info panel.
- **Plan 2 implementation plan ešte nie je napísaný** — ďalší krok je `superpowers:writing-plans` s inputom z hore uvedeného spec-u.
- **Build stav:** `node_modules/` nainštalované, `packages/core/dist/` + `packages/mcp-server/dist/` skompilované. `packages/extension/` zatiaľ neexistuje. Pre clean checkout: `nvm use && npm install && npm run build`.

## Čo to je

**Image Studio** — VSCode extension (nie fork) s integrovaným image editorom + **MCP server**, cez ktorý AI asistenti (Claude Code, Cursor, Claude Desktop) konvertujú obrázky pomocou natural-language promptov.

**Príklad AI flow:**
> User v Claude Code chat-e: *"Skonvertuj všetky PNG v `/icons` na webp quality 80."*
>
> Claude zavolá MCP tool `batch_convert({ pattern, format: 'webp', quality: 80 })` → `core/` volá sharp → súbory na disku sú preformátované → Claude reportuje výsledok.

**Extension + MCP spolu tvoria jeden produkt,** distribuovaný ako npm workspace monorepo.

## Extension, nie fork

Pôvodne plánovaný fork Code-OSS bol vedome odmietnutý v prospech extension-u:

- Setup: hodiny vs mesiace
- Žiadny upstream-sync pain
- Funguje aj v Cursor / Windsurf / VSCodium
- Distribúcia: 100 KB `.vsix`, nie 200 MB appka per platforma
- Budúci fork zostáva možný — extension kód sa portne do `extensions/` fork-u bez prepisovania

## Scope discipline (kritické)

**Robíme jednu vec a dobre: image editor + AI konverzia.**

Explicitne MIMO scope (nerozširovať bez pokynu usera):
- Rebranding na vlastný IDE / fork
- Figma integrácia
- Laravel focus, PHP/Blade tools
- Performance tuning / startup optimization
- Custom chrome / UI cleanup
- Akýkoľvek iný non-image-editing feature

Tieto témy prišli v raných brainstoring-och, ale boli stripnuté. Ak sa k nim niekedy vrátime, budú to **samostatné projekty**, nie rozšírenie Image Studio.

## Architektúra

Monorepo (npm workspaces) s 3 balíkmi:

```
image-studio/
├── packages/
│   ├── core/         sharp wrappers, pure TS library (žiadny VSCode/MCP import)
│   ├── extension/    VSCode extension + webview GUI (Plan 2)
│   └── mcp-server/   MCP protocol server (Plan 1)
├── docs/
│   └── superpowers/
│       ├── specs/    design docs (authoritative)
│       └── plans/    implementation plans (task-by-task TDD)
├── package.json      workspaces root
├── tsconfig.base.json
└── .nvmrc            Node 20 LTS
```

**Pravidlá hraníc:**

- `core/` je jediným miestom pre sharp volania
- `core/` nemá závislosť na `vscode` ani na MCP SDK
- `extension/` a `mcp-server/` majú `@image-studio/core` ako dependency cez workspace link
- Každý balík má vlastný `package.json`, `tsconfig.json`, `vitest.config.ts`

## Tech stack

| Vrstva | Package | Verzia |
|---|---|---|
| Jazyk | TypeScript | 5.x |
| Image | `sharp` | ~0.33.x |
| VSCode | `@types/vscode` | 1.90+ |
| MCP | `@modelcontextprotocol/sdk` | 1.x |
| Testy | `vitest` | 1.x |
| Glob | `fast-glob` | 3.x |
| Lint | `eslint` + `@typescript-eslint` | 8/7 |
| Packaging | `vsce` | latest (Plan 2) |

## MVP scope (čo ideme stavať v prvých dvoch planoch)

**Plan 1 — Core + MCP Server** (`docs/superpowers/plans/2026-04-23-plan-1-core-and-mcp-server.md`)

12 tasks:
1. Monorepo root setup
2. Core package skeleton + types
3. Test fixtures generator (programmatic)
4. `getImageInfo` (probe.ts)
5. `convertImage`
6. `resizeImage`
7. `cropImage`
8. `batchConvert`
9. MCP server package skeleton
10. Validation utilities (paths, size, globs)
11. MCP server + 5 tools registered + integration tests
12. End-to-end verifikácia s Claude Code

Výstup: funkčný `image-studio-mcp` npm package, Claude Code cez MCP volá všetkých 5 tools.

**Plan 2 — VSCode Extension GUI** — spec hotový (`docs/superpowers/specs/2026-04-23-plan-2-extension-gui-design.md`), implementation plan sa píše.

Right panel (Crop/Resize/Compress) + Compare pill (Slider/Side-by-side) + zoom/pan + Save & Trash + Before/After info panel.

### NIE je v MVP (odložené):

- Rotate 90° / Flip H/V
- GIF support (multi-frame)
- Undo/Redo history
- Split-view pred/po
- Live compression preview (beyond status-bar estimate v Plan 2)
- CLI wrapper (príde neskôr ako tenký shim nad `core/`)
- Dark/light theme overrides

## MCP security constraints (boundary rules)

Vynucované v `packages/mcp-server/src/validation.ts`:

- **Absolute paths only** — no relative, no `..` traversal
- **Max 100 MB per file**
- **Glob patterns musia mať konkrétny base directory** (`/Users/adam/foo/**/*`, nie `**/*`)
- **Overwrite protection:** ak `dst` existuje a `overwrite: true` nie je nastavené → `OutputExists` error

## Development workflow

```bash
nvm use                          # Node 20 (from .nvmrc)
npm install                      # installs all workspace packages
npm run dev                      # watch mode (all packages in parallel)
npm test                         # run tests in all packages
npm test -- --watch              # continuous testing
npm run build                    # compile dist/ for all packages
npm run lint                     # ESLint check
```

**Per-package:**

```bash
npm test --workspace=packages/core --prefix /Users/adam/Projects/image-studio
npm run build --workspace=packages/mcp-server --prefix /Users/adam/Projects/image-studio
```

## Git conventions

- `main` je single source of truth
- **Atomické commits: jeden task = jeden commit** (podľa `docs/superpowers/plans/*.md`)
- Commit message po anglicky, imperatívny tón ("Add X", "Fix Y", "Refactor Z")
- Nikdy `--amend` po push-i na remote
- Remote: `https://github.com/adammery/image-studio`

## TDD default

Každý task v plane má TDD cyklus:

1. Write failing test
2. Run, verify it fails for the RIGHT reason
3. Write minimal implementation
4. Run, verify it passes
5. Commit

**Nepíšeme kód bez failing testu.** Výnimky: trivial config súbory (tsconfig, package.json skeleton).

## Testing strategy

- **`core/`** — plné unit testy cez vitest, fixtures generované programatically v `beforeAll()`, target >90% coverage
- **`mcp-server/`** — integration testy: volaj `dispatchTool` priamo, verify output + structured error responses
- **`extension/`** (Plan 2) — sparse auto-testy (VSCode extension testing je flaky), **hlavné overenie je manuálne** cez Extension Development Host (F5)

## Session notes pre Claude Code

**User je moje oči pre GUI.** VSCode Extension Development Host spúšťa user. Keď implementujem UI, user klikne a reportuje. Nemôžem sa spoľahnúť na "vyzerá to OK" — musím sa pýtať na konkrétne symptómy.

**Scope creep je zakázaný.** Ak user spomenie feature mimo MVP, poviem: "to nie je v MVP scope podľa `docs/superpowers/specs/2026-04-22-image-editor-design.md`, chceš to pridať explicitne?"

**Subagent-driven execution je default** pre plány. Pre každý task v pláne → čerstvý subagent cez `superpowers:subagent-driven-development`.

**Commits robíme často.** Každý zelený test → commit. Žiadne "commit na konci session-u".

**Sharp má natívne binary per platform.** Pri prvom install sa môže správať inak na macOS vs Linux — ak build zlyhá na `node-gyp`, často pomôže `npm rebuild sharp`.

**Claude Code MCP config pre lokálny dev** (kým nie je publikovaný na npm):

```bash
claude mcp add --transport stdio --scope user image-studio \
  -- node /Users/adam/Projects/image-studio/packages/mcp-server/dist/index.js
```

**Pozor:** NIE cez `mcpServers` v `~/.claude/settings.json` — schéma to odmieta. MCP config ide do `~/.claude.json` cez `claude mcp add` CLI.

## Pointers

- **Design spec (authoritative):** `docs/superpowers/specs/2026-04-22-image-editor-design.md`
- **Plan 1 (core + MCP) — HOTOVÝ:** `docs/superpowers/plans/2026-04-23-plan-1-core-and-mcp-server.md`
- **Plan 2 (VSCode extension) — spec hotový:** `docs/superpowers/specs/2026-04-23-plan-2-extension-gui-design.md`. Implementation plan sa píše cez `superpowers:writing-plans`.
- **Backup pôvodného fork-plánu:** `CLAUDE-backup.md` (iba archív, neaplikuje sa)
- **README:** `README.md` (user-facing, install + `claude mcp add` setup)
- **GitHub:** `https://github.com/adammery/image-studio` (branch `feat/plan-1-core-mcp` awaiting merge do `main`)

## Pre novú session-ku (kontinuita)

Ak user otvorí Claude Code v tomto repe a začne fresh session-ku, štartovací briefing:

1. **Prečítaj tento CLAUDE.md celý** — pochopíš scope, architektúru, stav.
2. **Skontroluj `git log --oneline -20`** — uvidíš celú prácu Plan 1.
3. **`npm test` v root-e** — potvrdí 57 testov zelených.
4. **Pozri pending work:**
   - Ak branch `feat/plan-1-core-mcp` existuje a nie je mergnutý → PR otvorený, user pravdepodobne čaká na merge alebo štart Plan 2.
   - Ak mergnutý/zmazaný → Plan 1 v `main`, pokračuj Plan 2.
5. **Memory:** scope-discipline feedback uložený — žiadny scope creep do Figma/fork/Laravel/rotate/flip/GIF bez explicitného pokynu.
6. **Spýtaj sa usera čo ďalej** — nespúšťaj implementáciu preemptívne.
