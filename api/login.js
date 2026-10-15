// POST: 공용 비밀번호 확인 → 쿠키 발급 / GET: 로그인 상태 / DELETE: 로그아웃
const { isAuthed, makeToken, setAuthCookie, safeEqual, send, readBody } = require('./_lib');

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') return send(res, 200, { authed: isAuthed(req), configured: !!process.env.APP_PASSWORD });
    if (req.method === 'DELETE') { setAuthCookie(res, ''); return send(res, 200, { ok: true }); }
    if (req.method !== 'POST') return send(res, 405, { error: 'method' });
    if (!process.env.APP_PASSWORD) return send(res, 500, { error: 'not_configured', message: 'APP_PASSWORD 환경변수가 설정되지 않았습니다' });
    const body = await readBody(req);
    await new Promise((r) => setTimeout(r, 400)); // 무차별 대입 완화
    if (!safeEqual(body.password || '', process.env.APP_PASSWORD)) return send(res, 401, { error: 'wrong_password' });
    setAuthCookie(res, makeToken());
    return send(res, 200, { ok: true });
  } catch (e) {
    return send(res, 500, { error: 'server', message: String(e.message || e) });
  }
};
