/* ===== 파일 읽기 · AI 정리 ===== */
const AI = {};

AI.MAX_TEXT = 120000;

AI.errText = function (e) {
  const code = e && e.code;
  const M = {
    not_granted: 'AI 사용이 허용되지 않았습니다.',
    not_configured: 'AI 키가 아직 설정되지 않았습니다. Vercel 환경변수 ANTHROPIC_API_KEY를 넣어 주세요.',
    unauthorized: '로그인이 필요합니다. 새로 고친 뒤 비밀번호를 입력해 주세요.',
    sampling_disabled: '이 계정에서는 AI 기능을 쓸 수 없습니다. 표에 직접 입력해 주세요.',
    not_declared: 'AI 기능이 꺼져 있습니다.',
    capability_disabled: '이 화면에서는 AI 기능을 쓸 수 없습니다.',
    capability_removed: '앱을 새로 고친 뒤 다시 시도해 주세요.',
    rate_limited: '요청이 몰려 있습니다. 잠시 후 다시 눌러 주세요.',
    prompt_too_large: '내용이 너무 깁니다. 필요한 부분만 남기고 다시 시도해 주세요.',
    invalid_json: 'AI 응답을 표로 바꾸지 못했습니다. 한 번 더 눌러 주세요.',
    image_rejected: '이미지를 읽을 수 없습니다. 다른 파일(또는 텍스트)로 시도해 주세요.',
    images_unavailable: '이 화면에서는 이미지를 보낼 수 없습니다. 내용을 텍스트로 붙여넣어 주세요.',
    refused: 'AI가 이 내용을 처리하지 않았습니다. 원문을 확인해 주세요.',
    session_expired: '로그인이 만료되었습니다. 새로 고친 뒤 비밀번호를 다시 입력해 주세요.',
    empty_completion: 'AI가 결과를 만들지 못했습니다. 내용을 줄여 다시 시도해 주세요.',
    cancelled: '중지했습니다.',
    upstream_error: '일시적인 오류입니다. 다시 눌러 주세요.'
  };
  if (code && M[code]) return M[code];
  if (e && e.message && !code) return e.message;
  return M.upstream_error;
};

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

