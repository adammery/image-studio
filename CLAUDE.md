# CLAUDE.md — Image Studio

Referenčná karta pre prácu na tomto repe. Pri práci na čomkoľvek v `image-studio/` toto precizuje ako projekt funguje, kam sa zapisuje, a čo robiť NEMÁME.

## Aktuálny stav (2026-04-23)

- **Plan 1 HOTOVÝ a v `main`** — `@image-studio/core` + `image-studio-mcp` (5 MCP tools). MCP server live, overený end-to-end.
- **Plan 2 HOTOVÝ a v `main`** — `@image-studio/extension` VSCode extension: CustomEditorProvider, webview GUI (right panel Crop/Resize/Compress, Compare pill Off/Slider/Preview, zoom/pan, Save & Replace, Before/After info panel), Activity Bar sidebar, keyboard shortcuts, user settings, .vsix packaging.
- **69 testov zelených** (45 core + 21 mcp-server + 3 extension).
- **Build artefakty .vsix** lokálne len: 7.35 MB darwin-arm64-specific `.vsix` pri `packages/extension/image-studio.vsix`. Nie je v git-e (veľká natívna binárka sharp).
- **Žiadna aktívna feature branch** — `main` je čistý. Staršie `feat/plan-1-core-mcp` je stále na GitHube (archív).

**Ďalšie updates → nové branche z `main`** (`git checkout -b feat/…` alebo worktree cez `superpowers:using-git-worktrees`).

## Čo to je

**Image Studio** — VSCode extension (nie fork) s integrovaným image editorom + **MCP server**, cez ktorý AI asistenti (Claude Code, Cursor, Claude Desktop) konvertujú obrázky pomocou natural-language promptov.

**Dva spôsoby použitia, jeden produkt:**

1. **GUI (extension)** — user klikne obrázok v Explorer-i → otvorí sa v Image Studio editore → edituje cez UI → save.
2. **AI (MCP)** — user povie Claude-ovi "skonvertuj všetky PNG v /icons na webp" → Claude zavolá `batch_convert(...)` MCP tool → `core/` urobí prácu.

**Distribúcia:** npm workspace monorepo; extension ako `.vsix`, MCP server ako `npx image-studio-mcp`.

## Extension, nie fork

Pôvodne plánovaný fork Code-OSS bol vedome odmietnutý v prospech extension-u:

- Setup: hodiny vs mesiace
- Žiadny upstream-sync pain
- Funguje aj v Cursor / Windsurf / VSCodium
- Distribúcia: `.vsix` (~7 MB per platforma), nie 200 MB appka per platforma
- Budúci fork zostáva možný — extension kód sa portne do `extensions/` fork-u bez prepisovania

## Scope discipline (kritické)

**Robíme jednu vec a dobre: image editor + AI konverzia.**

Explicitne MIMO scope (nerozširovať bez pokynu usera):
- Rebranding na vlastný IDE / fork
- Figma integrácia
- Laravel / PHP / Blade tools
- Performance tuning / startup optimization
- Akýkoľvek iný non-image feature

Tieto témy prišli v raných brainstorming-och, ale boli stripnuté. Ak sa k nim vrátime, budú to **samostatné projekty**, nie rozšírenie Image Studio.

## Architektúra

Monorepo (npm workspaces) s 3 balíkmi:

