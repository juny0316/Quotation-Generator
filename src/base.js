/* ===== 런타임 · 저장소 · 공용 컴포넌트 ===== */
const { h, render, Fragment } = preact;
const { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } = preactHooks;
const html = htm.bind(h);

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const LOGO_DATA = 'data:image/png;base64,' + LOGO_B64;

/* ---------- 런타임(Claude 기능) ---------- */
const RT = { ready: false, mode: 'init', db: null, downloads: null, user: null, uid: null, canWrite: null };

/* ---------- 외부 라이브러리(필요할 때만 로드) ---------- */
const LIBS = {
  xlsx: ['https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'],
  exceljs: ['https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js'],
  pdf: ['https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js', 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'],
  mammoth: ['https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js'],
  jszip: ['https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'],
  html2canvas: ['https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'],
  jspdf: ['https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js']
};
const _libLoads = {};
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = false;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('라이브러리를 불러오지 못했습니다: ' + src.split('/npm/')[1]));
    document.head.appendChild(s);
  });
}
function loadLib(name) {
  if (!_libLoads[name]) {
    _libLoads[name] = LIBS[name].reduce((p, src) => p.then(() => loadScript(src)), Promise.resolve())
      .catch((e) => { delete _libLoads[name]; throw e; });
  }
  return _libLoads[name];
}

/* ---------- 유틸 ---------- */
const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const str = (v) => (v === null || v === undefined ? '' : String(v)).trim();
const arr = (v) => (Array.isArray(v) ? v : []);
function lsGet(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 저장 불가 환경 */ } }
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

