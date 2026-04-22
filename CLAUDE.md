# CLAUDE.md — VSCode Image Editor Fork

## Čo buildujeme

Fork **Code - OSS** (open-source základ VSCode) s natívne zabudovaným image editorom.
Nie extension — priamo integrované do editora ako rozšírenie existujúceho `imagePreview` modulu.

Inšpirácia: Cursor, Windsurf, VSCodium — všetko sú forky Code - OSS s vlastnými úpravami.

---

## Ciele projektu

### Primárny cieľ
Nahradiť jednoduchý read-only image preview vo VSCode plnohodnotným **image editorom** priamo v editore — bez externých nástrojov, bez API, 100% lokálne a offline.

### Čo chceme vedieť robiť
1. **Crop** — drag handles na canvase, výber oblasti, aplikovanie
2. **Resize** — zmena rozmerov v px alebo %
3. **Rotate / Flip** — 90°, 180°, horizontálne/vertikálne
4. **Konverzia formátov** — PNG → WebP, AVIF, JPEG, GIF a naopak
5. **Kompresia** — režim lossless alebo lossy s presnou hodnotou kvality (0–100), živý náhľad veľkosti výsledného súboru
6. **Export / Save** — uložiť ako nový súbor vedľa originálu alebo prepísať

---

## Technický stack

| Vrstva | Technológia | Účel |
|---|---|---|
| Základ | Code - OSS (Microsoft/vscode repo) | Fork základu |
| Jazyk | TypeScript | Celý VSCode je v TS |
| Image operácie | `sharp` (npm) | Crop, resize, konverzia, kompresia |
| Editor UI | WebView API + Canvas API | Crop handles, preview |
| Build systém | Gulp (existujúci v repo) | Rovnaký ako VSCode |
| Runtime | Electron (Node.js backend) | Sharp beží na Node strane |

### Prečo `sharp` a nie externé API
- Beží lokálne, žiadny internet
- Najrýchlejšia Node.js image knižnica (libvips pod kapotou)
- Podporuje: PNG, JPEG, WebP, AVIF, GIF, TIFF, SVG
- Open-source, MIT licencia

---

## Architektúra

```
Code - OSS fork
└── src/vs/workbench/contrib/
    └── imagePreview/              ← existujúci modul (len read-only preview)
        ├── browser/
        │   ├── imagePreviewEditor.ts     ← UPRAVIŤ: pridať toolbar + canvas
        │   ├── imageEditorWebview.ts     ← NOVÝ: WebView s crop UI
        │   └── imageEditorToolbar.ts     ← NOVÝ: tlačidlá akcií
        └── node/
            └── imageProcessor.ts        ← NOVÝ: sharp operácie (Node strana)
```

### Komunikácia WebView ↔ Node

```
[WebView Canvas UI]
      ↕  postMessage
[Extension Host - TypeScript]
      ↕  Node.js call
[sharp - imageProcessor.ts]
      ↓
[Súbor na disku]
```

---

## Fázy vývoja

### Fáza 1 — Fork & Setup
- [ ] Forknúť `microsoft/vscode` repo
- [ ] Nastaviť build prostredie (Node.js, Yarn, Python)
- [ ] Prvý úspešný build (`./scripts/code.sh`)
- [ ] Premenúvať / rebranding (voliteľné)

### Fáza 2 — Image Preview rozšírenie
- [ ] Pridať `sharp` do Electron node_modules
- [ ] Otvoriť existujúci `imagePreviewEditor.ts` a pochopiť štruktúru
- [ ] Pridať toolbar pod/nad preview (Rotate, Save As)
- [ ] Implementovať základný export cez sharp

### Fáza 3 — Crop UI
- [ ] WebView s `<canvas>` elementom
- [ ] Drag handles na canvase (JavaScript)
- [ ] Odoslať crop coords cez `postMessage` do Node
- [ ] Sharp `extract()` podľa coords → uložiť

### Fáza 4 — Konverzia & Kompresia
- [ ] UI panel: výber formátu (PNG / WebP / AVIF / JPEG)
- [ ] Toggle: **Lossless** (checkbox) — ak zaškrtnuté, slider sa skryje
- [ ] Slider kvality (0–100) pre lossy režim, s preset tlačidlami (92 / 80 / 60)
- [ ] Live preview veľkosti výsledného súboru pred uložením
- [ ] Sharp konverzia + uloženie