```
image-studio/
├── packages/
│   ├── core/         sharp wrappers, pure TS library (žiadny VSCode/MCP import)
│   ├── extension/    VSCode extension + webview GUI
│   └── mcp-server/   MCP protocol server
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

### Kľúčové súbory

**core/**
- `src/applyEdits.ts` — hlavný pipeline (crop → resize → format/quality, s trashOriginal)
- `src/{convert,resize,crop,probe,batch}.ts` — Plan 1 MCP-oriented funkcie
- `src/types.ts` — `EditState`, `ApplyEditsOptions`, `ApplyEditsResult`, `CoreError`, `defaultEditState()`

**extension/**
- `src/extension.ts` — activate() + registrations (editor provider, tree view, delete command, config watcher)
- `src/imageEditorProvider.ts` — CustomEditorProvider (main orchestrator)
- `src/imageTreeProvider.ts` — Activity Bar sidebar tree
- `src/previewEncoder.ts` — debounced sharp → base64 data URL
- `src/bridge.ts` — postMessage types
- `src/webviewContent.ts` — HTML template + CSP
- `media/webview.ts` — UI (single file, ~740 LOC)
- `media/webview.css` — styles
- `scripts/package.sh` — build `.vsix` s production deps v staging dir

## Tech stack

| Vrstva | Package | Verzia |
|---|---|---|
| Jazyk | TypeScript | 5.x |
| Image | `sharp` | ~0.33.x |
| VSCode | `@types/vscode` | 1.90+ |
| MCP | `@modelcontextprotocol/sdk` | 1.x |
| Testy | `vitest` | 1.x / 3.x |
| Glob | `fast-glob` | 3.x |
| Bundler (extension) | `esbuild` | 0.21 |
| Trash | `trash` | 8.x |
| Packaging | `@vscode/vsce` | 2.x |

## Out-of-MVP (odložené — samostatné plány ak sa vrátime)

- Rotate 90° / Flip H/V
- GIF support (multi-frame)
- Undo/Redo history
- Icon-tab right panel variant (ponechaný accordion)
- Backup / hot-exit (unsaved edits neprežívajú close)
- Cross-platform `.vsix` (aktuálne len darwin-arm64)
- Publish na VSCode Marketplace
- CLI wrapper (tenký shim nad `core/`)
- Dark/light theme overrides

## MCP security constraints

Vynucované v `packages/mcp-server/src/validation.ts`:

- **Absolute paths only** — no relative, no `..` traversal
- **Max 100 MB per file**
- **Glob patterns musia mať konkrétny base directory** (`/Users/adam/foo/**/*`, nie `**/*`)
- **Overwrite protection:** ak `dst` existuje a `overwrite: true` nie je nastavené → `OutputExists` error

## Development workflow

```bash
nvm use                          # Node 20 (from .nvmrc)
npm install                      # installs all workspace packages
npm run dev                      # watch mode (core + mcp-server — extension má vlastný)
npm test                         # run tests in all packages (69 celkom)
npm run build                    # compile dist/ for all packages
```

**Extension špecificky:**

```bash
cd packages/extension
npm run build                    # esbuild bundle: dist/extension.js + media/webview.js
npm run dev                      # esbuild --watch
./scripts/package.sh             # build .vsix (→ packages/extension/image-studio.vsix)
```

**VSCode Extension Development Host:**
- Otvor `packages/extension` ako priečinok → stlač **fn+F5** (Mac) alebo **F5**
- Nové okno "Extension Development Host" → otvor priečinok s obrázkami → klikni PNG.

**Install `.vsix`:**
```bash
code --install-extension packages/extension/image-studio.vsix
```

## Git conventions

- `main` je single source of truth
- **Atomické commits: jedna zmena = jeden commit**
- Commit message po anglicky, imperatívny tón ("Add X", "Fix Y", "Refactor Z")
- Nikdy `--amend` po push-i na remote
- Feature branche: `feat/<krátky-popis>`, mergnú sa FF do main, potom zmazať
- Remote: `https://github.com/adammery/image-studio` (privátny repo)

## TDD default (kde dáva zmysel)

- **`core/`** — každá nová funkcia má failing test pred implementáciou.
- **`mcp-server/`** — integration testy pre dispatchTool.
- **`extension/`** — len ne-VSCode logika (previewEncoder debounce). UI verifikácia je manuálna cez F5.

## Testing strategy

- **`core/` (45 testov)** — plné unit coverage cez vitest, fixtures generované programmatically v `beforeAll()`
- **`mcp-server/` (21 testov)** — integration: volaj dispatchTool priamo, verify output + structured errors
- **`extension/` (3 testy)** — len previewEncoder (debounce + dispose). Ostatné cez `test/MANUAL.md` checklist + user-klik
- **Manual test checklist:** `packages/extension/test/MANUAL.md`

## Session notes pre Claude Code

**User je moje oči pre GUI.** VSCode Extension Development Host spúšťa user. Keď implementujem UI zmeny, user klikne a reportuje. Nemôžem sa spoľahnúť na "vyzerá to OK" — musím sa pýtať na konkrétne symptómy.

**Scope creep je zakázaný.** Ak user spomenie feature mimo scope, overím v `docs/superpowers/specs/`. Ak to tam nie je, poviem: "to nie je v scope, chceš to pridať explicitne?"

**Commits robíme často.** Jedna zmena → jeden commit s jasnou správou.

**Sharp native binary per platform.** `.vsix` je platform-specific. Ak buildujeme pre iný OS, treba nainštalovať to `@img/sharp-<platform>` balíky a re-package.

**Claude Code MCP config** (pre lokálny dev MCP servera):

```bash
claude mcp add --transport stdio --scope user image-studio \
  -- node /Users/adam/Projects/image-studio/packages/mcp-server/dist/index.js
```

(NIE cez `mcpServers` v `~/.claude/settings.json` — schéma to odmieta. MCP config ide do `~/.claude.json` cez `claude mcp add` CLI.)

## Pointers

- **Main design spec:** `docs/superpowers/specs/2026-04-22-image-editor-design.md`
- **Plan 2 design (supersedes spec §5):** `docs/superpowers/specs/2026-04-23-plan-2-extension-gui-design.md`
- **Plan 1 implementation plan (done):** `docs/superpowers/plans/2026-04-23-plan-1-core-and-mcp-server.md`
- **Plan 2 implementation plan (done):** `docs/superpowers/plans/2026-04-23-plan-2-extension-gui.md`
- **Extension README (marketplace page):** `packages/extension/README.md`
- **Extension manual test checklist:** `packages/extension/test/MANUAL.md`
- **Root README:** `README.md`
- **GitHub:** `https://github.com/adammery/image-studio` (privátny, `main` = latest)

## Pre novú session-ku (kontinuita)

Ak otvoríš Claude Code v tomto repe, štartovací briefing:

1. **Prečítaj tento CLAUDE.md celý** — pochopíš scope, architektúru, stav.
2. **`git log --oneline -10`** — posledné zmeny.
3. **`npm test`** — 69/69 zelených potvrdí zdravý baseline.
4. **Aktuálny stav:** Plan 1 + Plan 2 v main. Žiadna aktívna feature branch. Extension je funkčná a zabalená.
5. **Ak user chce nové features** → vytvoriť nový feat branch (`git checkout -b feat/...` alebo worktree). Pre väčšie zmeny začať so `superpowers:brainstorming`.
6. **Scope discipline** — memory uložená: žiadny scope creep do Figma / fork / Laravel / rotate / flip / GIF bez explicitného pokynu.
7. **Nespúšťaj implementáciu preemptívne** — spýtaj sa usera čo ďalej.
