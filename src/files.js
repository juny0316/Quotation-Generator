/* ===== 첨부파일 읽기 (미리보기용) ===== */
const Files = {};

Files.MAX_TEXT = 120000;
Files.MAX_IMAGES = 6;

/* ---------- 파일 → 텍스트/이미지 ---------- */
function decodeQP(s) { return s.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (m, h) => String.fromCharCode(parseInt(h, 16))); }
function bytesFromBinStr(s) { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b; }
function decodeCharset(bytes, cs) { try { return new TextDecoder(cs || 'utf-8').decode(bytes); } catch (e) { return new TextDecoder('utf-8').decode(bytes); } }
function emlToText(raw) {
  const parts = [];
  const walk = (chunk) => {
    const idx = chunk.search(/\r?\n\r?\n/);
    const head = idx >= 0 ? chunk.slice(0, idx) : chunk;
    const body = idx >= 0 ? chunk.slice(idx).replace(/^\r?\n\r?\n/, '') : '';
    const ct = (/content-type:\s*([^;\r\n]+)/i.exec(head) || [])[1] || 'text/plain';
    const bnd = (/boundary="?([^";\r\n]+)"?/i.exec(head) || [])[1];
    if (/multipart/i.test(ct) && bnd) {
      body.split('--' + bnd).slice(1).forEach((p) => { if (!/^--/.test(p)) walk(p.replace(/^\r?\n/, '')); });
      return;
    }
    if (!/text\/(plain|html)/i.test(ct)) return;
    const cte = ((/content-transfer-encoding:\s*([^\s;]+)/i.exec(head) || [])[1] || '').toLowerCase();
    const cs = (/charset="?([^";\s]+)"?/i.exec(head) || [])[1] || 'utf-8';
    let bytes;
    if (cte === 'base64') { try { bytes = bytesFromBinStr(atob(body.replace(/\s+/g, ''))); } catch (e) { bytes = bytesFromBinStr(body); } }
    else if (cte === 'quoted-printable') bytes = bytesFromBinStr(decodeQP(body));
    else bytes = bytesFromBinStr(body);
    let text = decodeCharset(bytes, cs);
    if (/html/i.test(ct)) text = htmlToText(text);
    parts.push({ html: /html/i.test(ct), text: text });
  };
  walk(raw);
  const plain = parts.find((p) => !p.html) || parts[0];
  const subj = (/^subject:\s*(.*)$/im.exec(raw) || [])[1] || '';
  const from = (/^from:\s*(.*)$/im.exec(raw) || [])[1] || '';
  return [subj ? '제목: ' + decodeMimeWords(subj) : '', from ? '보낸 사람: ' + decodeMimeWords(from) : '', plain ? plain.text : raw].filter(Boolean).join('\n');
}
function decodeMimeWords(s) {
  return s.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (m, cs, enc, t) => {
    try {
      const bytes = enc.toUpperCase() === 'B' ? bytesFromBinStr(atob(t)) : bytesFromBinStr(decodeQP(t.replace(/_/g, ' ')));
      return decodeCharset(bytes, cs);
    } catch (e) { return m; }
  });
}
function htmlToText(h0) {
  try {
    const doc = new DOMParser().parseFromString(h0, 'text/html');
    doc.querySelectorAll('script,style').forEach((n) => n.remove());
    doc.querySelectorAll('br').forEach((n) => n.replaceWith('\n'));
    doc.querySelectorAll('p,div,tr,li,h1,h2,h3,h4').forEach((n) => n.append('\n'));
    doc.querySelectorAll('td,th').forEach((n) => n.append(' | '));
    return (doc.body.textContent || '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  } catch (e) { return h0.replace(/<[^>]+>/g, ' '); }
}

Files.extractFile = async function (file, opts) {
  const name = file.name || '파일';
  const ext = (name.split('.').pop() || '').toLowerCase();
  const maxImages = (opts && opts.maxImages) || Files.MAX_IMAGES;
  const out = { name: name, kind: 'text', text: '', images: [], note: '' };
  if (['xlsx', 'xlsm', 'xls', 'csv', 'ods'].includes(ext)) {
    await loadLib('xlsx');
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    // 미리보기 표: 시트별 행(빈 행 제외, 최대 300행 · 30열)
    out.sheets = wb.SheetNames.map((sn) => {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, blankrows: false, raw: false, defval: '', dateNF: 'yyyy-mm-dd' })
        .map((r) => r.slice(0, 30).map((v) => String(v).trim()))
        .filter((r) => r.some(Boolean));
      const width = rows.reduce((m, r) => { let k = r.length; while (k && !r[k - 1]) k--; return Math.max(m, k); }, 0);
      let lead = width;
      rows.forEach((r) => { const k = r.findIndex(Boolean); if (k >= 0 && k < lead) lead = k; });
      return { name: sn, rows: rows.slice(0, 300).map((r) => r.slice(lead, width)) };
    });
    out.text = wb.SheetNames.map((sn) => {
      const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sn], { blankrows: false, dateNF: 'yyyy-mm-dd' });
      const lines = csv.split('\n').map((l) => l.replace(/,+$/, '')).filter((l) => l.replace(/[,\s"]/g, ''));
      return '### 시트: ' + sn + '\n' + lines.join('\n');
    }).join('\n\n');
    out.note = '엑셀 ' + wb.SheetNames.length + '개 시트';
    return out;
  }
  if (ext === 'pdf') {
    await loadLib('pdf');
    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjsLib.getDocument({ data: data, isEvalSupported: false }).promise;
    const n = Math.min(pdf.numPages, 30);
    const pages = [];
    for (let i = 1; i <= n; i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      let s = '';
      tc.items.forEach((it) => { s += it.str + (it.hasEOL ? '\n' : ' '); });
      pages.push(s.replace(/[ \t]+/g, ' ').trim());
    }
    const textLen = pages.join('').replace(/\s/g, '').length;
    if (textLen >= 40 * n || !maxImages) {
      out.text = pages.map((p, i) => '--- ' + (i + 1) + '쪽 ---\n' + p).join('\n');
      out.note = 'PDF ' + pdf.numPages + '쪽' + (textLen < 40 * n ? ' (글자가 거의 없음 — 스캔본일 수 있음)' : '');
    } else {
      out.kind = 'images';
      for (let i = 1; i <= Math.min(n, maxImages); i++) {
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 1.7 });
        const cv = document.createElement('canvas');
        cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
        await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
        const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
        if (blob) out.images.push(blob);
      }
      out.note = '스캔 PDF · 이미지 ' + out.images.length + '장으로 읽음';
    }
    return out;
  }
  if (ext === 'docx') {
    await loadLib('mammoth');
    const r = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    out.text = r.value || '';
    out.note = '워드 문서';
    return out;
  }
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext) || /^image\//.test(file.type || '')) {
    out.kind = 'images';
    out.images = [file];
    out.note = '이미지';
    return out;
  }
  if (ext === 'eml') { out.text = emlToText(await file.text()); out.note = '메일 파일'; return out; }
  if (['html', 'htm'].includes(ext)) { out.text = htmlToText(await file.text()); out.note = 'HTML'; return out; }
  if (['txt', 'md', 'json', 'tsv', 'log'].includes(ext) || /^text\//.test(file.type || '')) { out.text = await file.text(); out.note = '텍스트'; return out; }
  if (ext === 'msg') { out.kind = 'unsupported'; out.note = 'Outlook .msg 파일은 읽을 수 없습니다. 메일 본문을 복사해 붙여넣거나 [다른 이름으로 저장 → .eml/PDF]로 올려 주세요.'; return out; }
  if (['hwp', 'hwpx'].includes(ext)) { out.kind = 'unsupported'; out.note = '한글(HWP) 파일은 PDF로 저장해 올려 주세요.'; return out; }
  out.kind = 'unsupported';
  out.note = '이 형식(.' + ext + ')은 읽을 수 없습니다.';
  return out;
};

/* 붙여넣은 원문 + 읽은 첨부 텍스트를 한 덩어리로 (매입 견적 원본 보관용) */
Files.collectText = function (raw, files) {
  const texts = [];
  if (str(raw)) texts.push('[붙여넣은 내용]\n' + str(raw));
  (files || []).forEach((f) => { if (f.status === 'ready' && f.text) texts.push('[첨부: ' + f.name + ']\n' + f.text); });
  let text = texts.join('\n\n');
  if (text.length > Files.MAX_TEXT) text = text.slice(0, Files.MAX_TEXT) + '\n…(이하 생략)';
  return text;
};