### Fáza 5 — Polish
- [ ] Undo/Redo historia
- [ ] Porovnanie pred/po (split view)
- [ ] Keyboard skratky
- [ ] Dark/light theme podpora

---

## Kľúčové súbory v repo

```
vscode/
├── src/vs/workbench/contrib/imagePreview/   ← hlavná práca tu
├── extensions/                               ← built-in extensiony
├── build/                                    ← gulp build skripty
└── scripts/
    ├── code.sh          ← spustenie v dev mode (macOS/Linux)
    └── code.bat         ← spustenie v dev mode (Windows)
```

---

## Lokálny build (prvý setup)

```bash
# 1. Klonovanie
git clone https://github.com/microsoft/vscode.git
cd vscode

# 2. Závislosti
yarn install

# 3. Build
yarn run compile

# 4. Spustenie
./scripts/code.sh       # macOS/Linux
.\scripts\code.bat      # Windows
```

Požiadavky: Node.js 18+, Python 3.x, Git, C++ build tools (pre sharp/native modules)

---

## Sharp — kompresia a konverzia (detaily)

```typescript
import sharp from 'sharp';

// WebP — lossless
await sharp('input.png').webp({ lossless: true }).toFile('output.webp');

// WebP — lossy s kvalitou
await sharp('input.png').webp({ quality: 92 }).toFile('output.webp');
await sharp('input.png').webp({ quality: 80 }).toFile('output.webp');
await sharp('input.png').webp({ quality: 60 }).toFile('output.webp');

// AVIF — lossless
await sharp('input.png').avif({ lossless: true }).toFile('output.avif');

// AVIF — lossy (quality 1–100, default 50)
await sharp('input.png').avif({ quality: 80 }).toFile('output.avif');

// JPEG
await sharp('input.png').jpeg({ quality: 85 }).toFile('output.jpg');

// PNG (lossless vždy, compressionLevel 0–9)
await sharp('input.jpg').png({ compressionLevel: 9 }).toFile('output.png');

// Live preview veľkosti — bez zápisu na disk
const { data, info } = await sharp('input.png')
  .webp({ quality: 80 })
  .toBuffer({ resolveWithObject: true });
console.log(`Veľkosť: ${info.size} bytes (${(info.size / 1024).toFixed(1)} KB)`);
```

### Prehľad možností podľa formátu

| Formát | Lossless | Quality range | Poznámka |
|---|---|---|---|
| WebP | ✅ áno | 0–100 | Najlepší pomer kvalita/veľkosť |
| AVIF | ✅ áno | 1–100 | Najlepšia kompresia, pomalší encode |
| JPEG | ❌ nie | 1–100 | Len lossy |
| PNG | ✅ vždy | compressionLevel 0–9 | Vždy lossless, level = rýchlosť |

---

## Sharp — základné príklady

```typescript
import sharp from 'sharp';

// Konverzia PNG → WebP s kompresiou
await sharp('input.png')
  .webp({ quality: 80 })
  .toFile('output.webp');

// Crop
await sharp('input.png')
  .extract({ left: 10, top: 10, width: 300, height: 200 })
  .toFile('cropped.png');

// Resize
await sharp('input.png')
  .resize(800, 600)
  .toFile('resized.png');

// Zistenie veľkosti bez uloženia (pre preview)
const { size } = await sharp('input.png')
  .webp({ quality: 80 })
  .toBuffer({ resolveWithObject: true });
console.log(`Výsledok: ${size} bytes`);
```

---

## Poznámky

- **Figma integrácia** — odložená, nie v MVP scope
- **Nepoužívame externé API** — všetko beží lokálne cez sharp
- **Kompatibilita** — fork by mal fungovať na Windows, macOS, Linux (rovnako ako VSCode)
- Projekt je vhodný aj ako **portfolio** — ukazuje znalosť Electron, TypeScript, image processing

---

*Posledná aktualizácia: Apríl 2026*
