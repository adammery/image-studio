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

window.addEventListener('message', (event) => {
  const msg = event.data as { type: string; [k: string]: unknown };
  // wired in Task 8
  void msg;
});
