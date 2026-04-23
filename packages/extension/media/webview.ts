declare const acquireVsCodeApi: () => {
  postMessage: (msg: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};

const vscode = acquireVsCodeApi();

document.getElementById('root')!.innerHTML = /* html */ `
<div id="error-banner"></div>
<div id="main">
  <div id="canvas-area">
    <div id="compare-pill">
      <button data-mode="off">Off</button>
      <button data-mode="slider" class="active">Slider</button>
      <button data-mode="sxs">Side by side</button>
    </div>
    <div id="image-container">
      <img id="main-image" alt="Image preview" draggable="false">
      <img id="compare-before" alt="original" draggable="false">
      <img id="compare-after"  alt="after"    draggable="false">
      <div id="slider-handle"><div id="slider-knob">⇆</div></div>
    </div>
    <div id="crop-overlay">
      <div id="crop-selection">
        <div class="crop-handle nw" data-dir="nw"></div>
        <div class="crop-handle ne" data-dir="ne"></div>
        <div class="crop-handle sw" data-dir="sw"></div>
        <div class="crop-handle se" data-dir="se"></div>
        <div class="crop-handle n"  data-dir="n"></div>
        <div class="crop-handle s"  data-dir="s"></div>
        <div class="crop-handle w"  data-dir="w"></div>
        <div class="crop-handle e"  data-dir="e"></div>
      </div>
    </div>
    <div id="crop-actions">
      <button class="btn primary" id="crop-apply">Apply</button>
      <button class="btn"         id="crop-cancel">Cancel</button>
    </div>
    <div id="zoom-pill">
      <button id="zoom-out">−</button>
      <span id="zoom-pct">Fit</span>
      <button id="zoom-in">+</button>
      <button id="zoom-fit">Fit</button>
    </div>
  </div>

  <div id="panel">
    <div id="panel-sections">

      <div class="panel-section" id="section-crop">
        <div class="section-head" data-section="crop">
          <span class="section-caret">▾</span> Crop
        </div>
        <div class="section-body">
          <button class="btn full" id="crop-start">Start crop</button>
        </div>
      </div>

      <div class="panel-section" id="section-resize">
        <div class="section-head" data-section="resize">
          <span class="section-caret">▾</span> Resize
        </div>
        <div class="section-body">
          <div class="row">
            <label>Width</label>
            <input class="inp w68" id="resize-w" type="number" min="1">
            <select class="inp w42" id="resize-unit"><option value="px">px</option><option value="%">%</option></select>
          </div>
          <div class="row">
            <label>Height</label>
            <input class="inp w68" id="resize-h" type="number" min="1">
          </div>
          <div id="resize-error" class="inp-error-text" style="display:none"></div>
          <label class="check-row">
            <input type="checkbox" id="resize-lock" checked> Lock aspect ratio
          </label>
          <button class="btn" id="resize-apply">Apply</button>
        </div>
      </div>

      <div class="panel-section" id="section-compress">
        <div class="section-head" data-section="compress">
          <span class="section-caret">▾</span> Compress
        </div>
        <div class="section-body">
          <div class="row">
            <label>Format</label>
            <select class="inp flex1" id="format-select">
              <option value="same">Same as source</option>
              <option value="png">PNG</option>
              <option value="jpeg">JPEG</option>
              <option value="webp">WebP</option>
              <option value="avif">AVIF</option>
            </select>
          </div>
          <div id="quality-presets" class="quality-presets">
            <button class="preset-btn" data-q="92">High</button>
            <button class="preset-btn" data-q="85">Med</button>
            <button class="preset-btn" data-q="75">Low</button>
            <span class="preset-custom" id="preset-custom-label"></span>
          </div>
          <div class="row" id="quality-row">
            <label>Quality</label>
            <input type="range" id="quality-slider" min="0" max="100" value="85">
            <span class="qnum" id="quality-num">85</span>
          </div>
          <label class="check-row" id="lossless-row" style="display:none">
            <input type="checkbox" id="lossless-check"> Lossless
          </label>
        </div>
      </div>

    </div>

    <div id="save-footer">
      <div id="save-row">
        <button class="btn primary" id="btn-save" style="flex:1">Save</button>
        <button class="btn"         id="btn-save-as" style="flex:1">Save As…</button>
      </div>
      <label id="trash-row" class="check-row disabled" title="No original to remove — same file is being overwritten">
        <input type="checkbox" id="trash-check" disabled>
        Move original to Trash after save
      </label>
    </div>
  </div>
</div>

<div id="info-panel">
  <div class="info-col" id="info-before">
    <span class="info-title">Before</span>
    <span class="info-fname" id="before-fname">—</span>
    <span class="info-meta"  id="before-meta">—</span>
    <span class="info-size"  id="before-size">—</span>
  </div>
  <div class="info-arrow">→</div>
  <div class="info-col" id="info-after">
    <span class="info-title">After (estimate)</span>
    <span class="info-fname" id="after-fname">—</span>
    <span class="info-meta"  id="after-meta">—</span>
    <span class="info-size"  id="after-size">—</span>
  </div>
</div>
`;

// ── Types (mirrored from bridge.ts — no Node imports in webview) ────────────
interface EditState {
  crop?:    { x: number; y: number; width: number; height: number };
  resize?:  { width: number; height: number; lockAspect: boolean };
  format:   'same' | 'png' | 'jpeg' | 'webp' | 'avif';
  quality:  number;
  lossless: boolean;
  compareMode:   'off' | 'slider' | 'sxs';
  trashOriginal: boolean;
}
interface ImageInfo {
  width: number; height: number; format: string; size: number;
  hasAlpha: boolean; colorspace: string;
}

// ── State ────────────────────────────────────────────────────────────────────
const QUALITY_PRESETS = [92, 85, 75] as const;

let editState: EditState = {
  format: 'same', quality: 85, lossless: false,
  compareMode: 'slider', trashOriginal: false,
};
let srcMeta: ImageInfo | null = null;
let srcPath = '';
let srcUri  = '';

// ── DOM refs ─────────────────────────────────────────────────────────────────
const mainImage      = document.getElementById('main-image')      as HTMLImageElement;
const compareBeforeImg = document.getElementById('compare-before') as HTMLImageElement;
const compareAfterImg  = document.getElementById('compare-after')  as HTMLImageElement;
const sliderHandle   = document.getElementById('slider-handle')   as HTMLElement;
const imageContainer = document.getElementById('image-container') as HTMLElement;
const errorBanner    = document.getElementById('error-banner')    as HTMLElement;
const comparePill    = document.getElementById('compare-pill')    as HTMLElement;
const cropOverlay    = document.getElementById('crop-overlay')    as HTMLElement;
const cropSelection  = document.getElementById('crop-selection')  as HTMLElement;
const cropActions    = document.getElementById('crop-actions')    as HTMLElement;
const cropApply      = document.getElementById('crop-apply')      as HTMLButtonElement;
const cropCancel     = document.getElementById('crop-cancel')     as HTMLButtonElement;
const cropStart      = document.getElementById('crop-start')      as HTMLButtonElement;
const zoomPill       = document.getElementById('zoom-pill')       as HTMLElement;
const zoomPct        = document.getElementById('zoom-pct')        as HTMLElement;
const zoomIn         = document.getElementById('zoom-in')         as HTMLButtonElement;
const zoomOut        = document.getElementById('zoom-out')        as HTMLButtonElement;
const zoomFit        = document.getElementById('zoom-fit')        as HTMLButtonElement;
const canvasArea     = document.getElementById('canvas-area')     as HTMLElement;
const beforeFname    = document.getElementById('before-fname')    as HTMLElement;
const beforeMeta     = document.getElementById('before-meta')     as HTMLElement;
const beforeSize     = document.getElementById('before-size')     as HTMLElement;
const afterFname     = document.getElementById('after-fname')     as HTMLElement;
const afterMeta      = document.getElementById('after-meta')      as HTMLElement;
const afterSize      = document.getElementById('after-size')      as HTMLElement;
const formatSelect   = document.getElementById('format-select')   as HTMLSelectElement;
const qualitySlider  = document.getElementById('quality-slider')  as HTMLInputElement;
const qualityNum     = document.getElementById('quality-num')     as HTMLElement;
const qualityRow     = document.getElementById('quality-row')     as HTMLElement;
const losslessRow    = document.getElementById('lossless-row')    as HTMLElement;
const losslessCheck  = document.getElementById('lossless-check')  as HTMLInputElement;
const trashRow       = document.getElementById('trash-row')       as HTMLElement;
const trashCheck     = document.getElementById('trash-check')     as HTMLInputElement;
const btnSave        = document.getElementById('btn-save')        as HTMLButtonElement;
const btnSaveAs      = document.getElementById('btn-save-as')     as HTMLButtonElement;
const resizeW        = document.getElementById('resize-w')        as HTMLInputElement;
const resizeH        = document.getElementById('resize-h')        as HTMLInputElement;
const resizeUnit     = document.getElementById('resize-unit')     as HTMLSelectElement;
const resizeLock     = document.getElementById('resize-lock')     as HTMLInputElement;
const resizeApply    = document.getElementById('resize-apply')    as HTMLButtonElement;
const resizeError    = document.getElementById('resize-error')    as HTMLElement;

// ── Helpers ───────────────────────────────────────────────────────────────────
function basename(p: string): string { return p.split('/').pop() ?? p; }
function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1_048_576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1_048_576).toFixed(2)} MB`;
}
function fmtExt(state: EditState, srcFormat: string): string {
  const f = state.format === 'same' ? srcFormat : state.format;
  return { jpeg: '.jpg', png: '.png', webp: '.webp', avif: '.avif' }[f] ?? `.${f}`;
}
function afterFilename(srcName: string, state: EditState, srcFmt: string): string {
  const dot = srcName.lastIndexOf('.');
  return (dot > -1 ? srcName.slice(0, dot) : srcName) + fmtExt(state, srcFmt);
}
function fmtLabel(state: EditState, srcFmt: string): string {
  const f = state.format === 'same' ? srcFmt : state.format;
  const parts = [f.toUpperCase()];
  if (f !== 'png') { parts.push(state.lossless ? 'lossless' : `q${state.quality}`); }
  return parts.join(', ');
}
function emitEditState(): void { vscode.postMessage({ type: 'editStateChanged', state: editState }); }

function syncCompressUI(): void {
  const f = editState.format === 'same' ? (srcMeta?.format ?? 'png') : editState.format;
  const lossy = f === 'jpeg' || f === 'webp' || f === 'avif';
  qualityRow.style.display  = lossy ? '' : 'none';
  losslessRow.style.display = (f === 'webp' || f === 'avif') ? '' : 'none';
  (qualitySlider as HTMLInputElement).disabled = editState.lossless;
  qualityNum.style.opacity = editState.lossless ? '0.4' : '1';
}
function syncTrashUI(): void {
  const willChangePath = editState.format !== 'same';
  if (willChangePath) {
    trashRow.classList.remove('disabled');
    trashCheck.disabled = false;
    trashRow.removeAttribute('title');
  } else {
    trashRow.classList.add('disabled');
    trashCheck.disabled = true;
    trashCheck.checked  = false;
    editState.trashOriginal = false;
    trashRow.title = 'No original to remove — same file is being overwritten';
  }
}
function populateBefore(meta: ImageInfo, fname: string): void {
  beforeFname.textContent = fname;
  beforeMeta.textContent  = `${meta.width} × ${meta.height} px · ${meta.format.toUpperCase()}`;
  beforeSize.textContent  = fmtBytes(meta.size);
}
function setAfterEstimating(): void {
  afterSize.innerHTML = '<span class="info-estimating">Estimating…</span>';
}
function populateAfter(size: number, width: number, height: number): void {
  if (!srcMeta) return;
  const name = afterFilename(srcPath, editState, srcMeta.format);
  const fmt  = fmtLabel(editState, srcMeta.format);
  const pct  = Math.round((1 - size / srcMeta.size) * 100);
  afterFname.textContent = name;
  afterMeta.textContent  = `${width} × ${height} px · ${fmt}`;
  afterSize.innerHTML    = `${fmtBytes(size)}${pct > 0 ? ` <span class="info-reduction">−${pct}%</span>` : ''}`;
}

// ── Compare ───────────────────────────────────────────────────────────────────
let lastPreviewUri = '';
let sliderPos = 50;

function applyCompareMode(mode: 'off' | 'slider' | 'sxs'): void {
  document.querySelectorAll('#compare-pill button').forEach((b) => {
    (b as HTMLButtonElement).classList.toggle('active', (b as HTMLButtonElement).dataset['mode'] === mode);
  });
  // Use visibility so image-container keeps its dimensions from mainImage layout
  mainImage.style.visibility     = 'visible';
  compareBeforeImg.style.display = 'none';
  compareAfterImg.style.display  = 'none';
  sliderHandle.style.display     = 'none';
  compareBeforeImg.style.clipPath = '';
  compareAfterImg.style.clipPath  = '';

  if (mode === 'off') { return; }

  compareBeforeImg.src = srcUri;
  compareAfterImg.src  = lastPreviewUri || srcUri;
  compareBeforeImg.style.display  = 'block';
  compareAfterImg.style.display   = 'block';
  mainImage.style.visibility      = 'hidden'; // hide but keep layout dimensions

  if (mode === 'slider') {
    sliderHandle.style.display = 'block';
    updateSliderClip();
  } else {
    compareBeforeImg.style.clipPath = `inset(0 50% 0 0)`;
    compareAfterImg.style.clipPath  = `inset(0 0 0 50%)`;
  }
}
function updateSliderClip(): void {
  sliderHandle.style.left = `${sliderPos}%`;
  compareBeforeImg.style.clipPath = `inset(0 ${100 - sliderPos}% 0 0)`;
  compareAfterImg.style.clipPath  = 'none';
}

document.querySelectorAll('#compare-pill button').forEach((b) => {
  b.addEventListener('click', () => {
    const mode = (b as HTMLButtonElement).dataset['mode'] as EditState['compareMode'];
    editState.compareMode = mode;
    applyCompareMode(mode);
    emitEditState(); // persist compareMode via extension globalState
  });
});

let sliderDragging = false;
sliderHandle.addEventListener('mousedown', (e) => { sliderDragging = true; e.preventDefault(); });
document.addEventListener('mousemove', (e) => {
  if (!sliderDragging) return;
  const rect = canvasArea.getBoundingClientRect();
  sliderPos = Math.max(0, Math.min(100, (e.clientX - rect.left) / rect.width * 100));
  updateSliderClip();
});
document.addEventListener('mouseup', () => { sliderDragging = false; });

// ── Zoom/pan ──────────────────────────────────────────────────────────────────
let zoom = 0; // 0 = fit
let panX = 0, panY = 0;
let spaceDown = false, panning = false;
let panStart = { x: 0, y: 0 };

function applyTransform(): void {
  if (zoom === 0) {
    imageContainer.style.transform = '';
    zoomPct.textContent = 'Fit';
    zoomPill.classList.remove('visible');
  } else {
    imageContainer.style.transform = `scale(${zoom}) translate(${panX / zoom}px, ${panY / zoom}px)`;
    zoomPct.textContent = `${Math.round(zoom * 100)}%`;
    zoomPill.classList.add('visible');
  }
}
function setZoom(z: number): void {
  zoom = z <= 0.11 ? 0 : Math.min(8, z);
  applyTransform();
}
function setFit(): void { zoom = 0; panX = 0; panY = 0; applyTransform(); }

zoomIn.addEventListener('click',  () => setZoom(zoom === 0 ? 1.1 : zoom * 1.1));
zoomOut.addEventListener('click', () => setZoom(zoom === 0 ? 0.9 : zoom * 0.9));
zoomFit.addEventListener('click', setFit);
mainImage.addEventListener('dblclick', setFit);
compareBeforeImg.addEventListener('dblclick', setFit);

canvasArea.addEventListener('wheel', (e) => {
  e.preventDefault();
  setZoom((zoom === 0 ? 1 : zoom) * (e.deltaY > 0 ? 0.9 : 1.1));
}, { passive: false });

document.addEventListener('keydown', (e) => { if (e.code === 'Space' && !cropOverlay.classList.contains('active')) { spaceDown = true; canvasArea.style.cursor = 'grab'; } });
document.addEventListener('keyup',   (e) => { if (e.code === 'Space') { spaceDown = false; panning = false; canvasArea.style.cursor = ''; } });
canvasArea.addEventListener('mousedown', (e) => {
  if (spaceDown && zoom !== 0) { panning = true; panStart = { x: e.clientX - panX, y: e.clientY - panY }; canvasArea.style.cursor = 'grabbing'; e.preventDefault(); }
});
document.addEventListener('mousemove', (e) => { if (!panning) return; panX = e.clientX - panStart.x; panY = e.clientY - panStart.y; applyTransform(); });
document.addEventListener('mouseup', () => { if (panning) { panning = false; canvasArea.style.cursor = spaceDown ? 'grab' : ''; } });

// ── Crop ──────────────────────────────────────────────────────────────────────
interface CropRect { x: number; y: number; w: number; h: number; }
let cropDraft: CropRect = { x: 0, y: 0, w: 0, h: 0 };
let cropDragging: { type: 'move' | 'handle'; dir?: string; startX: number; startY: number; startRect: CropRect } | null = null;

function scaleFactor(): number {
  if (!srcMeta) return 1;
  return mainImage.getBoundingClientRect().width / srcMeta.width;
}
function clampCrop(r: CropRect): CropRect {
  if (!srcMeta) return r;
  const min = 10;
  let { x, y, w, h } = r;
  x = Math.max(0, Math.min(x, srcMeta.width - min));
  y = Math.max(0, Math.min(y, srcMeta.height - min));
  w = Math.max(min, Math.min(w, srcMeta.width - x));
  h = Math.max(min, Math.min(h, srcMeta.height - y));
  return { x, y, w, h };
}
function renderCropSelection(): void {
  const scale = scaleFactor();
  const imgRect = mainImage.getBoundingClientRect();
  const areaRect = canvasArea.getBoundingClientRect();
  const offX = imgRect.left - areaRect.left;
  const offY = imgRect.top  - areaRect.top;
  cropSelection.style.left   = `${offX + cropDraft.x * scale}px`;
  cropSelection.style.top    = `${offY + cropDraft.y * scale}px`;
  cropSelection.style.width  = `${cropDraft.w * scale}px`;
  cropSelection.style.height = `${cropDraft.h * scale}px`;
}
function enterCropMode(): void {
  cropDraft = editState.crop
    ? { x: editState.crop.x, y: editState.crop.y, w: editState.crop.width, h: editState.crop.height }
    : { x: 0, y: 0, w: srcMeta?.width ?? 100, h: srcMeta?.height ?? 100 };
  cropOverlay.classList.add('active');
  cropActions.classList.add('visible');
  comparePill.style.display = 'none';
  renderCropSelection();
}
function exitCropMode(): void {
  cropOverlay.classList.remove('active');
  cropActions.classList.remove('visible');
  comparePill.style.display = '';
}

cropStart.addEventListener('click', enterCropMode);
cropApply.addEventListener('click', () => {
  editState.crop = { x: cropDraft.x, y: cropDraft.y, width: cropDraft.w, height: cropDraft.h };
  exitCropMode(); emitEditState();
});
cropCancel.addEventListener('click', exitCropMode);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && cropOverlay.classList.contains('active')) exitCropMode();
});

cropOverlay.addEventListener('mousedown', (e) => {
  const target = e.target as HTMLElement;
  const dir = target.dataset['dir'];
  const imgRect = mainImage.getBoundingClientRect();
  const areaRect = canvasArea.getBoundingClientRect();
  const scale = scaleFactor();
  const mx = (e.clientX - (imgRect.left - areaRect.left) - areaRect.left) / scale;
  const my = (e.clientY - (imgRect.top  - areaRect.top)  - areaRect.top)  / scale;
  if (dir) { cropDragging = { type: 'handle', dir, startX: mx, startY: my, startRect: { ...cropDraft } }; e.preventDefault(); }
  else if (target === cropSelection || target.classList.contains('crop-handle')) { /* handled above */ }
  else if (cropOverlay.classList.contains('active') && target === cropOverlay) { /* no-op */ }
});
cropSelection.addEventListener('mousedown', (e) => {
  if ((e.target as HTMLElement).dataset['dir']) return;
  const imgRect = mainImage.getBoundingClientRect();
  const areaRect = canvasArea.getBoundingClientRect();
  const scale = scaleFactor();
  const mx = (e.clientX - (imgRect.left - areaRect.left) - areaRect.left) / scale;
  const my = (e.clientY - (imgRect.top  - areaRect.top)  - areaRect.top)  / scale;
  cropDragging = { type: 'move', startX: mx, startY: my, startRect: { ...cropDraft } };
  e.preventDefault();
});
document.querySelectorAll('.crop-handle').forEach((h) => {
  h.addEventListener('mousedown', (e) => {
    const dir = (h as HTMLElement).dataset['dir']!;
    const imgRect = mainImage.getBoundingClientRect();
    const areaRect = canvasArea.getBoundingClientRect();
    const scale = scaleFactor();
    const mx = (e.clientX - (imgRect.left - areaRect.left) - areaRect.left) / scale;
    const my = (e.clientY - (imgRect.top  - areaRect.top)  - areaRect.top)  / scale;
    cropDragging = { type: 'handle', dir, startX: mx, startY: my, startRect: { ...cropDraft } };
    e.preventDefault(); (e as MouseEvent).stopPropagation();
  });
});
document.addEventListener('mousemove', (e) => {
  if (!cropDragging || !srcMeta) return;
  const imgRect = mainImage.getBoundingClientRect();
  const areaRect = canvasArea.getBoundingClientRect();
  const scale = scaleFactor();
  const mx = (e.clientX - (imgRect.left - areaRect.left) - areaRect.left) / scale;
  const my = (e.clientY - (imgRect.top  - areaRect.top)  - areaRect.top)  / scale;
  const dx = mx - cropDragging.startX, dy = my - cropDragging.startY;
  const sr = cropDragging.startRect;
  let { x, y, w, h } = sr;
  if (cropDragging.type === 'move') { x = sr.x + dx; y = sr.y + dy; }
  else {
    const d = cropDragging.dir!;
    if (d.includes('e')) w = sr.w + dx;
    if (d.includes('s')) h = sr.h + dy;
    if (d.includes('w')) { x = sr.x + dx; w = sr.w - dx; }
    if (d.includes('n')) { y = sr.y + dy; h = sr.h - dy; }
  }
  cropDraft = clampCrop({ x, y, w, h });
  renderCropSelection();
});
document.addEventListener('mouseup', () => { cropDragging = null; });

// ── Quality presets ───────────────────────────────────────────────────────────
const presetCustomLabel = document.getElementById('preset-custom-label') as HTMLElement;

function syncPresetButtons(q: number): void {
  document.querySelectorAll<HTMLButtonElement>('.preset-btn').forEach((btn) => {
    btn.classList.toggle('active', Number(btn.dataset['q']) === q);
  });
  presetCustomLabel.textContent = QUALITY_PRESETS.includes(q as any) ? '' : 'Custom';
}

document.querySelectorAll<HTMLButtonElement>('.preset-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const q = Number(btn.dataset['q']);
    editState.quality = q;
    qualitySlider.value = String(q);
    qualityNum.textContent = String(q);
    syncPresetButtons(q);
    setAfterEstimating(); emitEditState();
  });
});

// ── Compress ──────────────────────────────────────────────────────────────────
formatSelect.addEventListener('change', () => {
  editState.format = formatSelect.value as EditState['format'];
  syncCompressUI(); syncTrashUI(); setAfterEstimating(); emitEditState();
});
qualitySlider.addEventListener('input', () => {
  editState.quality = Number(qualitySlider.value);
  qualityNum.textContent = qualitySlider.value;
  syncPresetButtons(editState.quality);
  setAfterEstimating(); emitEditState();
});
losslessCheck.addEventListener('change', () => {
  editState.lossless = losslessCheck.checked;
  syncCompressUI(); setAfterEstimating(); emitEditState();
});

// ── Save footer ───────────────────────────────────────────────────────────────
trashCheck.addEventListener('change', () => { editState.trashOriginal = trashCheck.checked; });
btnSave.addEventListener('click',    () => { vscode.postMessage({ type: 'save', trashOriginal: editState.trashOriginal }); });
btnSaveAs.addEventListener('click',  () => { vscode.postMessage({ type: 'saveAs' }); });

// ── Resize ────────────────────────────────────────────────────────────────────
let srcAspect = 1;
function syncResizeDefaults(): void {
  if (!srcMeta) return;
  srcAspect = srcMeta.width / srcMeta.height;
  resizeW.value = String(srcMeta.width);
  resizeH.value = String(srcMeta.height);
}
function pxFromInput(val: string, dim: 'w' | 'h'): number {
  const n = Number(val);
  if (resizeUnit.value === '%') return Math.round((dim === 'w' ? (srcMeta?.width ?? 100) : (srcMeta?.height ?? 100)) * n / 100);
  return Math.round(n);
}
function resizeValidate(): boolean {
  const w = pxFromInput(resizeW.value, 'w'), h = pxFromInput(resizeH.value, 'h');
  if (w < 1 || h < 1 || !Number.isFinite(w) || !Number.isFinite(h)) {
    resizeError.textContent = 'Width and height must be positive integers.';
    resizeError.style.display = '';
    resizeW.classList.toggle('error', w < 1);
    resizeH.classList.toggle('error', h < 1);
    resizeApply.disabled = true;
    return false;
  }
  resizeError.style.display = 'none';
  resizeW.classList.remove('error'); resizeH.classList.remove('error');
  resizeApply.disabled = false;
  return true;
}
resizeW.addEventListener('input', () => {
  if (resizeLock.checked && srcAspect) resizeH.value = String(Math.round(pxFromInput(resizeW.value, 'w') / srcAspect));
  resizeValidate();
});
resizeH.addEventListener('input', () => {
  if (resizeLock.checked && srcAspect) resizeW.value = String(Math.round(pxFromInput(resizeH.value, 'h') * srcAspect));
  resizeValidate();
});
resizeW.addEventListener('keydown', (e) => { if (e.key === 'Escape') syncResizeDefaults(); });
resizeH.addEventListener('keydown', (e) => { if (e.key === 'Escape') syncResizeDefaults(); });
resizeUnit.addEventListener('change', () => {
  if (!srcMeta) return;
  resizeW.value = resizeUnit.value === '%' ? '100' : String(editState.resize?.width ?? srcMeta.width);
  resizeH.value = resizeUnit.value === '%' ? '100' : String(editState.resize?.height ?? srcMeta.height);
  resizeValidate();
});
resizeApply.addEventListener('click', () => {
  if (!resizeValidate()) return;
  editState.resize = { width: pxFromInput(resizeW.value, 'w'), height: pxFromInput(resizeH.value, 'h'), lockAspect: resizeLock.checked };
  emitEditState();
});

// ── Accordion ─────────────────────────────────────────────────────────────────
document.querySelectorAll('.section-head').forEach((h) => { h.addEventListener('click', () => h.classList.toggle('collapsed')); });

// ── VSCode message handler ────────────────────────────────────────────────────
window.addEventListener('message', (event) => {
  const msg = event.data as { type: string; [k: string]: unknown };
  switch (msg.type) {
    case 'init': {
      srcUri  = msg.imageUri as string;
      srcMeta = msg.meta as ImageInfo;
      srcPath = basename(decodeURIComponent(srcUri.split('?')[0]));
      const prevCompareMode = editState.compareMode; // preserve user's compare preference
      editState = msg.editState as EditState;
      editState.compareMode = prevCompareMode;
      errorBanner.classList.remove('visible');
      mainImage.src = srcUri;
      mainImage.onload = () => applyCompareMode(editState.compareMode);
      populateBefore(srcMeta, srcPath);
      afterFname.textContent = afterFilename(srcPath, editState, srcMeta.format);
      afterMeta.textContent  = fmtLabel(editState, srcMeta.format);
      afterSize.textContent  = fmtBytes(srcMeta.size);
      formatSelect.value     = editState.format;
      qualitySlider.value    = String(editState.quality);
      qualityNum.textContent = String(editState.quality);
      losslessCheck.checked  = editState.lossless;
      syncCompressUI(); syncTrashUI(); syncResizeDefaults();
      syncPresetButtons(editState.quality);
      break;
    }
    case 'previewReady': {
      const { previewDataUrl, size, width, height } = msg as { previewDataUrl: string; size: number; width: number; height: number };
      populateAfter(size, width, height);
      lastPreviewUri = previewDataUrl;
      if (editState.compareMode !== 'off') {
        compareAfterImg.src = previewDataUrl;
        if (editState.compareMode === 'sxs') { compareBeforeImg.style.clipPath = 'inset(0 50% 0 0)'; compareAfterImg.style.clipPath = 'inset(0 0 0 50%)'; }
      }
      break;
    }
    case 'previewError': {
      afterFname.textContent = '—'; afterMeta.textContent = ''; afterSize.textContent = '(estimate failed)';
      break;
    }
    case 'showError': {
      errorBanner.textContent = `Cannot read file: ${msg.message as string}`;
      errorBanner.classList.add('visible');
      document.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>(
        '#panel button, #panel input, #panel select'
      ).forEach((el) => { el.disabled = true; });
      break;
    }
    case 'saveComplete': {
      editState = { format: 'same', quality: 85, lossless: false, compareMode: editState.compareMode, trashOriginal: false };
      formatSelect.value = 'same'; qualitySlider.value = '85'; qualityNum.textContent = '85';
      losslessCheck.checked = false; trashCheck.checked = false;
      syncCompressUI(); syncTrashUI(); syncPresetButtons(85);
      break;
    }
    case 'fileChanged': {
      srcUri  = msg.imageUri as string;
      srcMeta = msg.meta as ImageInfo;
      srcPath = basename(decodeURIComponent(srcUri.split('?')[0]));
      mainImage.src = srcUri;
      populateBefore(srcMeta, srcPath);
      break;
    }
  }
});

void btnSave; // used in event listener above