/* ---------- 저장소 (db 또는 이 브라우저) ---------- */
const Store = (() => {
  let impl = null;
  const subs = new Set();
  let pending = 0, lastError = null;
  const emit = () => subs.forEach((fn) => fn({ pending: pending, error: lastError, mode: impl ? impl.mode : 'init' }));
  const queues = new Map();

  /* 서버 API(/api/docs) — 주기적으로 다시 읽어 다른 사람의 변경을 반영 */
  function apiImpl() {
    const docW = new Map(), colW = new Map();
    const cache = new Map();
    const call = async (method, url, body) => {
      const r = await fetch(url, { method: method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401) { if (RT.onUnauthorized) RT.onUnauthorized(); throw { code: 'unauthorized' }; }
      if (!r.ok) throw { code: j.error || 'server', message: j.message || ('HTTP ' + r.status) };
      return j;
    };
    const colOf = (p) => p.split('/').slice(0, -1).join('/');
    const fetchCol = async (name, w) => {
      try { const j = await call('GET', '/api/docs?collection=' + encodeURIComponent(name)); w.cb(sortRows(j.rows, w.opts)); }
      catch (e) { if (w.onErr && !w.loaded) w.onErr(e); }
      w.loaded = true;
    };
    const sortRows = (rows, opts) => {
      const out = rows.slice();
      if (opts && opts.orderBy) {
        const f = opts.orderBy, dir = opts.dir === 'desc' ? -1 : 1;
        out.sort((a, b) => ((a[f] ?? '') > (b[f] ?? '') ? dir : (a[f] ?? '') < (b[f] ?? '') ? -dir : 0));
      }
      return opts && opts.limit ? out.slice(0, opts.limit) : out;
    };
    const fetchDoc = async (path) => {
      try {
        const j = await call('GET', '/api/docs?path=' + encodeURIComponent(path));
        const s = JSON.stringify(j.data);
        if (cache.get(path) === s) return;
        cache.set(path, s);
        (docW.get(path) || new Set()).forEach((w) => w.cb(clone(j.data)));
      } catch (e) { (docW.get(path) || new Set()).forEach((w) => { if (w.onErr && !w.loaded) w.onErr(e); }); }
      (docW.get(path) || new Set()).forEach((w) => { w.loaded = true; });
    };
    const colTimers = {};
    const scheduleCol = (c) => {
      clearTimeout(colTimers[c]);
      colTimers[c] = setTimeout(() => (colW.get(c) || new Set()).forEach((w) => fetchCol(c, w)), 1500);
    };
    const refreshAll = () => {
      colW.forEach((set, name) => set.forEach((w) => fetchCol(name, w)));
      docW.forEach((set, path) => { if (set.size) fetchDoc(path); });
    };
    setInterval(() => { if (document.visibilityState === 'visible') refreshAll(); }, 20000);
    window.addEventListener('focus', refreshAll);
    return {
      mode: 'api',
      watchCol(name, opts, cb, onErr) {
        const w = { cb: cb, opts: opts, onErr: onErr, loaded: false };
        if (!colW.has(name)) colW.set(name, new Set());
        colW.get(name).add(w);
        fetchCol(name, w);
        return () => colW.get(name).delete(w);
      },
      watchDoc(path, cb, onErr) {
        const w = { cb: cb, onErr: onErr, loaded: false };
        if (!docW.has(path)) docW.set(path, new Set());
        docW.get(path).add(w);
        cache.delete(path);
        fetchDoc(path);
        return () => docW.get(path).delete(w);
      },
      async set(path, data) {
        await call('PUT', '/api/docs', { path: path, data: data });
        cache.set(path, JSON.stringify(data));
        scheduleCol(colOf(path));
      },
      async del(path) {
        await call('DELETE', '/api/docs?path=' + encodeURIComponent(path));
        cache.delete(path);
        (docW.get(path) || new Set()).forEach((w) => w.cb(null));
        const c = colOf(path);
        (colW.get(c) || new Set()).forEach((w) => fetchCol(c, w));
      }
    };
  }

  function dbImpl(db) {
    return {
      mode: 'db',
      watchCol(name, opts, cb, onErr) {
        let q = db.collection(name);
        if (opts && opts.orderBy) q = q.orderBy(opts.orderBy, opts.dir || 'asc');
        if (opts && opts.limit) q = q.limit(opts.limit);
        return q.onSnapshot((snap) => cb(snap.docs.map((d) => Object.assign({}, clone(d.data()), { id: d.id }))), (e) => onErr && onErr(e));
      },
      watchDoc(path, cb, onErr) {
        return db.doc(path).onSnapshot((s) => cb(s.exists ? clone(s.data()) : null), (e) => onErr && onErr(e));
      },
      async set(path, data) {
        try { await db.doc(path).set(data); }
        catch (e) {
          if (e && e.code === 'unavailable') { await sleep(400 + Math.random() * 700); await db.doc(path).set(data); }
          else throw e;
        }
      },
      del(path) { return db.doc(path).delete(); }
    };
  }

  function localImpl() {
    const KEY = 'uq-quote-app:v1';
    const mem = new Map();
    try { const raw = localStorage.getItem(KEY); if (raw) Object.entries(JSON.parse(raw)).forEach(([k, v]) => mem.set(k, v)); } catch (e) { /* 없음 */ }
    const docW = new Map(), colW = new Map();
    const persist = debounce(() => { try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(mem))); } catch (e) { /* 용량 초과 등 */ } }, 300);
    const colOf = (p) => p.split('/').slice(0, -1).join('/');
    const listCol = (name, opts) => {
      const out = [];
      mem.forEach((v, k) => { if (colOf(k) === name) out.push(Object.assign({}, clone(v), { id: k.split('/').pop() })); });
      if (opts && opts.orderBy) {
        const f = opts.orderBy, dir = opts.dir === 'desc' ? -1 : 1;
        out.sort((a, b) => ((a[f] ?? 0) > (b[f] ?? 0) ? dir : (a[f] ?? 0) < (b[f] ?? 0) ? -dir : 0));
      }
      return opts && opts.limit ? out.slice(0, opts.limit) : out;
    };
    const notify = (path) => {
      (docW.get(path) || new Set()).forEach((fn) => fn(mem.has(path) ? clone(mem.get(path)) : null));
      const c = colOf(path);
      (colW.get(c) || new Set()).forEach((w) => w.cb(listCol(c, w.opts)));
    };
    return {
      mode: 'local',
      watchCol(name, opts, cb) {
        const w = { cb: cb, opts: opts };
        if (!colW.has(name)) colW.set(name, new Set());
        colW.get(name).add(w);
        setTimeout(() => cb(listCol(name, opts)), 0);
        return () => colW.get(name).delete(w);
      },
      watchDoc(path, cb) {
        if (!docW.has(path)) docW.set(path, new Set());
        docW.get(path).add(cb);
        setTimeout(() => cb(mem.has(path) ? clone(mem.get(path)) : null), 0);
        return () => docW.get(path).delete(cb);
      },
      async set(path, data) { mem.set(path, clone(data)); persist(); setTimeout(() => notify(path), 0); },
      async del(path) { mem.delete(path); persist(); setTimeout(() => notify(path), 0); }
    };
  }

  async function pump(path, q) {
    q.running = true;
    while (q.next !== undefined) {
      const data = q.next; q.next = undefined;
      const waiters = q.waiters.splice(0);
      pending++; emit();
      let err = null;
      try { await impl.set(path, data); lastError = null; }
      catch (e) { err = e; lastError = e; console.warn('저장 실패', path, e); }
      pending--; emit();
      waiters.forEach((w) => (err ? w.reject(err) : w.resolve()));
    }
    q.running = false;
  }

  return {
    init(db) { impl = db === 'api' ? apiImpl() : db ? dbImpl(db) : localImpl(); emit(); },
    get mode() { return impl ? impl.mode : 'init'; },
    onStatus(fn) { subs.add(fn); fn({ pending: pending, error: lastError, mode: impl ? impl.mode : 'init' }); return () => subs.delete(fn); },
    watchCol(name, opts, cb, onErr) { return impl.watchCol(name, opts, cb, onErr); },
    watchDoc(path, cb, onErr) { return impl.watchDoc(path, cb, onErr); },
    set(path, data) {
      let q = queues.get(path);
      if (!q) { q = { running: false, next: undefined, waiters: [] }; queues.set(path, q); }
      q.next = data;
      const p = new Promise((resolve, reject) => q.waiters.push({ resolve: resolve, reject: reject }));
      if (!q.running) pump(path, q);
      return p;
    },
    async del(path) {
      pending++; emit();
      try { await impl.del(path); lastError = null; } catch (e) { lastError = e; throw e; } finally { pending--; emit(); }
    }
  };
})();

