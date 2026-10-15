// 문서 저장소 API (Supabase public.docs 테이블)
// GET ?path=a/b         → { data } (없으면 null)
// GET ?collection=a     → { rows: [{id, ...data}] }
// PUT { path, data }    → 저장(덮어쓰기)
// DELETE ?path=a/b      → 삭제
const { isAuthed, send, readBody, supabase, checkPath } = require('./_lib');

const ORDER = { projects: { col: 'updated_at', asc: false, limit: 300 }, vendors: { col: 'path', asc: true, limit: 1000 } };

module.exports = async (req, res) => {
  if (!isAuthed(req)) return send(res, 401, { error: 'unauthorized' });
  try {
    const sb = supabase();
    const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
    if (req.method === 'GET') {
      if (q.path) {
        if (!checkPath(q.path, true)) return send(res, 400, { error: 'bad_path' });
        const { data, error } = await sb.from('docs').select('data').eq('path', q.path).maybeSingle();
        if (error) throw error;
        return send(res, 200, { data: data ? data.data : null });
      }
      if (q.collection) {
        if (!checkPath(q.collection, false)) return send(res, 400, { error: 'bad_collection' });
        const o = ORDER[q.collection] || { col: 'path', asc: true, limit: 1000 };
        const { data, error } = await sb.from('docs').select('path, data').eq('collection', q.collection).order(o.col, { ascending: o.asc }).limit(o.limit);
        if (error) throw error;
        return send(res, 200, { rows: data.map((r) => Object.assign({}, r.data, { id: r.path.split('/').pop() })) });
      }
      return send(res, 400, { error: 'missing_query' });
    }
    if (req.method === 'PUT') {
      const body = await readBody(req);
      if (!checkPath(body.path, true)) return send(res, 400, { error: 'bad_path' });
      if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) return send(res, 400, { error: 'bad_data' });
      const size = Buffer.byteLength(JSON.stringify(body.data));
      if (size > 1024 * 1024) return send(res, 413, { error: 'too_large' });
      const collection = body.path.split('/').slice(0, -1).join('/');
      const { error } = await sb.from('docs').upsert({ path: body.path, collection, data: body.data, updated_at: new Date().toISOString() });
      if (error) throw error;
      return send(res, 200, { ok: true });
    }
    if (req.method === 'DELETE') {
      if (!checkPath(q.path, true)) return send(res, 400, { error: 'bad_path' });
      const { error } = await sb.from('docs').delete().eq('path', q.path);
      if (error) throw error;
      return send(res, 200, { ok: true });
    }
    return send(res, 405, { error: 'method' });
  } catch (e) {
    return send(res, 500, { error: 'server', message: String((e && e.message) || e) });
  }
};
