// 로컬 테스트 서버: public/ 정적 파일 + api/ 함수. 기본은 메모리 모의 DB, .env.local에 USE_REAL_SUPABASE=1이면 실제 Supabase.
const http = require('http');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ROOT = path.join(__dirname, '..');

// .env.local(커밋 안 됨)의 값을 읽는다. 이미 설정된 환경변수가 우선.
const envFile = path.join(ROOT, '.env.local');
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8').split(/\r?\n/).forEach((line) => {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && m[2] !== '' && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  });
}
const REAL_DB = process.env.USE_REAL_SUPABASE === '1';
process.env.APP_PASSWORD = process.env.APP_PASSWORD || 'test-pass';
if (!REAL_DB) {
  process.env.SUPABASE_URL = 'http://mock';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_mock';
}

// ---- Supabase 모의 ----
const table = new Map();
function q() {
  const st = { filters: [], order: null, limit: null, op: 'select', row: null };
  const run = () => {
    if (st.op === 'upsert') { table.set(st.row.path, JSON.parse(JSON.stringify(st.row))); return { data: null, error: null }; }
    let rows = Array.from(table.values()).filter((r) => st.filters.every(([k, v]) => r[k] === v));
    if (st.op === 'delete') { rows.forEach((r) => table.delete(r.path)); return { data: null, error: null }; }
    if (st.order) rows.sort((a, b) => (a[st.order.col] > b[st.order.col] ? 1 : -1) * (st.order.asc ? 1 : -1));
    if (st.limit) rows = rows.slice(0, st.limit);
    return { data: rows.map((r) => ({ path: r.path, data: r.data })), error: null };
  };
  const api = {
    select() { return api; }, eq(k, v) { st.filters.push([k, v]); return api; },
    order(col, o) { st.order = { col, asc: o.ascending }; return api; }, limit(n) { st.limit = n; return api; },
    maybeSingle() { const r = run(); return Promise.resolve({ data: r.data[0] || null, error: null }); },
    upsert(row) { st.op = 'upsert'; st.row = row; return api; }, delete() { st.op = 'delete'; return api; },
    then(res, rej) { return Promise.resolve(run()).then(res, rej); }
  };
  return api;
}
if (!REAL_DB) {
  const origResolve = Module._resolveFilename;
  Module._resolveFilename = function (req, ...a) { if (req === '@supabase/supabase-js') return req; return origResolve.call(this, req, ...a); };
  require.cache['@supabase/supabase-js'] = { id: '@supabase/supabase-js', filename: '@supabase/supabase-js', loaded: true, exports: { createClient: () => ({ from: () => q() }) } };
}

const handlers = { login: require('../api/login.js'), docs: require('../api/docs.js') };
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const m = /^\/api\/(\w+)$/.exec(u.pathname);
  if (m && handlers[m[1]]) { req.query = Object.fromEntries(u.searchParams); return handlers[m[1]](req, res); }
  const f = path.join(ROOT, 'public', u.pathname === '/' ? 'index.html' : u.pathname);
  if (fs.existsSync(f) && fs.statSync(f).isFile()) { res.setHeader('Content-Type', f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream'); fs.createReadStream(f).pipe(res); }
  else { res.statusCode = 404; res.end('not found'); }
});
server.listen(process.env.PORT || 3999, () => console.log('dev server on', server.address().port, REAL_DB ? '(실제 Supabase 연결)' : '(메모리 모의 DB)'));