/* ---------- 파일 저장(다운로드) ---------- */
async function saveFile(filename, data) {
  if (RT.downloads) {
    try {
      await RT.downloads.save({ filename: filename, data: data });
      toast('저장했습니다 · ' + filename);
    } catch (e) {
      if (e && e.code === 'declined') return;
      if (e && e.code === 'rate_limited') { toast('저장 창이 이미 열려 있습니다. 잠시 후 다시 눌러 주세요.', 'bad'); return; }
      toast('파일을 저장하지 못했습니다' + (e && e.code ? ' (' + e.code + ')' : ''), 'bad');
    }
    return;
  }
  try {
    const blob = data instanceof Blob ? data : new Blob([data]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch (e) {
    toast('이 화면에서는 파일을 내려받을 수 없습니다.', 'bad');
  }
}

/* ---------- 클립보드 ---------- */
async function copyText(text, label) {
  try { await navigator.clipboard.writeText(text); toast((label || '내용') + '을(를) 복사했습니다'); return true; }
  catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
    ta.remove();
    toast(ok ? (label || '내용') + '을(를) 복사했습니다' : '복사하지 못했습니다. 직접 선택해 복사해 주세요.', ok ? '' : 'bad');
    return ok;
  }
}
async function copyRich(htmlStr, text, label) {
  try {
    if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([htmlStr], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
      toast((label || '본문') + '을(를) 서식 그대로 복사했습니다');
      return true;
    }
  } catch (e) { /* 아래 방식으로 */ }
  try {
    const div = document.createElement('div');
    div.contentEditable = 'true';
    div.innerHTML = htmlStr;
    div.style.cssText = 'position:fixed;left:-9999px;top:0;background:#fff;color:#111';
    document.body.appendChild(div);
    const range = document.createRange(); range.selectNodeContents(div);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
    const ok = document.execCommand('copy');
    sel.removeAllRanges(); div.remove();
    if (ok) { toast((label || '본문') + '을(를) 서식 그대로 복사했습니다'); return true; }
  } catch (e) { /* 텍스트로 */ }
  return copyText(text, label);
}

/* ---------- 토스트 ---------- */
let _toastSet = null;
function toast(msg, kind) {
  if (!_toastSet) return;
  const id = Math.random();
  _toastSet((list) => list.concat([{ id: id, msg: msg, kind: kind || '' }]).slice(-3));
  setTimeout(() => _toastSet((list) => list.filter((t) => t.id !== id)), kind === 'bad' ? 6000 : 3200);
}
function Toasts() {
  const [list, setList] = useState([]);
  useEffect(() => { _toastSet = setList; return () => { _toastSet = null; }; }, []);
  return html`<div class="toasts" role="status" aria-live="polite">${list.map((t) => html`<div key=${t.id} class=${'toast ' + t.kind}>${t.msg}</div>`)}</div>`;
}

/* ---------- 아이콘(인라인 SVG) ---------- */
const ICONS = {
  plus: 'M12 5v14M5 12h14',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  x: 'M6 6l12 12M18 6L6 18',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3',
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5',
  upload: 'M12 16V4M7 9l5-5 5 5M5 20h14',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  mail: 'M4 6h16v12H4zM4 7l8 6 8-6',
  spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  check: 'M5 12l5 5 9-10',
  back: 'M15 18l-6-6 6-6',
  next: 'M9 18l6-6-6-6',
  dl: 'M12 4v12M7 11l5 5 5-5M5 20h14',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  stop: 'M7 7h10v10H7z',
  search: 'M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zM20 20l-4-4'
};
function Icon({ name, size }) {
  const s = size || 16;
  return html`<svg width=${s} height=${s} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d=${ICONS[name] || ''} /></svg>`;
}

/* ---------- 입력 컴포넌트 ---------- */
function NumInput({ value, onChange, placeholder, id, className, suffix, decimals, ariaLabel, disabled }) {
  const [focus, setFocus] = useState(false);
  const [text, setText] = useState('');
  const shown = focus ? text : (value === null || value === undefined || value === '' ? '' : (decimals ? Number(value).toLocaleString('en-US', { maximumFractionDigits: decimals }) : L.fmt(value)));
  return html`<input id=${id} class=${'input num ' + (className || '')} inputmode="decimal" value=${shown} placeholder=${placeholder || ''} aria-label=${ariaLabel} disabled=${disabled}
    onFocus=${(e) => { setFocus(true); setText(value === null || value === undefined ? '' : String(value)); setTimeout(() => { try { e.target.select(); } catch (x) { /* 무시 */ } }, 0); }}
    onBlur=${() => setFocus(false)}
    onInput=${(e) => { setText(e.target.value); const n = L.num(e.target.value); onChange(n === null ? null : (decimals ? Math.round(n * Math.pow(10, decimals)) / Math.pow(10, decimals) : n)); }} />`;
}

function AutoText({ value, onInput, placeholder, rows, className, id, ariaLabel, minRows }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(Math.max(el.scrollHeight + 2, (minRows || 1) * 20 + 12), 420) + 'px';
  }, [value]);
  return html`<textarea ref=${ref} id=${id} aria-label=${ariaLabel} class=${'textarea ' + (className || '')} rows=${rows || 1} placeholder=${placeholder || ''} value=${value || ''} onInput=${(e) => onInput(e.target.value)} style="resize:none;overflow:hidden" />`;
}

