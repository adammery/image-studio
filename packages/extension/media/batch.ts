declare const acquireVsCodeApi: () => {
  postMessage: (msg: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};

const vscode = acquireVsCodeApi();

document.getElementById('root')!.innerHTML = /* html */ `
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
      </div>
    </div>
    <div id="batch-list-header">
      <div class="bl-cb"></div>
      <div class="bl-stat"></div>
      <div class="bl-name sortable" data-sort="name">Name</div>
      <div class="bl-fmt sortable" data-sort="format">Format</div>
      <div class="bl-size sortable" data-sort="size">Size</div>
      <div class="bl-est sortable" data-sort="est">→ Est.</div>
    </div>
    <div id="batch-list" role="list"></div>
    <div id="batch-empty" class="empty hidden">No images in this workspace.</div>
  </div>

  <div id="batch-panel">
    <div id="panel-sections">
      <div class="panel-section" id="section-compress">
        <div class="section-head"><span class="section-icon">◆</span> Compress<span class="section-caret">▾</span></div>
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

// State
type ImageRow = {
  fsPath: string;
  basename: string;
  ext: string;
  size: number;
  folderRel: string;
};

let allImages: ImageRow[] = [];
let folders: string[] = [];
let currentFolder = '__all__';
let activeChip: 'all' | 'png' | 'jpg' | 'webp' | 'avif' = 'all';
let sortBy: 'name' | 'format' | 'size' | 'est' = 'name';
let sortDir: 'asc' | 'desc' = 'asc';
let estimates = new Map<string, { ok: boolean; size?: number; message?: string }>();
let selected = new Set<string>();
let reviewMode = false;
let converting = false;
let rowStatus = new Map<string, { status: 'pending' | 'in-progress' | 'done' | 'failed'; error?: string }>();

// Settings (right panel)
const formatSelect = () => document.getElementById('format-select') as HTMLSelectElement;
const qualitySlider = () => document.getElementById('quality-slider') as HTMLInputElement;
const qualityNum = () => document.getElementById('quality-num') as HTMLSpanElement;
const losslessCheck = () => document.getElementById('lossless-check') as HTMLInputElement;
const losslessRow = () => document.getElementById('lossless-row') as HTMLLabelElement;
const trashCheck = () => document.getElementById('trash-check') as HTMLInputElement;

function currentSettings() {
  return {
    format: formatSelect().value as 'same' | 'png' | 'jpeg' | 'webp' | 'avif',
    quality: parseInt(qualitySlider().value, 10),
    lossless: losslessCheck().checked,
  };
}

function visibleImages(): ImageRow[] {
  let rows = allImages;
  if (reviewMode) rows = rows.filter((r) => selected.has(r.fsPath));
  else if (currentFolder !== '__all__') rows = rows.filter((r) => r.folderRel === currentFolder);
  if (activeChip !== 'all') rows = rows.filter((r) => normExt(r.ext) === activeChip);
  rows = rows.slice().sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case 'name':   cmp = a.basename.localeCompare(b.basename); break;
      case 'format': cmp = a.ext.localeCompare(b.ext); break;
      case 'size':   cmp = a.size - b.size; break;
      case 'est': {
        const ea = estimates.get(a.fsPath);
        const eb = estimates.get(b.fsPath);
        const sa = ea?.ok ? ea.size! : Number.POSITIVE_INFINITY;
        const sb = eb?.ok ? eb.size! : Number.POSITIVE_INFINITY;
        cmp = sa - sb; break;
      }
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });
  return rows;
}

function normExt(ext: string): 'png' | 'jpg' | 'webp' | 'avif' | 'all' {
  const e = ext.toLowerCase();
  if (e === 'jpeg') return 'jpg';
  if (e === 'png' || e === 'jpg' || e === 'webp' || e === 'avif') return e;
  return 'all';
}

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1_048_576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1_048_576).toFixed(2)} MB`;
}

function statusIcon(s: 'pending' | 'in-progress' | 'done' | 'failed' | undefined): string {
  switch (s) {
    case 'pending':     return '⏳';
    case 'in-progress': return '🔄';
    case 'done':        return '✓';
    case 'failed':      return '✗';
    default:            return '';
  }
}

