// media/webview.ts
var vscode = acquireVsCodeApi();
document.getElementById("root").innerHTML = /* html */
`
<div id="error-banner"></div>
<div id="main">
  <div id="canvas-area">
    <div id="compare-pill">
      <button data-mode="off" class="active">Original</button>
      <button data-mode="slider">Slider</button>
      <button data-mode="preview">Preview</button>
    </div>
    <button id="edit-toggle">\u270F Edit</button>
    <div id="toast"></div>
    <div id="image-container">
      <img id="main-image" alt="Image preview" draggable="false">
      <img id="compare-before" alt="original" draggable="false">
      <img id="compare-after"  alt="after"    draggable="false">
    </div>
    <div id="slider-handle"><div id="slider-knob">\u21C6</div></div>
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
      <button id="zoom-out">\u2212</button>
      <span id="zoom-pct">Fit</span>
      <button id="zoom-in">+</button>
      <button id="zoom-fit">Fit</button>
    </div>
  </div>

  <div id="panel">
    <div id="panel-sections">

      <div class="panel-section" id="section-crop">
        <div class="section-head" data-section="crop">
          <span class="section-caret">\u25BE</span> Crop
        </div>
        <div class="section-body">
          <button class="btn full" id="crop-start">Start crop</button>
        </div>
      </div>

      <div class="panel-section" id="section-resize">
        <div class="section-head" data-section="resize">
          <span class="section-caret">\u25BE</span> Resize
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
          <span class="section-caret">\u25BE</span> Compress
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
        <button class="btn"         id="btn-save-as" style="flex:1">Save As\u2026</button>
      </div>
      <label id="trash-row" class="check-row disabled" title="Nothing to replace \u2014 same file is being overwritten">
        <input type="checkbox" id="trash-check" disabled>
        Replace old image
      </label>
    </div>
  </div>
</div>

<div id="info-panel">
  <div class="info-col" id="info-before">
    <span class="info-title">Before</span>
    <span class="info-fname" id="before-fname">\u2014</span>
    <span class="info-meta"  id="before-meta">\u2014</span>
    <span class="info-size"  id="before-size">\u2014</span>
  </div>
  <div class="info-arrow">\u2192</div>
  <div class="info-col" id="info-after">
    <span class="info-title">After (estimate)</span>
    <span class="info-fname" id="after-fname">\u2014</span>
    <span class="info-meta"  id="after-meta">\u2014</span>
    <span class="info-size"  id="after-size">\u2014</span>
  </div>
</div>
`;
var QUALITY_PRESETS = [92, 85, 75];
var editState = {
  format: "same",
  quality: 85,
  lossless: false,
  compareMode: "off",
  trashOriginal: false
};
var editMode = false;
var srcMeta = null;
var srcPath = "";
var srcUri = "";
var mainImage = document.getElementById("main-image");
var compareBeforeImg = document.getElementById("compare-before");
var compareAfterImg = document.getElementById("compare-after");
var sliderHandle = document.getElementById("slider-handle");
var imageContainer = document.getElementById("image-container");
var errorBanner = document.getElementById("error-banner");
var comparePill = document.getElementById("compare-pill");
var cropOverlay = document.getElementById("crop-overlay");
var cropSelection = document.getElementById("crop-selection");
var cropActions = document.getElementById("crop-actions");
var cropApply = document.getElementById("crop-apply");
var cropCancel = document.getElementById("crop-cancel");
var cropStart = document.getElementById("crop-start");
var zoomPill = document.getElementById("zoom-pill");
var zoomPct = document.getElementById("zoom-pct");
var zoomIn = document.getElementById("zoom-in");
var zoomOut = document.getElementById("zoom-out");
var zoomFit = document.getElementById("zoom-fit");
var canvasArea = document.getElementById("canvas-area");
var editToggleBtn = document.getElementById("edit-toggle");
var panel = document.getElementById("panel");
var beforeFname = document.getElementById("before-fname");
var beforeMeta = document.getElementById("before-meta");
var beforeSize = document.getElementById("before-size");
var afterFname = document.getElementById("after-fname");
var afterMeta = document.getElementById("after-meta");
var afterSize = document.getElementById("after-size");
var formatSelect = document.getElementById("format-select");
var qualitySlider = document.getElementById("quality-slider");
var qualityNum = document.getElementById("quality-num");
var qualityRow = document.getElementById("quality-row");
var losslessRow = document.getElementById("lossless-row");
var losslessCheck = document.getElementById("lossless-check");
var trashRow = document.getElementById("trash-row");
var trashCheck = document.getElementById("trash-check");
var btnSave = document.getElementById("btn-save");
var btnSaveAs = document.getElementById("btn-save-as");
var resizeW = document.getElementById("resize-w");
var resizeH = document.getElementById("resize-h");
var resizeUnit = document.getElementById("resize-unit");
var resizeLock = document.getElementById("resize-lock");
var resizeApply = document.getElementById("resize-apply");
var resizeError = document.getElementById("resize-error");
function basename(p) {
  return p.split("/").pop() ?? p;
}
function fmtBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(2)} MB`;
}
function fmtExt(state, srcFormat) {
  const f = state.format === "same" ? srcFormat : state.format;
  return { jpeg: ".jpg", png: ".png", webp: ".webp", avif: ".avif" }[f] ?? `.${f}`;
}
function afterFilename(srcName, state, srcFmt) {
  const dot = srcName.lastIndexOf(".");
  return (dot > -1 ? srcName.slice(0, dot) : srcName) + fmtExt(state, srcFmt);
}
function fmtLabel(state, srcFmt) {
  const f = state.format === "same" ? srcFmt : state.format;
  const parts = [f.toUpperCase()];
  if (f !== "png") {
    parts.push(state.lossless ? "lossless" : `q${state.quality}`);
  }
  return parts.join(", ");
}
function emitEditState() {
  vscode.postMessage({ type: "editStateChanged", state: editState });
}
function syncCompressUI() {
  const f = editState.format === "same" ? srcMeta?.format ?? "png" : editState.format;
  const lossy = f === "jpeg" || f === "webp" || f === "avif";
  qualityRow.style.display = lossy ? "" : "none";
  losslessRow.style.display = f === "webp" || f === "avif" ? "" : "none";
  qualitySlider.disabled = editState.lossless;
  qualityNum.style.opacity = editState.lossless ? "0.4" : "1";
}
function syncTrashUI() {
  const willChangePath = editState.format !== "same";
  if (willChangePath) {
    trashRow.classList.remove("disabled");
    trashCheck.disabled = false;
    trashRow.removeAttribute("title");
  } else {
    trashRow.classList.add("disabled");
    trashCheck.disabled = true;
    trashCheck.checked = false;
    editState.trashOriginal = false;
    trashRow.title = "Nothing to replace \u2014 same file is being overwritten";
  }
}
function populateBefore(meta, fname) {
  beforeFname.textContent = fname;
  beforeMeta.textContent = `${meta.width} \xD7 ${meta.height} px \xB7 ${meta.format.toUpperCase()}`;
  beforeSize.textContent = fmtBytes(meta.size);
}
function setAfterEstimating() {
  afterSize.innerHTML = '<span class="info-estimating">Estimating\u2026</span>';
}
function populateAfter(size, width, height) {
  if (!srcMeta) return;
  const name = afterFilename(srcPath, editState, srcMeta.format);
  const fmt = fmtLabel(editState, srcMeta.format);
  const pct = Math.round((1 - size / srcMeta.size) * 100);
  afterFname.textContent = name;
  afterMeta.textContent = `${width} \xD7 ${height} px \xB7 ${fmt}`;
  afterSize.innerHTML = `${fmtBytes(size)}${pct > 0 ? ` <span class="info-reduction">\u2212${pct}%</span>` : ""}`;
}
var lastPreviewUri = "";
var sliderPos = 50;
function applyCompareMode(mode) {
  document.querySelectorAll("#compare-pill button").forEach((b) => {
    b.classList.toggle("active", b.dataset["mode"] === mode);
  });
  mainImage.style.visibility = "visible";
  compareBeforeImg.style.display = "none";
  compareAfterImg.style.display = "none";
  sliderHandle.style.display = "none";
  compareBeforeImg.style.clipPath = "";
  compareAfterImg.style.clipPath = "";
  if (mode === "off") {
    mainImage.src = srcUri;
    return;
  }
  if (mode === "preview") {
    mainImage.src = lastPreviewUri || srcUri;
    return;
  }
  compareBeforeImg.src = srcUri;
  compareAfterImg.src = lastPreviewUri || srcUri;
  compareBeforeImg.style.display = "block";
  compareAfterImg.style.display = "block";
  mainImage.style.visibility = "hidden";
  sliderHandle.style.display = "block";
  updateSliderClip();
}
function setEditMode(active) {
  editMode = active;
  panel.classList.toggle("hidden", !active);
  comparePill.style.display = active ? "" : "none";
  editToggleBtn.classList.toggle("active", active);
  editToggleBtn.textContent = active ? "\u2715 Close" : "\u270F Edit";
  const afterCol = document.getElementById("info-after");
  const arrow = document.querySelector("#info-panel .info-arrow");
  if (afterCol) afterCol.style.display = active ? "" : "none";
  if (arrow) arrow.style.display = active ? "" : "none";
}
editToggleBtn.addEventListener("click", () => setEditMode(!editMode));
function updateSliderClip() {
  sliderHandle.style.left = `${sliderPos}%`;
  const areaRect = canvasArea.getBoundingClientRect();
  const imgRect = mainImage.getBoundingClientRect();
  const viewportX = sliderPos / 100 * areaRect.width;
  const imgLeftInArea = imgRect.left - areaRect.left;
  const imgPct = imgRect.width > 0 ? Math.max(0, Math.min(100, (viewportX - imgLeftInArea) / imgRect.width * 100)) : 50;
  compareBeforeImg.style.clipPath = `inset(0 ${100 - imgPct}% 0 0)`;
  compareAfterImg.style.clipPath = "none";
}
document.querySelectorAll("#compare-pill button").forEach((b) => {
  b.addEventListener("click", () => {
    const mode = b.dataset["mode"];
    editState.compareMode = mode;
    applyCompareMode(mode);
    emitEditState();
  });
});
var sliderDragging = false;
sliderHandle.addEventListener("mousedown", (e) => {
  sliderDragging = true;
  e.preventDefault();
});
document.addEventListener("mousemove", (e) => {
  if (!sliderDragging) return;
  const rect = canvasArea.getBoundingClientRect();
  sliderPos = Math.max(0, Math.min(100, (e.clientX - rect.left) / rect.width * 100));
  updateSliderClip();
});
document.addEventListener("mouseup", () => {
  sliderDragging = false;
});
var zoom = 0;
var panX = 0;
var panY = 0;
var panning = false;
var panStart = { x: 0, y: 0 };
function applyTransform() {
  if (zoom === 0) {
    imageContainer.style.transform = "";
    zoomPct.textContent = "Fit";
    zoomPill.classList.remove("visible");
  } else {
    imageContainer.style.transform = `scale(${zoom}) translate(${panX / zoom}px, ${panY / zoom}px)`;
    zoomPct.textContent = `${Math.round(zoom * 100)}%`;
    zoomPill.classList.add("visible");
  }
  if (editState.compareMode === "slider") updateSliderClip();
}
function setZoom(z) {
  zoom = z <= 0.11 ? 0 : Math.min(8, z);
  applyTransform();
  updateCursor();
}
function setFit() {
  zoom = 0;
  panX = 0;
  panY = 0;
  applyTransform();
  updateCursor();
}
zoomIn.addEventListener("click", () => setZoom(zoom === 0 ? 1.1 : zoom * 1.1));
zoomOut.addEventListener("click", () => setZoom(zoom === 0 ? 0.9 : zoom * 0.9));
zoomFit.addEventListener("click", setFit);
mainImage.addEventListener("dblclick", setFit);
compareBeforeImg.addEventListener("dblclick", setFit);
canvasArea.addEventListener("wheel", (e) => {
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) {
    const factor = e.deltaY > 0 ? 0.97 : 1.03;
    setZoom((zoom === 0 ? 1 : zoom) * factor);
  } else if (zoom !== 0) {
    panX -= e.deltaX;
    panY -= e.deltaY;
    applyTransform();
  } else {
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    setZoom(factor);
  }
}, { passive: false });
canvasArea.addEventListener("mousedown", (e) => {
  if (zoom !== 0 && !cropOverlay.classList.contains("active") && !sliderDragging) {
    panning = true;
    panStart = { x: e.clientX - panX, y: e.clientY - panY };
    canvasArea.style.cursor = "grabbing";
    e.preventDefault();
  }
});
document.addEventListener("mousemove", (e) => {
  if (!panning) return;
  panX = e.clientX - panStart.x;
  panY = e.clientY - panStart.y;
  applyTransform();
});
document.addEventListener("mouseup", () => {
  if (panning) {
    panning = false;
    canvasArea.style.cursor = zoom !== 0 ? "grab" : "";
  }
});
function updateCursor() {
  canvasArea.style.cursor = zoom !== 0 && !cropOverlay.classList.contains("active") ? "grab" : "";
}
var cropDraft = { x: 0, y: 0, w: 0, h: 0 };
var cropDragging = null;
function scaleFactor() {
  if (!srcMeta) return 1;
  return mainImage.getBoundingClientRect().width / srcMeta.width;
}
function clampCrop(r) {
  if (!srcMeta) return r;
  const min = 10;
  let { x, y, w, h } = r;
  x = Math.max(0, Math.min(x, srcMeta.width - min));
  y = Math.max(0, Math.min(y, srcMeta.height - min));
  w = Math.max(min, Math.min(w, srcMeta.width - x));
  h = Math.max(min, Math.min(h, srcMeta.height - y));
  return { x, y, w, h };
}
function renderCropSelection() {
  const scale = scaleFactor();
  const imgRect = mainImage.getBoundingClientRect();
  const areaRect = canvasArea.getBoundingClientRect();
  const offX = imgRect.left - areaRect.left;
  const offY = imgRect.top - areaRect.top;
  cropSelection.style.left = `${offX + cropDraft.x * scale}px`;
  cropSelection.style.top = `${offY + cropDraft.y * scale}px`;
  cropSelection.style.width = `${cropDraft.w * scale}px`;
  cropSelection.style.height = `${cropDraft.h * scale}px`;
}
function enterCropMode() {
  if (zoom !== 0) setFit();
  cropDraft = editState.crop ? { x: editState.crop.x, y: editState.crop.y, w: editState.crop.width, h: editState.crop.height } : { x: 0, y: 0, w: srcMeta?.width ?? 100, h: srcMeta?.height ?? 100 };
  cropOverlay.classList.add("active");
  cropActions.classList.add("visible");
  comparePill.style.display = "none";
  renderCropSelection();
}
function exitCropMode() {
  cropOverlay.classList.remove("active");
  cropActions.classList.remove("visible");
  comparePill.style.display = "";
}
cropStart.addEventListener("click", enterCropMode);
var toastEl = document.getElementById("toast");
var toastTimer = null;
function showToast(msg) {
  if (toastTimer) clearTimeout(toastTimer);
  toastEl.textContent = msg;
  toastEl.classList.add("visible");
  toastTimer = setTimeout(() => toastEl.classList.remove("visible"), 2e3);
}
function applyCropAction() {
  if (!cropOverlay.classList.contains("active")) return;
  const w = Math.round(cropDraft.w), h = Math.round(cropDraft.h);
  editState.crop = {
    x: Math.round(cropDraft.x),
    y: Math.round(cropDraft.y),
    width: w,
    height: h
  };
  exitCropMode();
  emitEditState();
  showToast(`\u2713 Cropped to ${w} \xD7 ${h} px`);
}
cropApply.addEventListener("click", applyCropAction);
cropCancel.addEventListener("click", exitCropMode);
document.addEventListener("keydown", (e) => {
  if (!cropOverlay.classList.contains("active")) return;
  if (e.key === "Escape") exitCropMode();
  if (e.key === "Enter") applyCropAction();
});
cropOverlay.addEventListener("mousedown", (e) => {
  const target = e.target;
  const dir = target.dataset["dir"];
  const imgRect = mainImage.getBoundingClientRect();
  const areaRect = canvasArea.getBoundingClientRect();
  const scale = scaleFactor();
  const mx = (e.clientX - (imgRect.left - areaRect.left) - areaRect.left) / scale;
  const my = (e.clientY - (imgRect.top - areaRect.top) - areaRect.top) / scale;
  if (dir) {
    cropDragging = { type: "handle", dir, startX: mx, startY: my, startRect: { ...cropDraft } };
    e.preventDefault();
  } else if (target === cropSelection || target.classList.contains("crop-handle")) {
  } else if (cropOverlay.classList.contains("active") && target === cropOverlay) {
  }
});
cropSelection.addEventListener("mousedown", (e) => {
  if (e.target.dataset["dir"]) return;
  const imgRect = mainImage.getBoundingClientRect();
  const areaRect = canvasArea.getBoundingClientRect();
  const scale = scaleFactor();
  const mx = (e.clientX - (imgRect.left - areaRect.left) - areaRect.left) / scale;
  const my = (e.clientY - (imgRect.top - areaRect.top) - areaRect.top) / scale;
  cropDragging = { type: "move", startX: mx, startY: my, startRect: { ...cropDraft } };
  e.preventDefault();
});
document.querySelectorAll(".crop-handle").forEach((h) => {
  h.addEventListener("mousedown", (e) => {
    const dir = h.dataset["dir"];
    const imgRect = mainImage.getBoundingClientRect();
    const areaRect = canvasArea.getBoundingClientRect();
    const scale = scaleFactor();
    const mx = (e.clientX - (imgRect.left - areaRect.left) - areaRect.left) / scale;
    const my = (e.clientY - (imgRect.top - areaRect.top) - areaRect.top) / scale;
    cropDragging = { type: "handle", dir, startX: mx, startY: my, startRect: { ...cropDraft } };
    e.preventDefault();
    e.stopPropagation();
  });
});
document.addEventListener("mousemove", (e) => {
  if (!cropDragging || !srcMeta) return;
  const imgRect = mainImage.getBoundingClientRect();
  const areaRect = canvasArea.getBoundingClientRect();
  const scale = scaleFactor();
  const mx = (e.clientX - (imgRect.left - areaRect.left) - areaRect.left) / scale;
  const my = (e.clientY - (imgRect.top - areaRect.top) - areaRect.top) / scale;
  const dx = mx - cropDragging.startX, dy = my - cropDragging.startY;
  const sr = cropDragging.startRect;
  let { x, y, w, h } = sr;
  if (cropDragging.type === "move") {
    x = sr.x + dx;
    y = sr.y + dy;
  } else {
    const d = cropDragging.dir;
    if (d.includes("e")) w = sr.w + dx;
    if (d.includes("s")) h = sr.h + dy;
    if (d.includes("w")) {
      x = sr.x + dx;
      w = sr.w - dx;
    }
    if (d.includes("n")) {
      y = sr.y + dy;
      h = sr.h - dy;
    }
  }
  cropDraft = clampCrop({ x, y, w, h });
  renderCropSelection();
});
document.addEventListener("mouseup", () => {
  cropDragging = null;
});
var presetCustomLabel = document.getElementById("preset-custom-label");
function syncPresetButtons(q) {
  document.querySelectorAll(".preset-btn").forEach((btn) => {
    btn.classList.toggle("active", Number(btn.dataset["q"]) === q);
  });
  presetCustomLabel.textContent = QUALITY_PRESETS.includes(q) ? "" : "Custom";
}
document.querySelectorAll(".preset-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const q = Number(btn.dataset["q"]);
    editState.quality = q;
    qualitySlider.value = String(q);
    qualityNum.textContent = String(q);
    syncPresetButtons(q);
    setAfterEstimating();
    emitEditState();
  });
});
formatSelect.addEventListener("change", () => {
  editState.format = formatSelect.value;
  syncCompressUI();
  syncTrashUI();
  setAfterEstimating();
  emitEditState();
});
qualitySlider.addEventListener("input", () => {
  editState.quality = Number(qualitySlider.value);
  qualityNum.textContent = qualitySlider.value;
  syncPresetButtons(editState.quality);
  setAfterEstimating();
  emitEditState();
});
losslessCheck.addEventListener("change", () => {
  editState.lossless = losslessCheck.checked;
  syncCompressUI();
  setAfterEstimating();
  emitEditState();
});
trashCheck.addEventListener("change", () => {
  editState.trashOriginal = trashCheck.checked;
});
btnSave.addEventListener("click", () => {
  vscode.postMessage({ type: "save", trashOriginal: editState.trashOriginal });
});
btnSaveAs.addEventListener("click", () => {
  vscode.postMessage({ type: "saveAs" });
});
var srcAspect = 1;
function syncResizeDefaults() {
  if (!srcMeta) return;
  srcAspect = srcMeta.width / srcMeta.height;
  resizeW.value = String(srcMeta.width);
  resizeH.value = String(srcMeta.height);
}
function pxFromInput(val, dim) {
  const n = Number(val);
  if (resizeUnit.value === "%") return Math.round((dim === "w" ? srcMeta?.width ?? 100 : srcMeta?.height ?? 100) * n / 100);
  return Math.round(n);
}
function resizeValidate() {
  const w = pxFromInput(resizeW.value, "w"), h = pxFromInput(resizeH.value, "h");
  if (w < 1 || h < 1 || !Number.isFinite(w) || !Number.isFinite(h)) {
    resizeError.textContent = "Width and height must be positive integers.";
    resizeError.style.display = "";
    resizeW.classList.toggle("error", w < 1);
    resizeH.classList.toggle("error", h < 1);
    resizeApply.disabled = true;
    return false;
  }
  resizeError.style.display = "none";
  resizeW.classList.remove("error");
  resizeH.classList.remove("error");
  resizeApply.disabled = false;
  return true;
}
resizeW.addEventListener("input", () => {
  if (resizeLock.checked && srcAspect) resizeH.value = String(Math.round(pxFromInput(resizeW.value, "w") / srcAspect));
  resizeValidate();
});
resizeH.addEventListener("input", () => {
  if (resizeLock.checked && srcAspect) resizeW.value = String(Math.round(pxFromInput(resizeH.value, "h") * srcAspect));
  resizeValidate();
});
resizeW.addEventListener("keydown", (e) => {
  if (e.key === "Escape") syncResizeDefaults();
});
resizeH.addEventListener("keydown", (e) => {
  if (e.key === "Escape") syncResizeDefaults();
});
resizeUnit.addEventListener("change", () => {
  if (!srcMeta) return;
  resizeW.value = resizeUnit.value === "%" ? "100" : String(editState.resize?.width ?? srcMeta.width);
  resizeH.value = resizeUnit.value === "%" ? "100" : String(editState.resize?.height ?? srcMeta.height);
  resizeValidate();
});
resizeApply.addEventListener("click", () => {
  if (!resizeValidate()) return;
  const w = pxFromInput(resizeW.value, "w");
  const h = pxFromInput(resizeH.value, "h");
  editState.resize = { width: w, height: h, lockAspect: resizeLock.checked };
  emitEditState();
  showToast(`\u2713 Resized to ${w} \xD7 ${h} px`);
});
document.querySelectorAll(".section-head").forEach((h) => {
  h.addEventListener("click", () => h.classList.toggle("collapsed"));
});
window.addEventListener("message", (event) => {
  const msg = event.data;
  switch (msg.type) {
    case "init": {
      srcUri = msg.imageUri;
      srcMeta = msg.meta;
      srcPath = basename(decodeURIComponent(srcUri.split("?")[0]));
      const prevCompareMode = editState.compareMode;
      editState = msg.editState;
      editState.compareMode = prevCompareMode;
      errorBanner.classList.remove("visible");
      lastPreviewUri = "";
      mainImage.onload = () => {
        applyCompareMode(editState.compareMode);
      };
      mainImage.src = srcUri;
      setEditMode(editMode);
      populateBefore(srcMeta, srcPath);
      afterFname.textContent = afterFilename(srcPath, editState, srcMeta.format);
      afterMeta.textContent = fmtLabel(editState, srcMeta.format);
      afterSize.textContent = fmtBytes(srcMeta.size);
      formatSelect.value = editState.format;
      qualitySlider.value = String(editState.quality);
      qualityNum.textContent = String(editState.quality);
      losslessCheck.checked = editState.lossless;
      syncCompressUI();
      syncTrashUI();
      syncResizeDefaults();
      syncPresetButtons(editState.quality);
      break;
    }
    case "previewReady": {
      const { previewDataUrl, size, width, height } = msg;
      populateAfter(size, width, height);
      lastPreviewUri = previewDataUrl;
      if (editState.compareMode === "slider") {
        compareAfterImg.src = previewDataUrl;
      } else if (editState.compareMode === "preview") {
        mainImage.src = previewDataUrl;
      }
      break;
    }
    case "previewError": {
      afterFname.textContent = "\u2014";
      afterMeta.textContent = "";
      afterSize.textContent = "(estimate failed)";
      break;
    }
    case "showError": {
      errorBanner.textContent = `Cannot read file: ${msg.message}`;
      errorBanner.classList.add("visible");
      document.querySelectorAll(
        "#panel button, #panel input, #panel select"
      ).forEach((el) => {
        el.disabled = true;
      });
      break;
    }
    case "saveComplete": {
      showToast(`\u2713 Saved${msg.trashed ? " (old file replaced)" : ""}`);
      editState = { format: "same", quality: 85, lossless: false, compareMode: editState.compareMode, trashOriginal: false };
      formatSelect.value = "same";
      qualitySlider.value = "85";
      qualityNum.textContent = "85";
      losslessCheck.checked = false;
      trashCheck.checked = false;
      syncCompressUI();
      syncTrashUI();
      syncPresetButtons(85);
      break;
    }
    case "fileChanged": {
      srcUri = msg.imageUri;
      srcMeta = msg.meta;
      srcPath = basename(decodeURIComponent(srcUri.split("?")[0]));
      mainImage.src = srcUri;
      populateBefore(srcMeta, srcPath);
      break;
    }
  }
});
//# sourceMappingURL=webview.js.map
