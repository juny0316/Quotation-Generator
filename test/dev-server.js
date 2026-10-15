// 로컬 테스트 서버: public/ 정적 파일 + api/ 함수. Supabase·Anthropic은 메모리/모의 응답.
const http = require('http');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ROOT = path.join(__dirname, '..');

process.env.APP_PASSWORD = process.env.APP_PASSWORD || 'test-pass';
process.env.SUPABASE_URL = 'http://mock';
process.env.SUPABASE_SECRET_KEY = 'mock-secret';
process.env.ANTHROPIC_API_KEY = 'mock-key';

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
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...a) { if (req === '@supabase/supabase-js') return req; return origResolve.call(this, req, ...a); };
require.cache['@supabase/supabase-js'] = { id: '@supabase/supabase-js', filename: '@supabase/supabase-js', loaded: true, exports: { createClient: () => ({ from: () => q() }) } };

// ---- Anthropic 모의 ----
const REQ = { title: 'AI GPU서버 도입', customer: { company: '홍길동손해보험', contact: '김과장', phone: '02-123-4567', email: 'kim@hong.co.kr' },
  items: [{ name: 'GPU 서버', spec: 'GPU: NVIDIA RTX Pro 6000 × 4\nCPU: 16코어 이상 × 2\n메모리: 256GB\n디스크: SSD 480GB × 2, HDD 2.4TB × 2\nNIC: 1GbE 4포트 × 2\n전원 이중화', maker: 'Lenovo', model: '', qty: 2, unit: '대', note: '무상유지보수 3년' }],
  conditions: { dueDate: '2026-11-30', deliveryPlace: '고객사 전산실', install: '랙 설치·OS 구성', other: '' }, questions: ['GPU 동등품(RTX 6000 Ada) 허용 여부 확인'] };
const VQ = { vendor: { name: '에이테크', contact: '박대리', phone: '', email: 'park@atech.co.kr' }, quoteNo: 'AT-2610-11', quoteDate: '2026-10-15', vat: 'excluded',
  items: [{ reqNo: 1, model: 'ThinkSystem SR650 V4', name: 'GPU서버_RTX6000Ada_2ea', summary: 'SR650 V4 / 6517P*2 / 256GB', qty: 2, unit: '대', listPrice: 323382402, unitPrice: 65500000, amount: 131000000,
    parts: [{ partNo: '7DGDCTO1WW', desc: 'ThinkSystem SR650 V4-3yr Base Warranty', qty: 1 }, { partNo: 'C2DP', desc: 'ThinkSystem NVIDIA RTX 6000 Ada 48GB PCIe Active GPU', qty: 2 }],
    specs: [{ cat: 'CPU', detail: 'Intel Xeon 6517P 16C 3.2GHz * 2 CPU', spec: '32Core' }, { cat: 'MEMORY', detail: 'DDR5 32GB * 8EA', spec: '256GB' }, { cat: 'GPU', detail: 'NVIDIA RTX 6000 Ada 48GB', spec: '2EA' }],
    note: '', match: 'partial', matchNote: 'GPU 모델·수량 변경' }],
  totals: { supply: 131000000, vat: 13100000, total: 144100000 }, terms: { validUntil: '견적일로부터 1주', warranty: '제조사 조건', delivery: '발주 후 4주', payment: '계산서 발행 후 90일', shipping: '', note: '' },
  deviations: [{ reqNo: 1, title: 'GPU 모델 변경 (RTX Pro 6000 → RTX 6000 Ada)', reason: "'RTX Pro 6000'은 제조사(Lenovo) 미지원 라인업" }] };
global.__prompts = [];
const realFetch = global.fetch;
global.fetch = async (url, init) => {
  if (String(url).startsWith('https://api.anthropic.com')) {
    const body = JSON.parse(init.body);
    const text = body.messages[0].content.filter((c) => c.type === 'text').map((c) => c.text).join('');
    global.__prompts.push(text);
    const out = text.includes('[매입 견적 원문]') ? VQ : REQ;
    await new Promise((r) => setTimeout(r, 300));
    return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(out) }], stop_reason: 'end_turn', usage: {} }), { status: 200 });
  }
  return realFetch(url, init);
};

const handlers = { login: require('../api/login.js'), docs: require('../api/docs.js'), ai: require('../api/ai.js') };
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname === '/__prompts') { res.end(JSON.stringify(global.__prompts.map((p) => p.length + ':' + (p.includes('7DGDCTO1WW') ? 'HAS_PART' : '-')))); return; }
  const m = /^\/api\/(\w+)$/.exec(u.pathname);
  if (m && handlers[m[1]]) { req.query = Object.fromEntries(u.searchParams); return handlers[m[1]](req, res); }
  const f = path.join(ROOT, 'public', u.pathname === '/' ? 'index.html' : u.pathname);
  if (fs.existsSync(f) && fs.statSync(f).isFile()) { res.setHeader('Content-Type', f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream'); fs.createReadStream(f).pipe(res); }
  else { res.statusCode = 404; res.end('not found'); }
});
server.listen(process.env.PORT || 3999, () => console.log('dev server on', server.address().port));