function renderList(): void {
  const list = document.getElementById('batch-list') as HTMLDivElement;
  const empty = document.getElementById('batch-empty') as HTMLDivElement;
  const scrollTop = list.scrollTop;
  const rows = visibleImages();
  if (rows.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    list.scrollTop = scrollTop;
    return;
  }
  empty.classList.add('hidden');
  const showFolderPrefix = currentFolder === '__all__' || reviewMode;
  list.innerHTML = rows.map((r) => {
    const checked = selected.has(r.fsPath) ? 'checked' : '';
    const est = estimates.get(r.fsPath);
    let estText = '—';
    if (est) estText = est.ok ? fmtBytes(est.size!) : 'error';
    else if (selected.has(r.fsPath)) estText = '(working…)';
    const stat = rowStatus.get(r.fsPath);
    const failed = stat?.status === 'failed';
    const name = showFolderPrefix && r.folderRel !== '.' ? `${r.folderRel}/${r.basename}` : r.basename;
    const title = stat?.error ? ` title="${escapeAttr(stat.error)}"` : '';
    return `<div class="batch-row${failed ? ' failed' : ''}" data-fs="${escapeAttr(r.fsPath)}"${title}>
      <div class="bl-cb"><input type="checkbox" ${checked}></div>
      <div class="bl-stat">${statusIcon(stat?.status)}</div>
      <div class="bl-name">${escapeHtml(name)}</div>
      <div class="bl-fmt">${r.ext.toUpperCase()}</div>
      <div class="bl-size">${fmtBytes(r.size)}</div>
      <div class="bl-est">${estText}</div>
    </div>`;
  }).join('');
  list.scrollTop = scrollTop;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
function escapeAttr(s: string): string { return escapeHtml(s); }

function distinctFolderCount(): number {
  const set = new Set<string>();
  for (const fs of selected) {
    const row = allImages.find((r) => r.fsPath === fs);
    if (row) set.add(row.folderRel);
  }
  return set.size;
}

function renderCounter(): void {
  const c = document.getElementById('batch-counter')!;
  const n = selected.size;
  const f = distinctFolderCount();
  c.textContent = n === 0 ? '0 selected' :
                  f <= 1   ? `${n} selected` :
                             `${n} selected (across ${f} folders)`;
  const btn = document.getElementById('btn-convert') as HTMLButtonElement;
  btn.textContent = `Convert ${n}`;
  btn.disabled = n === 0 || converting;
}

function renderSortHeader(): void {
  document.querySelectorAll('#batch-list-header .sortable').forEach((el) => {
    el.classList.remove('sort-asc', 'sort-desc');
    if ((el as HTMLElement).dataset.sort === sortBy) {
      el.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
    }
  });
}

function syncLossless(): void {
  const f = formatSelect().value;
  losslessRow().style.display = (f === 'webp' || f === 'avif') ? '' : 'none';
}

// Events
document.getElementById('folder-select')!.addEventListener('change', (e) => {
  currentFolder = (e.target as HTMLSelectElement).value;
  reviewMode = false;
  renderList();
});

document.getElementById('format-chips')!.addEventListener('click', (e) => {
  const t = (e.target as HTMLElement).closest('.chip') as HTMLElement | null;
  if (!t) return;
  document.querySelectorAll('#format-chips .chip').forEach((c) => c.classList.remove('active'));
  t.classList.add('active');
  activeChip = t.dataset.fmt as typeof activeChip;
  renderList();
});

document.getElementById('batch-list-header')!.addEventListener('click', (e) => {
  const t = (e.target as HTMLElement).closest('.sortable') as HTMLElement | null;
  if (!t) return;
  const key = t.dataset.sort as typeof sortBy;
  if (key === sortBy) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
  else { sortBy = key; sortDir = 'asc'; }
  renderSortHeader();
  renderList();
});

document.getElementById('batch-list')!.addEventListener('change', (e) => {
  const cb = e.target as HTMLInputElement;
  if (cb.tagName !== 'INPUT' || cb.type !== 'checkbox') return;
  const row = cb.closest('.batch-row') as HTMLElement;
  const fs = row.dataset.fs!;
  if (cb.checked) selected.add(fs);
  else { selected.delete(fs); estimates.delete(fs); }
  vscode.postMessage({ type: 'selectionChanged', selected: [...selected] });
  if (cb.checked) {
    vscode.postMessage({ type: 'estimateRequest', srcPaths: [fs], settings: currentSettings() });
  }
  renderCounter();
  renderList();
});

document.getElementById('btn-review')!.addEventListener('click', () => {
  reviewMode = !reviewMode;
  (document.getElementById('btn-review') as HTMLButtonElement).classList.toggle('primary', reviewMode);
  renderList();
});

formatSelect().addEventListener('change', () => {
  syncLossless();
  estimates.clear();
  vscode.postMessage({ type: 'estimateInvalidate' });
  if (selected.size > 0) {
    vscode.postMessage({ type: 'estimateRequest', srcPaths: [...selected], settings: currentSettings() });
  }
  renderList();
});

qualitySlider().addEventListener('input', () => {
  qualityNum().textContent = qualitySlider().value;
});
qualitySlider().addEventListener('change', () => {
  estimates.clear();
  vscode.postMessage({ type: 'estimateInvalidate' });
  if (selected.size > 0) {
    vscode.postMessage({ type: 'estimateRequest', srcPaths: [...selected], settings: currentSettings() });
  }
  renderList();
});
losslessCheck().addEventListener('change', () => {
  estimates.clear();
  vscode.postMessage({ type: 'estimateInvalidate' });
  if (selected.size > 0) {
    vscode.postMessage({ type: 'estimateRequest', srcPaths: [...selected], settings: currentSettings() });
  }
  renderList();
});

document.querySelectorAll('.preset-btn').forEach((b) => {
  b.addEventListener('click', () => {
    const q = parseInt((b as HTMLElement).dataset.q!, 10);
    qualitySlider().value = String(q);
    qualityNum().textContent = String(q);
    estimates.clear();
    vscode.postMessage({ type: 'estimateInvalidate' });
    if (selected.size > 0) {
      vscode.postMessage({ type: 'estimateRequest', srcPaths: [...selected], settings: currentSettings() });
    }
    renderList();
  });
});

document.getElementById('btn-convert')!.addEventListener('click', () => {
  vscode.postMessage({
    type: 'preflightRequest',
    selected: [...selected],
    settings: currentSettings(),
    trashOriginals: trashCheck().checked,
  });
});

document.getElementById('btn-cancel')!.addEventListener('click', () => {
  vscode.postMessage({ type: 'convertCancel' });
});

window.addEventListener('message', (event) => {
  const msg = event.data as { type: string; [k: string]: unknown };
  switch (msg.type) {
    case 'init': {
      folders = msg.folders as string[];
      allImages = msg.images as ImageRow[];
      const sel = document.getElementById('folder-select') as HTMLSelectElement;
      sel.innerHTML = `<option value="__all__">All folders</option>` +
        folders.map((f) => `<option value="${escapeAttr(f)}">${escapeHtml(f === '.' ? '(workspace root)' : f)}</option>`).join('');
      renderSortHeader();
      syncLossless();
      renderList();
      renderCounter();
      break;
    }
    case 'estimate': {
      estimates.set(msg.srcPath as string, msg.result as { ok: boolean; size?: number; message?: string });
      renderList();
      renderCounter();
      break;
    }
    case 'convertStarted': {
      converting = true;
      document.getElementById('batch-footer-progress')!.classList.remove('hidden');
      document.getElementById('batch-footer-actions')!.classList.add('hidden');
      rowStatus.clear();
      for (const fs of selected) rowStatus.set(fs, { status: 'pending' });
      renderList();
      renderCounter();
      break;
    }
    case 'convertProgress': {
      const m = msg as { srcPath: string; status: 'pending' | 'in-progress' | 'done' | 'failed'; error?: string; doneCount: number; totalCount: number };
      rowStatus.set(m.srcPath, { status: m.status, error: m.error });
      const fill = document.getElementById('progress-fill') as HTMLDivElement;
      const text = document.getElementById('progress-text') as HTMLSpanElement;
      fill.style.width = `${(m.doneCount / m.totalCount) * 100}%`;
      text.textContent = `${m.doneCount}/${m.totalCount}`;
      renderList();
      break;
    }
    case 'convertDone': {
      converting = false;
      document.getElementById('batch-footer-progress')!.classList.add('hidden');
      document.getElementById('batch-footer-actions')!.classList.remove('hidden');
      renderCounter();
      break;
    }
    case 'showError': {
      const list = document.getElementById('batch-list') as HTMLDivElement;
      list.innerHTML = `<div class="empty">${escapeHtml(msg.message as string)}</div>`;
      break;
    }
  }
});
