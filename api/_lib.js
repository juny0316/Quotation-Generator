// 공용 유틸: 인증 쿠키, Supabase 클라이언트, 요청 본문 읽기
const crypto = require('crypto');

const COOKIE = 'qg_auth';
const MAX_AGE = 60 * 60 * 24 * 30; // 30일

function authKey() {
  const pw = process.env.APP_PASSWORD || '';
  const sk = process.env.SUPABASE_SECRET_KEY || '';
  return crypto.createHash('sha256').update('qg|' + pw + '|' + sk).digest();
}

function sign(exp) {
  return crypto.createHmac('sha256', authKey()).update(String(exp)).digest('base64url');
}

function makeToken() {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  return exp + '.' + sign(exp);
}

function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function isAuthed(req) {
  if (!process.env.APP_PASSWORD) return false;
  const t = parseCookies(req)[COOKIE];
  if (!t) return false;
  const [exp, sig] = t.split('.');
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  const a = Buffer.from(sig), b = Buffer.from(sign(exp));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function setAuthCookie(res, token) {
  const secure = process.env.VERCEL ? '; Secure' : '';
  res.setHeader('Set-Cookie', COOKIE + '=' + (token || '') + '; Path=/; HttpOnly; SameSite=Lax' + secure + '; Max-Age=' + (token ? MAX_AGE : 0));
}

function safeEqual(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') return req.body ? JSON.parse(req.body) : {};
    if (Buffer.isBuffer(req.body)) return req.body.length ? JSON.parse(req.body.toString('utf8')) : {};
    return req.body;
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const s = Buffer.concat(chunks).toString('utf8');
  return s ? JSON.parse(s) : {};
}

let _sb = null;
function supabase() {
  if (_sb) return _sb;
  const { createClient } = require('@supabase/supabase-js');
  // 붙여넣을 때 섞인 공백·줄바꿈은 헤더 오류를 내므로 잘라 낸다
  const url = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = (process.env.SUPABASE_SECRET_KEY || '').trim();
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SECRET_KEY 환경변수가 없습니다');
  _sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _sb;
}

// 문서 경로: 짝수 개 세그먼트 (예: projects/p1, settings/main)
const SEG = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;
function checkPath(p, wantDoc) {
  if (typeof p !== 'string' || p.length > 1000) return false;
  const s = p.split('/');
  if (s.some((x) => !SEG.test(x) || x === '.' || x === '..')) return false;
  return wantDoc ? s.length % 2 === 0 : s.length % 2 === 1;
}

module.exports = { isAuthed, makeToken, setAuthCookie, safeEqual, send, readBody, supabase, checkPath };