AI.extractFile = async function (file, opts) {
  const name = file.name || '파일';
  const ext = (name.split('.').pop() || '').toLowerCase();
  const maxImages = (opts && opts.maxImages) || 0;
  const out = { name: name, kind: 'text', text: '', images: [], note: '' };
  if (['xlsx', 'xlsm', 'xls', 'csv', 'ods'].includes(ext)) {
    await loadLib('xlsx');
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
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

AI.collectSources = function (raw, files) {
  const texts = [];
  if (str(raw)) texts.push('[붙여넣은 내용]\n' + str(raw));
  (files || []).forEach((f) => { if (f.status === 'ready' && f.text) texts.push('[첨부: ' + f.name + ']\n' + f.text); });
  let text = texts.join('\n\n');
  if (text.length > AI.MAX_TEXT) text = text.slice(0, AI.MAX_TEXT) + '\n…(이하 생략)';
  const images = [];
  (files || []).forEach((f) => { if (f.status === 'ready') (f.images || []).forEach((b) => images.push(b)); });
  return { text: text, images: images };
};

/* ---------- 프롬프트 ---------- */
AI.requestPrompt = function (text, imageCount, today) {
  return [
    '당신은 IT 장비·솔루션 유통사(유니포인트)의 견적 담당자를 돕습니다.',
    '아래 [고객 요청 원문]은 메일·메신저·엑셀·PDF 등에서 가져온 것이라 서식이 제각각입니다. 매입처(공급사)에 견적을 요청할 수 있도록 표준 품목표로 정리해 주세요.',
    imageCount ? '함께 보낸 이미지 ' + imageCount + '장도 고객 요청 원문입니다.' : '',
    '',
    '규칙',
    '1. 원문에 있는 내용만 씁니다. 추측해서 채우지 말고 모르는 값은 "" 또는 null로 둡니다.',
    '2. 품목은 한 줄에 하나. 여러 품목이 한 문장에 섞여 있으면 나눕니다. 단, 서버·PC·스토리지처럼 한 장비를 이루는 구성 요소(CPU, 메모리, 디스크, GPU, NIC, 전원 등)는 따로 나누지 말고 그 장비의 spec에 넣습니다.',
    '3. name: 짧은 품목명 (예: "GPU 서버", "노트북", "27인치 모니터", "L2 스위치").',
    '4. spec: 요구 사양. 구성 요소별로 한 줄씩 "항목: 내용" 형식 (예: "GPU: NVIDIA RTX Pro 6000 × 4"). 원문의 수치·모델명은 그대로 살립니다. 여러 줄은 \\n으로 구분합니다.',
    '5. maker / model: 원문에 제조사·모델명이 명시된 경우만.',
    '6. qty: 숫자(원문에 없으면 null). unit: 대, 개, EA, 식, 세트, 본, 박스, 롤, 년, copy 등 원문 단위(없으면 "EA").',
    '7. note: 품목별 특이사항(동등품 허용 여부, 무상유지보수 기간, 색상, 분할 납품 등).',
    '8. conditions: dueDate(납기 — 날짜가 분명하면 YYYY-MM-DD, 아니면 원문 그대로), deliveryPlace(납품 장소), install(설치·구성·이전 등 작업 요구), other(결제·입찰·제출 서류·예산 등 기타).',
    '9. questions: 매입처에 요청하기 전에 고객에게 확인할 점(수량 누락, "고사양"처럼 모호한 사양, 동등품 허용 여부, 납기 불명 등)을 구체적인 질문 문장으로. 없으면 [].',
    '10. customer: 원문에서 드러나는 고객사·담당자·연락처·이메일. title: 이 견적 건의 짧은 이름(예: "AI GPU서버 도입").',
    '',
    '오늘 날짜: ' + today,
    '',
    '출력: 아래 형식의 JSON 하나만 출력합니다.',
    '{"title":"","customer":{"company":"","contact":"","phone":"","email":""},"items":[{"name":"","spec":"","maker":"","model":"","qty":null,"unit":"EA","note":""}],"conditions":{"dueDate":"","deliveryPlace":"","install":"","other":""},"questions":[]}',
    '',
    '[고객 요청 원문]',
    text || '(텍스트 없음 — 이미지 참고)'
  ].filter((x) => x !== null).join('\n');
};

AI.vendorPrompt = function (project, text, imageCount, today) {
  const items = (project.items || []).map((it, i) => [i + 1, it.name || '', String(it.spec || '').replace(/\n/g, ' / '), [it.maker, it.model].filter(Boolean).join(' '), it.qty ?? '', it.unit || '', it.note || ''].join(' | '));
  return [
    '당신은 IT 장비 유통사(유니포인트)의 구매 담당자를 돕습니다.',
    '[매입 견적 원문]은 매입처가 보낸 견적서(엑셀·PDF·메일 본문 등)이고 서식이 매번 다릅니다. 견적 내용을 구조화하고, [요청 품목]과 하나씩 대응시킨 뒤, 요청과 달라진 점을 정리해 주세요.',
    imageCount ? '함께 보낸 이미지 ' + imageCount + '장도 매입 견적 원문입니다.' : '',
    '',
    '규칙',
    '1. 견적서에 적힌 값만 씁니다. 숫자를 새로 계산하지 마세요(검산은 앱이 합니다). 쉼표·통화기호는 빼고 숫자로 적습니다.',
    '2. items: 견적서의 판매 단위 행마다 하나. 소계·합계·부가세 행은 품목이 아닙니다. 배송비·설치비처럼 금액이 붙은 별도 비용 행은 품목으로 넣습니다.',
    '   - 서버처럼 하나의 모델 아래 파트 번호 목록이 붙은 구성은 하나의 item으로 묶고, 파트 목록은 parts에 넣습니다.',
    '   - model: 제품 모델명(예: "ThinkSystem SR650 V4"). name: 견적서의 품목명·구성명. summary: 구성 요약 한 줄.',
    '   - qty, unit, listPrice(소비자가·정가, 없으면 null), unitPrice(제안 단가·공급 단가), amount(그 행의 금액 합계).',
    '   - parts: [{"partNo":"","desc":"","qty":1}] — 견적서의 파트 목록 그대로(최대 40개, 없으면 []).',
    '   - specs: 고객용 견적서에 넣을 주요 사양 요약. 구성 요소별 한 줄 {"cat","detail","spec"}.',
    '     cat: CPU, MEMORY, DISK, GPU, NIC, RAID, POWER, OS, WARRANTY 같은 대문자 분류(같은 분류가 이어지면 두 번째 줄부터 "").',
    '     detail: 제조사·모델·용량을 짧게. spec: 총량 또는 수량(예: "32Core", "256GB", "2EA").',
    '     예) [{"cat":"CPU","detail":"Intel Xeon 6517P 16C 3.2GHz * 2 CPU","spec":"32Core"},{"cat":"MEMORY","detail":"DDR5 32GB * 8EA","spec":"256GB"},{"cat":"DISK","detail":"SATA SSD 480GB","spec":"2EA"},{"cat":"","detail":"SAS HDD 2.4TB","spec":"2EA"},{"cat":"NIC","detail":"Broadcom 5719 1GbE 4-Port","spec":"2EA"},{"cat":"POWER","detail":"2000W Titanium Hot-Swap","spec":"2EA"},{"cat":"GPU","detail":"NVIDIA RTX 6000 Ada 48GB","spec":"2EA"}]',
    '     구성 요소가 없는 단순 품목은 [].',
    '   - reqNo: 대응하는 [요청 품목] 번호. 대응하는 것이 없으면 null.',
    '   - match: "exact"(요청과 같은 제품·사양) | "alternative"(다른 모델·동등품 제안) | "partial"(일부 사양·수량이 다름) | "extra"(요청에 없는 추가 항목).',
    '   - matchNote: match가 exact가 아니면 무엇이 다른지 한 문장. note: 견적서에 적힌 그 품목의 비고.',
    '3. vat: 단가·금액이 부가세 포함이면 "included", 별도면 "excluded", 판단할 수 없으면 "unknown". ("VAT 별도", "부가세 포함" 같은 문구와 합계 구조로 판단)',
    '4. totals: 견적서에 적힌 공급가액 합계(supply), 부가세(vat), 총액(total). 없으면 null.',
    '5. terms: validUntil(유효기간 — 날짜면 YYYY-MM-DD, "견적일로부터 1주"처럼 기간이면 원문 그대로), warranty(무상 유지보수·보증), delivery(납기), payment(결제 조건), shipping(배송·설치비 포함 여부), note(기타 특이사항).',
    '6. deviations: 요청 사양과 달라진 점을 고객 견적서 주석에 쓸 수 있게 정리. [{"reqNo":1,"title":"","reason":""}]',
    '   title 예: "GPU 모델 변경 (RTX Pro 6000 → RTX 6000 Ada)", "GPU 장착 수량 조정 (4ea → 2ea)".',
    '   reason: 견적서·메일에 사유가 적혀 있으면 요약해서, 없으면 "" (지어내지 마세요).',
    '7. vendor: 견적서를 보낸 공급사(상호, 담당자, 전화, 이메일). "OO 귀중"처럼 수신처로 적힌 회사는 공급사가 아닙니다.',
    '8. quoteNo, quoteDate(YYYY-MM-DD): 견적서 번호와 견적일자.',
    '',
    '오늘 날짜: ' + today,
    '',
    '출력: 아래 형식의 JSON 하나만 출력합니다.',
    '{"vendor":{"name":"","contact":"","phone":"","email":""},"quoteNo":"","quoteDate":"","vat":"excluded","items":[{"reqNo":1,"model":"","name":"","summary":"","qty":1,"unit":"","listPrice":null,"unitPrice":0,"amount":0,"parts":[],"specs":[],"note":"","match":"exact","matchNote":""}],"totals":{"supply":null,"vat":null,"total":null},"terms":{"validUntil":"","warranty":"","delivery":"","payment":"","shipping":"","note":""},"deviations":[]}',
    '',
    '[요청 품목]',
    'No | 품목 | 요구 사양 | 제조사/모델 | 수량 | 단위 | 비고',
    items.length ? items.join('\n') : '(요청 품목 없음 — 견적 내용만 구조화)',
    '',
    '[매입 견적 원문]',
    text || '(텍스트 없음 — 이미지 참고)'
  ].join('\n');
};

/* ---------- AI 호출 ---------- */
AI.call = async function (prompt, images, signal) {
  const opts = { signal: signal, modelTier: 'default' };
  if (images && images.length) {
    const max = (RT.imageLimits && RT.imageLimits.maxCount) || 0;
    if (!max) { const e = { code: 'images_unavailable' }; throw e; }
    opts.images = images.slice(0, max);
  }
  return RT.sample.json(prompt, opts);
};

/* 이미지 → JPEG base64 (긴 변 1568px 이하) */
async function blobToJpegB64(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => { const im = new Image(); im.onload = () => resolve(im); im.onerror = reject; im.src = url; });
    const s = Math.min(1, 1568 / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(img.naturalWidth * s)); cv.height = Math.max(1, Math.round(img.naturalHeight * s));
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/jpeg', 0.88).split(',')[1];
  } finally { URL.revokeObjectURL(url); }
}

