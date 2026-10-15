// POST { prompt, images: [{ media_type, data(base64) }] } → { json }
// Anthropic Messages API를 서버에서만 호출합니다 (키는 환경변수).
const { isAuthed, send, readBody } = require('./_lib');

function extractJson(text) {
  const t = String(text || '').trim();
  try { return JSON.parse(t); } catch (e) { /* 다음 */ }
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(t);
  if (fence) { try { return JSON.parse(fence[1]); } catch (e) { /* 다음 */ } }
  const a = t.search(/[[{]/);
  const b = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { /* 실패 */ } }
  return undefined;
}

module.exports = async (req, res) => {
  if (!isAuthed(req)) return send(res, 401, { code: 'unauthorized' });
  if (req.method !== 'POST') return send(res, 405, { code: 'method' });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return send(res, 503, { code: 'not_configured', message: 'ANTHROPIC_API_KEY 환경변수가 없습니다' });
  try {
    const body = await readBody(req);
    const prompt = String(body.prompt || '');
    if (!prompt) return send(res, 400, { code: 'invalid_request' });
    if (prompt.length > 400000) return send(res, 413, { code: 'prompt_too_large' });
    const images = Array.isArray(body.images) ? body.images.slice(0, 8) : [];
    const content = images
      .filter((im) => im && /^image\/(png|jpeg|webp|gif)$/.test(im.media_type) && typeof im.data === 'string')
      .map((im) => ({ type: 'image', source: { type: 'base64', media_type: im.media_type, data: im.data } }));
    content.push({ type: 'text', text: prompt + '\n\n반드시 JSON 값 하나만 출력하세요. 설명이나 코드 블록 표시는 쓰지 마세요.' });

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
        max_tokens: 16000,
        messages: [{ role: 'user', content }]
      })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const code = r.status === 429 || r.status === 529 ? 'rate_limited' : r.status === 413 ? 'prompt_too_large' : r.status === 400 ? 'invalid_request' : 'upstream_error';
      return send(res, r.status === 429 ? 429 : 502, { code, message: (j.error && j.error.message) || ('Anthropic ' + r.status) });
    }
    const text = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
    const json = extractJson(text);
    if (json === undefined) return send(res, 502, { code: 'invalid_json', text: text.slice(0, 2000), truncated: j.stop_reason === 'max_tokens' });
    return send(res, 200, { json, usage: j.usage || null });
  } catch (e) {
    return send(res, 500, { code: 'upstream_error', message: String((e && e.message) || e) });
  }
};

