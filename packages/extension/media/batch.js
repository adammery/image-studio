// media/batch.ts
var vscode = acquireVsCodeApi();
document.getElementById("root").innerHTML = /* html */
`
<div id="batch-main">
  <div id="batch-list-area">
    <div id="batch-toolbar">
      <div class="bt-row">
        <label class="bt-label">Folder</label>
        <select id="folder-select"></select>
      </div>
      <div class="bt-row">
        <label class="bt-label">Format</label>
        <div id="format-chips" class="chips">
          <button class="chip active" data-fmt="all">All</button>
          <button class="chip" data-fmt="png">PNG</button>
          <button class="chip" data-fmt="jpg">JPG</button>
          <button class="chip" data-fmt="webp">WebP</button>
          <button class="chip" data-fmt="avif">AVIF</button>
        </div>
        <button class="bbtn small" id="btn-delete" title="Delete selected (\u2318\u232B)" disabled>Delete</button>
      </div>
    </div>
    <div id="batch-list-header">
      <div class="bl-cb"><input type="checkbox" id="header-cb" aria-label="Select all visible"></div>
      <div class="bl-stat"></div>
      <div class="bl-name sortable" data-sort="name">Name</div>
      <div class="bl-fmt sortable" data-sort="format">Format</div>
      <div class="bl-size sortable" data-sort="size">Size</div>
      <div class="bl-est sortable" data-sort="est">\u2192 Est.</div>
    </div>
    <div id="batch-list" role="list"></div>
    <div id="batch-empty" class="empty hidden">No images in this workspace.</div>
  </div>

  <div id="batch-panel">
    <div id="panel-sections">
      <div class="panel-section" id="section-compress">
        <div class="section-head"><span class="section-icon">\u25C6</span> Compress<span class="section-caret">\u25BE</span></div>
        <div class="section-body">
          <div class="row">
            <label>Format</label>
            <select class="inp flex1" id="format-select">
              <option value="same">Same as source</option>
              <option value="png">PNG</option>
              <option value="jpeg">JPEG</option>
              <option value="webp" selected>WebP</option>
              <option value="avif">AVIF</option>
            </select>
          </div>
          <div id="quality-presets" class="quality-presets">
            <button class="preset-btn" data-q="92">High</button>
            <button class="preset-btn" data-q="85">Med</button>
            <button class="preset-btn" data-q="75">Low</button>
          </div>
          <div class="row" id="quality-row">
            <label>Quality</label>
            <input type="range" id="quality-slider" min="1" max="100" value="85">
            <span class="qnum" id="quality-num">85</span>
          </div>
          <label class="check-row" id="lossless-row">
            <input type="checkbox" id="lossless-check"> Lossless
          </label>
        </div>
      </div>
    </div>

    <div id="batch-footer">
      <div id="batch-footer-info">
        <span id="batch-counter">0 selected</span>
        <button class="bbtn small" id="btn-review">Review</button>
        <label class="check-row inline"><input type="checkbox" id="trash-check"> Trash originals</label>
      </div>
      <div id="batch-footer-progress" class="hidden">
        <div class="progress-bar"><div class="progress-fill" id="progress-fill"></div></div>
        <span id="progress-text">0/0</span>
        <button class="bbtn small" id="btn-cancel">Cancel</button>
      </div>
      <div id="batch-footer-actions">
        <button class="bbtn primary" id="btn-convert" disabled>Convert 0</button>
      </div>
    </div>
  </div>
</div>
`;
var allImages = [];
var folders = [];
var currentFolder = "__all__";
var activeChip = "all";
var sortBy = "name";
var sortDir = "asc";
var estimates = /* @__PURE__ */ new Map();
var selected = /* @__PURE__ */ new Set();
var reviewMode = false;
var converting = false;
var rowStatus = /* @__PURE__ */ new Map();
var formatSelect = () => document.getElementById("format-select");
var qualitySlider = () => document.getElementById("quality-slider");
var qualityNum = () => document.getElementById("quality-num");
var losslessCheck = () => document.getElementById("lossless-check");
var losslessRow = () => document.getElementById("lossless-row");
var trashCheck = () => document.getElementById("trash-check");
function currentSettings() {
  return {
    format: formatSelect().value,
    quality: parseInt(qualitySlider().value, 10),
    lossless: losslessCheck().checked
  };
}
function visibleImages() {
  let rows = allImages;
  if (reviewMode) rows = rows.filter((r) => selected.has(r.fsPath));
  else if (currentFolder !== "__all__") rows = rows.filter((r) => r.folderRel === currentFolder);
  if (activeChip !== "all") rows = rows.filter((r) => normExt(r.ext) === activeChip);
  rows = rows.slice().sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case "name":
        cmp = a.basename.localeCompare(b.basename);
        break;
      case "format":
        cmp = a.ext.localeCompare(b.ext);
        break;
      case "size":
        cmp = a.size - b.size;
        break;
      case "est": {
        const ea = estimates.get(a.fsPath);
        const eb = estimates.get(b.fsPath);
        const sa = ea?.ok ? ea.size : Number.POSITIVE_INFINITY;
        const sb = eb?.ok ? eb.size : Number.POSITIVE_INFINITY;
        cmp = sa - sb;
        break;
      }
    }
    return sortDir === "asc" ? cmp : -cmp;
  });
  return rows;
}
function normExt(ext) {
  const e = ext.toLowerCase();
  if (e === "jpeg") return "jpg";
  if (e === "png" || e === "jpg" || e === "webp" || e === "avif") return e;
  return "all";
}
function fmtBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(2)} MB`;
}
function statusIcon(s) {
  switch (s) {
    case "pending":
      return "\u23F3";
    case "in-progress":
      return "\u{1F504}";
    case "done":
      return "\u2713";
    case "failed":
      return "\u2717";
    default:
      return "";
  }
}
function headerCheckboxState() {
  const visible = visibleImages();
  if (visible.length === 0) return "none";
  let count = 0;
  for (const r of visible) if (selected.has(r.fsPath)) count++;
  if (count === 0) return "none";
  if (count === visible.length) return "all";
  return "some";
}
function syncHeaderCheckbox() {
  const cb = document.getElementById("header-cb");
  if (!cb) return;
  const state = headerCheckboxState();
  cb.checked = state === "all";
  cb.indeterminate = state === "some";
}
function renderList() {
  const list = document.getElementById("batch-list");
  const empty = document.getElementById("batch-empty");
  const scrollTop = list.scrollTop;
  const rows = visibleImages();
  if (rows.length === 0) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    list.scrollTop = scrollTop;
    syncHeaderCheckbox();
    return;
  }
  empty.classList.add("hidden");
  const showFolderPrefix = currentFolder === "__all__" || reviewMode;
  list.innerHTML = rows.map((r) => {
    const checked = selected.has(r.fsPath) ? "checked" : "";
    const est = estimates.get(r.fsPath);
    let estText = "\u2014";
    if (est) estText = est.ok ? fmtBytes(est.size) : "error";
    else if (selected.has(r.fsPath)) estText = "(working\u2026)";
    const stat = rowStatus.get(r.fsPath);
    const failed = stat?.status === "failed";
    const name = showFolderPrefix && r.folderRel !== "." ? `${r.folderRel}/${r.basename}` : r.basename;
    const title = stat?.error ? ` title="${escapeAttr(stat.error)}"` : "";
    return `<div class="batch-row${failed ? " failed" : ""}" data-fs="${escapeAttr(r.fsPath)}"${title}>
      <div class="bl-cb"><input type="checkbox" ${checked}></div>
      <div class="bl-stat">${statusIcon(stat?.status)}</div>
      <div class="bl-name">${escapeHtml(name)}</div>
      <div class="bl-fmt">${r.ext.toUpperCase()}</div>
      <div class="bl-size">${fmtBytes(r.size)}</div>
      <div class="bl-est">${estText}</div>
    </div>`;
  }).join("");
  list.scrollTop = scrollTop;
  syncHeaderCheckbox();
}
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function escapeAttr(s) {
  return escapeHtml(s);
}
function distinctFolderCount() {
  const set = /* @__PURE__ */ new Set();
  for (const fs of selected) {
    const row = allImages.find((r) => r.fsPath === fs);
    if (row) set.add(row.folderRel);
  }
  return set.size;
}
function renderCounter() {
  const c = document.getElementById("batch-counter");
  const n = selected.size;
  const f = distinctFolderCount();
  c.textContent = n === 0 ? "0 selected" : f <= 1 ? `${n} selected` : `${n} selected (across ${f} folders)`;
  const btn = document.getElementById("btn-convert");
  btn.textContent = `Convert ${n}`;
  btn.disabled = n === 0 || converting;
  const delBtn = document.getElementById("btn-delete");
  delBtn.disabled = n === 0 || converting;
}
function renderSortHeader() {
  document.querySelectorAll("#batch-list-header .sortable").forEach((el) => {
    el.classList.remove("sort-asc", "sort-desc");
    if (el.dataset.sort === sortBy) {
      el.classList.add(sortDir === "asc" ? "sort-asc" : "sort-desc");
    }
  });
}
function syncLossless() {
  const f = formatSelect().value;
  losslessRow().style.display = f === "webp" || f === "avif" ? "" : "none";
}
document.getElementById("folder-select").addEventListener("change", (e) => {
  currentFolder = e.target.value;
  reviewMode = false;
  renderList();
});
document.getElementById("format-chips").addEventListener("click", (e) => {
  const t = e.target.closest(".chip");
  if (!t) return;
  document.querySelectorAll("#format-chips .chip").forEach((c) => c.classList.remove("active"));
  t.classList.add("active");
  activeChip = t.dataset.fmt;
  renderList();
});
document.getElementById("batch-list-header").addEventListener("click", (e) => {
  const t = e.target.closest(".sortable");
  if (!t) return;
  const key = t.dataset.sort;
  if (key === sortBy) sortDir = sortDir === "asc" ? "desc" : "asc";
  else {
    sortBy = key;
    sortDir = "asc";
  }
  renderSortHeader();
  renderList();
});
function toggleSelectAllVisible() {
  const state = headerCheckboxState();
  const visible = visibleImages();
  const newPaths = [];
  if (state === "all") {
    for (const r of visible) selected.delete(r.fsPath);
    for (const r of visible) estimates.delete(r.fsPath);
  } else {
    for (const r of visible) {
      if (!selected.has(r.fsPath)) {
        selected.add(r.fsPath);
        newPaths.push(r.fsPath);
      }
    }
  }
  if (newPaths.length > 0) {
    vscode.postMessage({ type: "estimateRequest", srcPaths: newPaths, settings: currentSettings() });
  }
  renderCounter();
  renderList();
}
document.getElementById("header-cb").addEventListener("change", (e) => {
  e.stopPropagation();
  toggleSelectAllVisible();
});
document.getElementById("batch-list").addEventListener("change", (e) => {
  const cb = e.target;
  if (cb.tagName !== "INPUT" || cb.type !== "checkbox") return;
  const row = cb.closest(".batch-row");
  const fs = row.dataset.fs;
  if (cb.checked) selected.add(fs);
  else {
    selected.delete(fs);
    estimates.delete(fs);
  }
  if (cb.checked) {
    vscode.postMessage({ type: "estimateRequest", srcPaths: [fs], settings: currentSettings() });
  }
  renderCounter();
  renderList();
});
document.getElementById("batch-list").addEventListener("click", (e) => {
  const tgt = e.target;
  if (tgt.tagName === "INPUT") return;
  const row = tgt.closest(".batch-row");
  if (!row) return;
  const fs = row.dataset.fs;
  if (selected.has(fs)) {
    selected.delete(fs);
    estimates.delete(fs);
  } else {
    selected.add(fs);
    vscode.postMessage({ type: "estimateRequest", srcPaths: [fs], settings: currentSettings() });
  }
  renderCounter();
  renderList();
});
document.getElementById("btn-review").addEventListener("click", () => {
  reviewMode = !reviewMode;
  document.getElementById("btn-review").classList.toggle("primary", reviewMode);
  renderList();
});
formatSelect().addEventListener("change", () => {
  syncLossless();
  estimates.clear();
  vscode.postMessage({ type: "estimateInvalidate" });
  if (selected.size > 0) {
    vscode.postMessage({ type: "estimateRequest", srcPaths: [...selected], settings: currentSettings() });
  }
  renderList();
});
qualitySlider().addEventListener("input", () => {
  qualityNum().textContent = qualitySlider().value;
});
qualitySlider().addEventListener("change", () => {
  estimates.clear();
  vscode.postMessage({ type: "estimateInvalidate" });
  if (selected.size > 0) {
    vscode.postMessage({ type: "estimateRequest", srcPaths: [...selected], settings: currentSettings() });
  }
  renderList();
});
losslessCheck().addEventListener("change", () => {
  estimates.clear();
  vscode.postMessage({ type: "estimateInvalidate" });
  if (selected.size > 0) {
    vscode.postMessage({ type: "estimateRequest", srcPaths: [...selected], settings: currentSettings() });
  }
  renderList();
});
document.querySelectorAll(".preset-btn").forEach((b) => {
  b.addEventListener("click", () => {
    const q = parseInt(b.dataset.q, 10);
    qualitySlider().value = String(q);
    qualityNum().textContent = String(q);
    estimates.clear();
    vscode.postMessage({ type: "estimateInvalidate" });
    if (selected.size > 0) {
      vscode.postMessage({ type: "estimateRequest", srcPaths: [...selected], settings: currentSettings() });
    }
    renderList();
  });
});
document.getElementById("btn-convert").addEventListener("click", () => {
  vscode.postMessage({
    type: "preflightRequest",
    selected: [...selected],
    settings: currentSettings(),
    trashOriginals: trashCheck().checked
  });
});
document.getElementById("btn-cancel").addEventListener("click", () => {
  vscode.postMessage({ type: "convertCancel" });
});
function requestDelete() {
  if (selected.size === 0 || converting) return;
  vscode.postMessage({ type: "deleteRequest", paths: [...selected] });
}
document.getElementById("btn-delete").addEventListener("click", requestDelete);
window.addEventListener("message", (event) => {
  const msg = event.data;
  switch (msg.type) {
    case "init": {
      folders = msg.folders;
      allImages = msg.images;
      for (const fs of [...selected]) if (!allImages.find((r) => r.fsPath === fs)) selected.delete(fs);
      const sel = document.getElementById("folder-select");
      const prev = sel.value || "__all__";
      sel.innerHTML = `<option value="__all__">All folders</option>` + folders.map((f) => `<option value="${escapeAttr(f)}">${escapeHtml(f === "." ? "(workspace root)" : f)}</option>`).join("");
      const stillValid = prev === "__all__" || folders.includes(prev);
      sel.value = stillValid ? prev : "__all__";
      currentFolder = sel.value;
      renderSortHeader();
      syncLossless();
      renderList();
      renderCounter();
      break;
    }
    case "estimate": {
      estimates.set(msg.srcPath, msg.result);
      renderList();
      renderCounter();
      break;
    }
    case "convertStarted": {
      converting = true;
      document.getElementById("batch-footer-progress").classList.remove("hidden");
      document.getElementById("batch-footer-actions").classList.add("hidden");
      rowStatus.clear();
      for (const fs of selected) rowStatus.set(fs, { status: "pending" });
      renderList();
      renderCounter();
      break;
    }
    case "convertProgress": {
      const m = msg;
      rowStatus.set(m.srcPath, { status: m.status, error: m.error });
      const fill = document.getElementById("progress-fill");
      const text = document.getElementById("progress-text");
      fill.style.width = `${m.doneCount / m.totalCount * 100}%`;
      text.textContent = `${m.doneCount}/${m.totalCount}`;
      renderList();
      break;
    }
    case "convertDone": {
      converting = false;
      document.getElementById("batch-footer-progress").classList.add("hidden");
      document.getElementById("batch-footer-actions").classList.remove("hidden");
      renderCounter();
      break;
    }
    case "deleteDone": {
      const trashed = msg.trashed;
      for (const p of trashed) {
        selected.delete(p);
        estimates.delete(p);
        rowStatus.delete(p);
      }
      renderList();
      renderCounter();
      break;
    }
    case "showError": {
      const list = document.getElementById("batch-list");
      list.innerHTML = `<div class="empty">${escapeHtml(msg.message)}</div>`;
      break;
    }
  }
});
document.addEventListener("keydown", (e) => {
  const tgt = e.target;
  const tag = tgt?.tagName;
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
  if ((e.metaKey || e.ctrlKey) && (e.key === "a" || e.key === "A")) {
    e.preventDefault();
    window.getSelection()?.removeAllRanges();
    toggleSelectAllVisible();
    return;
  }
  if ((e.metaKey || e.ctrlKey) && e.key === "Backspace") {
    e.preventDefault();
    requestDelete();
    return;
  }
  if (e.key === "Delete") {
    e.preventDefault();
    requestDelete();
    return;
  }
});
//# sourceMappingURL=batch.js.map