/* 서버(/api/ai) 방식의 AI 호출 — Claude 앱 밖에서 쓰는 기본 경로 */
AI.serverSample = {
  async json(prompt, opts) {
    opts = opts || {};
    const images = [];
    for (const b of (opts.images || [])) images.push({ media_type: 'image/jpeg', data: await blobToJpegB64(b) });
    let r;
    try {
      r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ prompt: prompt, images: images }), signal: opts.signal });
    } catch (e) {
      if (e && e.name === 'AbortError') throw { code: 'cancelled' };
      throw { code: 'upstream_error', message: '서버에 연결하지 못했습니다' };
    }
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { if (RT.onUnauthorized) RT.onUnauthorized(); throw { code: 'session_expired' }; }
    if (!r.ok) throw { code: j.code || 'upstream_error', message: j.message, text: j.text };
    return j.json;
  },
  async limits() { return { maxPromptBytes: 400000, images: { maxCount: 6, maxInputBytes: 20000000, mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] } }; }
};

AI.normalizeRequest = async function (src, signal) {
  const res = await AI.call(AI.requestPrompt(src.text, src.images.length, L.today()), src.images, signal);
  if (!res || typeof res !== 'object') throw { code: 'invalid_json' };
  return {
    title: str(res.title),
    customer: { company: str(res.customer && res.customer.company), contact: str(res.customer && res.customer.contact), phone: str(res.customer && res.customer.phone), email: str(res.customer && res.customer.email) },
    items: arr(res.items).map((x) => ({ id: L.uid('r'), name: str(x.name), spec: str(x.spec).replace(/\\n/g, '\n'), maker: str(x.maker), model: str(x.model), qty: L.num(x.qty), unit: str(x.unit) || 'EA', note: str(x.note) })).filter((x) => x.name || x.spec),
    conditions: { dueDate: str(res.conditions && res.conditions.dueDate), deliveryPlace: str(res.conditions && res.conditions.deliveryPlace), install: str(res.conditions && res.conditions.install), other: str(res.conditions && res.conditions.other) },
    questions: arr(res.questions).map(str).filter(Boolean).map((t) => ({ id: L.uid('q'), text: t, done: false }))
  };
};