function Field({ label, hint, children, className }) {
  return html`<label class=${'field ' + (className || '')}><span>${label}${hint ? html`<em>${hint}</em>` : null}</span>${children}</label>`;
}

/* 확인 버튼(인라인 2단계) */
function ConfirmBtn({ label, confirmLabel, onConfirm, className, small, icon }) {
  const [arm, setArm] = useState(false);
  useEffect(() => { if (!arm) return; const t = setTimeout(() => setArm(false), 4000); return () => clearTimeout(t); }, [arm]);
  if (arm) {
    return html`<span class="row tight">
      <button class=${'btn danger solid ' + (small ? 'sm' : '')} onClick=${() => { setArm(false); onConfirm(); }}>${confirmLabel || '삭제'}</button>
      <button class=${'btn ghost ' + (small ? 'sm' : '')} onClick=${() => setArm(false)}>취소</button>
    </span>`;
  }
  return html`<button class=${'btn ' + (className || 'ghost') + (small ? ' sm' : '')} onClick=${() => setArm(true)} aria-label=${label}>${icon ? html`<${Icon} name=${icon} />` : null}${icon && !className ? null : label}</button>`;
}

/* 파일 놓기 영역 */
function FileDrop({ onFiles, accept, title, sub, multiple }) {
  const [over, setOver] = useState(false);
  const inp = useRef(null);
  const take = (list) => { const files = Array.from(list || []); if (files.length) onFiles(files); };
  return html`<div class=${'drop' + (over ? ' over' : '')} role="button" tabindex="0"
      onClick=${() => inp.current && inp.current.click()}
      onKeyDown=${(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.current && inp.current.click(); } }}
      onDragOver=${(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave=${() => setOver(false)}
      onDrop=${(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); }}>
    <div class="ic"><${Icon} name="upload" size=${18} /></div>
    <div class="stack s8" style="gap:2px;min-width:0">
      <b>${title || '파일을 끌어다 놓거나 눌러서 선택'}</b>
      <span class="small muted">${sub || '엑셀 · PDF · 워드 · 이미지 · 텍스트'}</span>
    </div>
    <input ref=${inp} type="file" hidden multiple=${multiple !== false} accept=${accept || ''} onChange=${(e) => { take(e.target.files); e.target.value = ''; }} />
  </div>`;
}

function Modal({ title, onClose, children, footer }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  return html`<div class="scrim" onClick=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div class="modal" role="dialog" aria-modal="true" aria-label=${title}>
      <div class="panel-h"><h3 style="flex:1">${title}</h3><button class="btn ghost icon" aria-label="닫기" onClick=${onClose}><${Icon} name="x" /></button></div>
      <div class="panel-b">${children}</div>
      ${footer ? html`<div class="panel-f">${footer}</div>` : null}
    </div>
  </div>`;
}
