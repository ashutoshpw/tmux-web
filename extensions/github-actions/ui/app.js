"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // backend/bridge.ts
  var ExtBridge = class {
    constructor(extensionId) {
      __publicField(this, "extId");
      __publicField(this, "contextCb", null);
      __publicField(this, "configCb", null);
      __publicField(this, "_config", null);
      this.extId = extensionId;
      window.addEventListener("message", this._onMessage.bind(this));
      window.parent.postMessage({ type: "ext:ready" }, "*");
    }
    _onMessage(event) {
      const msg = event.data;
      if (!msg?.type) return;
      if (msg.type === "ext:context" && this.contextCb) {
        this.contextCb(msg.context);
      } else if (msg.type === "ext:config") {
        this._config = msg.config;
        if (this.configCb) this.configCb(msg.config);
      }
    }
    onContext(cb) {
      this.contextCb = cb;
    }
    onConfig(cb) {
      this.configCb = cb;
    }
    getConfig() {
      return this._config;
    }
    async request(path, options) {
      const url = `/ext/${this.extId}/api${path}`;
      const init = { method: options?.method ?? "GET" };
      if (options?.body !== void 0) {
        init.body = JSON.stringify(options.body);
        init.headers = { "Content-Type": "application/json" };
      }
      const res = await fetch(url, init);
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`[ext-sdk] ${url} \u2192 ${res.status}: ${text}`);
      }
      return res.json();
    }
    resize(height) {
      const msg = { type: "ext:resize", height };
      window.parent.postMessage(msg, "*");
    }
  };

  // backend/index.ts
  var _bridge = null;
  function createExtension(extensionId) {
    if (_bridge) {
      throw new Error("[ext-sdk] createExtension() called more than once");
    }
    _bridge = new ExtBridge(extensionId);
    return _bridge;
  }

  // ui/app.ts
  var ext = createExtension("github-actions");
  var _session = "";
  var _pollTimer = 0;
  var STATUS_ICON = {
    success: "\u2713",
    failure: "\u2717",
    cancelled: "\u25CB",
    skipped: "\u2014",
    timed_out: "\u23F1",
    in_progress: "\u27F3",
    queued: "\u2026",
    waiting: "\u23F8"
  };
  var STATUS_COLOR = {
    success: "#73c991",
    failure: "#f14c4c",
    cancelled: "#888",
    skipped: "#888",
    timed_out: "#e9c46a",
    in_progress: "#e9c46a",
    queued: "#888",
    waiting: "#888"
  };
  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function safeHref(url) {
    return url.startsWith("https://github.com/") ? esc(url) : "#";
  }
  function stateKey(run) {
    return run.status === "completed" ? run.conclusion ?? "unknown" : run.status;
  }
  function relativeTime(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 6e4);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (mins > 0) return `${mins}m ago`;
    return "just now";
  }
  function labelFromUrl(url) {
    const file = url.match(/\/actions\/workflows\/([^/?#]+)/)?.[1]?.replace(/\.(yml|yaml)$/, "") ?? url;
    const repo = url.match(/github\.com\/([^/]+\/[^/]+)/)?.[1] ?? "";
    return repo ? `${repo} / ${file}` : file;
  }
  function renderRow(url, index, run, error) {
    const label = esc(labelFromUrl(url));
    const idxAttr = index;
    if (error) {
      return `<div class="wf-row" id="wf-row-${idxAttr}">
      <span class="wf-icon" style="color:#f14c4c">!</span>
      <div class="wf-body">
        <div class="wf-name">${label}</div>
        <div class="wf-meta" style="color:#f14c4c">${esc(error)}</div>
      </div>
      <button class="wf-remove" onclick="removeWorkflow(${idxAttr})" title="Remove">\xD7</button>
    </div>`;
    }
    if (!run) {
      return `<div class="wf-row" id="wf-row-${idxAttr}">
      <span class="wf-icon wf-spin" style="color:#888">\u27F3</span>
      <div class="wf-body">
        <div class="wf-name">${label}</div>
        <div class="wf-meta">loading\u2026</div>
      </div>
      <button class="wf-remove" onclick="removeWorkflow(${idxAttr})" title="Remove">\xD7</button>
    </div>`;
    }
    const key = stateKey(run);
    const color = STATUS_COLOR[key] ?? "#888";
    const icon = STATUS_ICON[key] ?? "?";
    const spin = key === "in_progress" ? " wf-spin" : "";
    const branch = esc(run.head_branch);
    const when = esc(relativeTime(run.updated_at));
    const ghHref = safeHref(run.html_url);
    const urlEncoded = esc(JSON.stringify(url));
    return `<div class="wf-row" id="wf-row-${idxAttr}">
    <span class="wf-icon${spin}" style="color:${color}">${icon}</span>
    <div class="wf-body">
      <div class="wf-name">${label}</div>
      <div class="wf-meta">${branch} \xB7 ${when}</div>
    </div>
    <div class="wf-actions">
      <a class="wf-link" href="${ghHref}" target="_blank" rel="noopener" title="Open in GitHub">\u2197</a>
      <button class="wf-btn" onclick="rerunWorkflow(${urlEncoded})" title="Re-run">\u25B6</button>
      <button class="wf-remove" onclick="removeWorkflow(${idxAttr})" title="Remove">\xD7</button>
    </div>
  </div>`;
  }
  async function fetchRun(url) {
    const data = await ext.request(`/runs?url=${encodeURIComponent(url)}&perPage=1`);
    return data.workflow_runs?.[0] ?? null;
  }
  async function loadAndRender() {
    if (!_session) return;
    const urls = await ext.request(`/workflows?session=${encodeURIComponent(_session)}`);
    const runsEl = document.getElementById("runs");
    const emptyEl = document.getElementById("empty-state");
    const loadingEl = document.getElementById("loading");
    loadingEl.style.display = "none";
    if (urls.length === 0) {
      runsEl.textContent = "";
      emptyEl.style.display = "block";
      ext.resize(document.body.scrollHeight + 16);
      return;
    }
    emptyEl.style.display = "none";
    runsEl.style.display = "block";
    runsEl.innerHTML = urls.map((url, i) => renderRow(url, i, null)).join("");
    ext.resize(document.body.scrollHeight + 16);
    await Promise.all(urls.map(async (url, i) => {
      try {
        const run = await fetchRun(url);
        const el = document.getElementById(`wf-row-${i}`);
        if (el) el.outerHTML = renderRow(url, i, run);
      } catch {
        const el = document.getElementById(`wf-row-${i}`);
        if (el) el.outerHTML = renderRow(url, i, null, "fetch failed");
      }
    }));
    ext.resize(document.body.scrollHeight + 16);
    window.updateTimestamp?.();
  }
  window.__refresh = loadAndRender;
  window.removeWorkflow = async (index) => {
    await ext.request(`/workflows?session=${encodeURIComponent(_session)}&index=${index}`, {
      method: "DELETE"
    });
    await loadAndRender();
  };
  window.rerunWorkflow = async (url) => {
    try {
      await ext.request("/dispatch", { method: "POST", body: { url, ref: "main" } });
      setTimeout(loadAndRender, 3e3);
    } catch (e) {
      console.error("[github-actions] rerun failed:", e);
    }
  };
  window.addWorkflow = async () => {
    const input = document.getElementById("wf-input");
    const errEl = document.getElementById("wf-input-err");
    const url = input.value.trim();
    if (!url) return;
    errEl.textContent = "";
    try {
      await ext.request("/workflows", { method: "POST", body: { session: _session, url } });
      input.value = "";
      await loadAndRender();
    } catch (e) {
      const msg = String(e?.message ?? e);
      errEl.textContent = msg.includes("400") ? "Not a valid GitHub Actions workflow URL" : `Error: ${msg}`;
    }
  };
  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("wf-input")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") window.addWorkflow();
    });
  });
  ext.onContext(async (ctx) => {
    _session = ctx.session;
    const el = document.getElementById("session-label");
    if (el) el.textContent = ctx.session;
    await loadAndRender();
  });
  ext.onConfig((rawCfg) => {
    const cfg = rawCfg;
    clearInterval(_pollTimer);
    _pollTimer = setInterval(loadAndRender, cfg.pollIntervalMs ?? 6e4);
  });
})();