AI.quoteFromResult = function (res, project) {
  const items = project.items || [];
  const reqId = (no) => { const k = L.num(no); return k && items[k - 1] ? items[k - 1].id : null; };
  const M = ['exact', 'alternative', 'partial', 'extra'];
  const qItems = arr(res.items).map((x) => {
    const rid = reqId(x.reqNo);
    return {
      id: L.uid('qi'),
      reqItemId: rid,
      model: str(x.model), name: str(x.name), summary: str(x.summary),
      qty: L.num(x.qty), unit: str(x.unit),
      listPrice: L.num(x.listPrice), unitPrice: L.num(x.unitPrice), amount: L.num(x.amount),
      parts: arr(x.parts).slice(0, 80).map((p) => ({ partNo: str(p.partNo), desc: str(p.desc), qty: L.num(p.qty) })).filter((p) => p.partNo || p.desc),
      specs: arr(x.specs).map((s) => ({ cat: str(s.cat), detail: str(s.detail), spec: str(s.spec) })).filter((s) => s.cat || s.detail || s.spec),
      note: str(x.note),
      match: M.includes(x.match) ? (rid ? x.match : 'extra') : (rid ? 'partial' : 'extra'),
      matchNote: str(x.matchNote)
    };
  }).filter((q) => q.model || q.name || q.unitPrice !== null || q.amount !== null);
  const t = res.totals || {};
  const tm = res.terms || {};
  return {
    id: L.uid('qt'),
    vendorId: null,
    vendorName: str(res.vendor && res.vendor.name),
    vendorContact: { contact: str(res.vendor && res.vendor.contact), phone: str(res.vendor && res.vendor.phone), email: str(res.vendor && res.vendor.email) },
    receivedAt: L.today(),
    quoteNo: str(res.quoteNo),
    quoteDate: L.parseYmd(res.quoteDate) ? L.ymd(L.parseYmd(res.quoteDate)) : str(res.quoteDate),
    vat: ['included', 'excluded', 'unknown'].includes(res.vat) ? res.vat : 'unknown',
    items: qItems,
    totals: { supply: L.num(t.supply), vat: L.num(t.vat), total: L.num(t.total) },
    terms: { validUntil: str(tm.validUntil), warranty: str(tm.warranty), delivery: str(tm.delivery), payment: str(tm.payment), shipping: str(tm.shipping), note: str(tm.note) },
    deviations: arr(res.deviations).map((d) => ({ id: L.uid('dv'), reqItemId: reqId(d.reqNo), title: str(d.title), reason: str(d.reason) })).filter((d) => d.title)
  };
};

AI.parseVendorQuote = async function (project, src, signal) {
  const res = await AI.call(AI.vendorPrompt(project, src.text, src.images.length, L.today()), src.images, signal);
  if (!res || typeof res !== 'object') throw { code: 'invalid_json' };
  return AI.quoteFromResult(res, project);
};
