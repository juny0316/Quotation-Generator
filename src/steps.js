/* ===== 6단계 화면 ===== */
const STEPS = [
  { n: 1, key: 'request', title: '고객 요청', sub: '원문 입력' },
  { n: 2, key: 'items', title: '요청 정리', sub: '매입처용 표준화' },
  { n: 3, key: 'rfq', title: '매입 요청', sub: 'Outlook 메일' },
  { n: 4, key: 'quotes', title: '매입 검토', sub: '일치 여부 확인' },
  { n: 5, key: 'sales', title: '매출 견적서', sub: '매입가 + GP' },
  { n: 6, key: 'cost', title: '원가분석표', sub: 'GP · GP%' }
];

function stepDone(p, n) {
  if (n === 1) return !!(str(p.request && p.request.raw) || (p.request && p.request.files && p.request.files.length) || (p.items || []).length);
  if (n === 2) return (p.items || []).length > 0;
  if (n === 3) return ((p.rfq && p.rfq.sent) || []).length > 0;
  if (n === 4) return (p.quotes || []).length > 0;
  if (n === 5) return ((p.sales && p.sales.lines) || []).length > 0;
  if (n === 6) return p.status === 'submitted' || p.status === 'won' || p.status === 'lost';
  return false;
}
function suggestStep(p) {
  if (((p.sales && p.sales.lines) || []).length) return 5;
  if ((p.quotes || []).length) return 4;
  if (((p.rfq && p.rfq.sent) || []).length || ((p.rfq && p.rfq.targets) || []).length) return 4;
  if ((p.items || []).length) return 3;
  return 1;
}

function StepNav({ prev, next, nextLabel, onPrev, onNext, extra, nextDisabled }) {
  return html`<div class="row" style="justify-content:space-between;margin-top:4px">
    <div class="row">${prev ? html`<button class="btn ghost" onClick=${onPrev}><${Icon} name="back" />${prev}</button>` : null}</div>
    <div class="row">${extra}${next ? html`<button class="btn primary" disabled=${nextDisabled} onClick=${onNext}>${nextLabel || next}<${Icon} name="next" /></button>` : null}</div>
  </div>`;
}

function fileInfo(f) {
  if (f.status === 'reading') return '읽는 중';
  if (f.status === 'error') return f.note || '읽지 못함';
  if (f.kind === 'images') return '이미지 ' + (f.images || []).length + '장';
  return L.fmt((f.text || '').length) + '자';
}

function FileChips({ files, onRemove, openId, onOpen }) {
  if (!files.length) return null;
  return html`<div class="files">${files.map((f) => {
    const canOpen = onOpen && f.status === 'ready';
    return html`<span key=${f.id || f.name} class=${'fchip' + (openId === f.id ? ' on' : '')} title=${f.note || ''}>
      ${f.status === 'reading' ? html`<span class="spin" style="width:12px;height:12px;color:var(--brand)"></span>` : html`<${Icon} name="file" size=${14} />`}
      ${canOpen ? html`<span class="nm link" role="button" tabindex="0" onClick=${() => onOpen(openId === f.id ? null : f.id)}
          onKeyDown=${(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(openId === f.id ? null : f.id); } }}>${f.name}</span>` : html`<span class="nm">${f.name}</span>`}
      <span class=${'xs ' + (f.status === 'error' ? 'gp-low' : 'faint')}>${fileInfo(f)}</span>
      ${onRemove ? html`<button aria-label=${f.name + ' 빼기'} onClick=${() => onRemove(f)}><${Icon} name="x" size=${13} /></button>` : null}
    </span>`;
  })}</div>`;
}

function SheetTables({ sheets }) {
  return sheets.map((sh, k) => html`<div key=${k} class="stack s8" style="margin-bottom:12px">
    ${sheets.length > 1 ? html`<b class="small">${sh.name}</b>` : null}
    <table class="tbl sheet"><tbody>${sh.rows.map((r, i) => html`<tr key=${i}>${r.map((v, j) => html`<td key=${j}>${v}</td>`)}</tr>`)}</tbody></table>
  </div>`);
}

/* 첨부 내용 보기: 엑셀·PDF·워드·메일은 읽은 글자, 이미지·스캔 PDF는 그림 */
function FilePreview({ file, onClose }) {
  const [urls, setUrls] = useState([]);
  useEffect(() => {
    const u = ((file && file.images) || []).map((b) => URL.createObjectURL(b));
    setUrls(u);
    return () => u.forEach((x) => URL.revokeObjectURL(x));
  }, [file]);
  if (!file) return null;
  return html`<div class="fpreview">
    <div class="fpreview-h"><${Icon} name="file" size=${14} /><b class="small" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${file.name}</b>
      <span class="xs faint">${file.note || ''}</span>
      ${file.text ? html`<button class="btn ghost sm" onClick=${() => copyText(file.text, '파일 내용')}><${Icon} name="copy" size=${13} />복사</button>` : null}
      <button class="btn ghost icon sm" aria-label="미리보기 닫기" onClick=${onClose}><${Icon} name="x" size=${14} /></button></div>
    <div class="fpreview-b">
      ${urls.map((u, i) => html`<img key=${i} src=${u} alt=${file.name + ' ' + (i + 1)} />`)}
      ${file.sheets && file.sheets.length ? html`<${SheetTables} sheets=${file.sheets} />` : file.text ? html`<pre>${file.text}</pre>` : null}
      ${!urls.length && !file.text ? html`<span class="small faint">보여줄 내용이 없습니다.</span>` : null}
    </div>
  </div>`;
}

function useFileReader() {
  const [files, setFiles] = useState([]);
  const add = async (list, onReady) => {
    for (const f of list) {
      const id = L.uid('f');
      setFiles((fs) => fs.concat([{ id: id, name: f.name || '붙여넣은 이미지', status: 'reading' }]));
      try {
        const r = await Files.extractFile(f);
        const status = r.kind === 'unsupported' ? 'error' : 'ready';
        const done = Object.assign({ id: id }, r, { status: status });
        if (status === 'ready' && onReady && onReady(done)) setFiles((fs) => fs.filter((x) => x.id !== id));
        else setFiles((fs) => fs.map((x) => (x.id === id ? done : x)));
      } catch (e) {
        setFiles((fs) => fs.map((x) => (x.id === id ? Object.assign({}, x, { status: 'error', note: '읽지 못했습니다' }) : x)));
        console.warn(e);
      }
    }
  };
  const remove = (f) => setFiles((fs) => fs.filter((x) => x !== f && x.id !== f.id));
  return { files: files, add: add, remove: remove, clear: () => setFiles([]) };
}

/* ===================== 1. 고객 요청 ===================== */
function StepRequest({ p, up, go }) {
  const fr = useFileReader();
  const [openId, setOpenId] = useState(null);
  const req = p.request || {};
  const saved = (req.files || []).map((f, i) => ({ id: 'saved' + i, idx: i, name: f.name, note: f.note, text: f.text, sheets: f.sheets, status: 'ready', kind: 'text', saved: true }));
  const shown = saved.concat(fr.files);
  const opened = shown.find((f) => f.id === openId) || null;
  const c = p.customer || {};
  const setC = (k, v) => up((x) => { x.customer = x.customer || {}; x.customer[k] = v; });

  // 글자로 읽힌 파일은 견적 건에 저장해 다음에도 볼 수 있게 한다(이미지는 이번 화면에서만).
  const keep = (f) => {
    if (!f.text) return false;
    up((x) => { x.request = Object.assign({}, x.request || {}); x.request.files = (x.request.files || []).concat([Object.assign({ name: f.name, note: f.note || '', text: String(f.text).slice(0, 30000) }, f.sheets ? { sheets: f.sheets } : {})]); });
    return true;
  };
  const addFiles = (list) => fr.add(list, keep);
  const removeFile = (f) => {
    if (openId === f.id) setOpenId(null);
    if (f.saved) up((x) => { x.request.files.splice(f.idx, 1); });
    else fr.remove(f);
  };

  return html`<div class="stack s16">
    <div class="grid2" style="grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);align-items:start">
      <section class="panel">
        <div class="panel-h"><h3>고객 요청 원문</h3><span class="sub">메일 본문, 메신저 대화, 엑셀 표 등 받은 그대로</span></div>
        <div class="panel-b stack">
          <textarea id="req-raw" class="textarea" rows="11" placeholder=${'예) 안녕하세요, AI 학습용 GPU 서버 2대 견적 부탁드립니다.\nGPU는 RTX Pro 6000 4장, 메모리 256GB, SSD 480GB 2개…'} value=${req.raw || ''}
            onInput=${(e) => up((x) => { x.request = Object.assign({}, x.request || {}, { raw: e.target.value }); })}
            onPaste=${(e) => { const fl = Array.from((e.clipboardData && e.clipboardData.files) || []); if (fl.length) { e.preventDefault(); addFiles(fl); } }}></textarea>
          <${FileDrop} onFiles=${addFiles} title="요청 파일 추가" sub="엑셀 · PDF · 워드 · 이미지 · .eml (스크린샷은 붙여넣기도 됩니다)" />
          <${FileChips} files=${shown} onRemove=${removeFile} openId=${openId} onOpen=${setOpenId} />
          ${shown.some((f) => f.status === 'ready') && !opened ? html`<div class="xs faint">파일 이름을 누르면 내용을 볼 수 있습니다. 이미지는 이 화면에서만 보이고 저장되지 않습니다.</div>` : null}
          <${FilePreview} file=${opened} onClose=${() => setOpenId(null)} />
        </div>
      </section>
      <section class="panel">
        <div class="panel-h"><h3>고객 정보</h3></div>
        <div class="panel-b stack">
          <${Field} label="건명"><input id="p-title" class="input" value=${p.title || ''} placeholder="예) AI GPU서버 도입" onInput=${(e) => up((x) => { x.title = e.target.value; })} /><//>
          <${Field} label="고객사"><input id="c-company" class="input" value=${c.company || ''} placeholder="예) 홍길동손해보험" onInput=${(e) => setC('company', e.target.value)} /><//>
          <div class="grid2">
            <${Field} label="담당자"><input id="c-contact" class="input" value=${c.contact || ''} onInput=${(e) => setC('contact', e.target.value)} /><//>
            <${Field} label="연락처"><input id="c-phone" class="input" value=${c.phone || ''} onInput=${(e) => setC('phone', e.target.value)} /><//>
          </div>
          <${Field} label="이메일"><input id="c-email" class="input" value=${c.email || ''} onInput=${(e) => setC('email', e.target.value)} /><//>
        </div>
      </section>
    </div>

    <${StepNav} next="요청 정리" nextLabel=${(p.items || []).length ? '정리된 품목 보기' : '품목표 입력하기'} onNext=${() => go(2)}
      extra=${(p.items || []).length ? null : html`<button class="btn" title="고객 요청 정리 없이 받은 매입 견적서로 바로 매출 견적서를 만듭니다" onClick=${() => go(4)}>매입 견적서로 바로 시작</button>`} />
  </div>`;
}

/* ===================== 2. 요청 정리 ===================== */
function ItemsTable({ p, up }) {
  const items = p.items || [];
  const setI = (i, k, v) => up((x) => { x.items[i][k] = v; });
  const move = (i, d) => up((x) => { const j = i + d; if (j < 0 || j >= x.items.length) return; const t = x.items[i]; x.items[i] = x.items[j]; x.items[j] = t; });
  const add = () => up((x) => { x.items = (x.items || []).concat([{ id: L.uid('r'), name: '', spec: '', maker: '', model: '', qty: 1, unit: 'EA', note: '' }]); });
  return html`<div class="stack s8">
    <div class="tbl-wrap"><table class="tbl" style="min-width:920px">
      <thead><tr><th class="center">#</th><th style="width:17%">품목</th><th>요구 사양</th><th style="width:16%">제조사 · 모델</th><th class="num" style="width:76px">수량</th><th style="width:72px">단위</th><th style="width:15%">비고</th><th style="width:96px"></th></tr></thead>
      <tbody>
        ${items.map((it, i) => html`<tr key=${it.id}>
          <td class="idx">${i + 1}</td>
          <td><input class="input" aria-label="품목" value=${it.name} placeholder="품목명" onInput=${(e) => setI(i, 'name', e.target.value)} /></td>
          <td><${AutoText} ariaLabel="요구 사양" value=${it.spec} placeholder="구성 요소별 한 줄씩 (예: GPU: RTX Pro 6000 × 4)" onInput=${(v) => setI(i, 'spec', v)} /></td>
          <td><div class="stack s8" style="gap:4px"><input class="input" aria-label="제조사" placeholder="제조사" value=${it.maker} onInput=${(e) => setI(i, 'maker', e.target.value)} /><input class="input" aria-label="모델" placeholder="모델" value=${it.model} onInput=${(e) => setI(i, 'model', e.target.value)} /></div></td>
          <td><${NumInput} ariaLabel="수량" value=${it.qty} onChange=${(v) => setI(i, 'qty', v)} /></td>
          <td><input class="input" aria-label="단위" value=${it.unit} onInput=${(e) => setI(i, 'unit', e.target.value)} /></td>
          <td><${AutoText} ariaLabel="비고" value=${it.note} onInput=${(v) => setI(i, 'note', v)} /></td>
          <td><div class="cell-actions">
            <button class="btn ghost icon sm" aria-label="위로" onClick=${() => move(i, -1)}><${Icon} name="up" size=${14} /></button>
            <button class="btn ghost icon sm" aria-label="아래로" onClick=${() => move(i, 1)}><${Icon} name="down" size=${14} /></button>
            <${ConfirmBtn} small icon="trash" label="품목 삭제" onConfirm=${() => up((x) => { x.items.splice(i, 1); })} />
          </div></td>
        </tr>`)}
        ${!items.length ? html`<tr><td colspan="8"><div class="empty" style="padding:24px"><b>아직 품목이 없습니다</b><span class="small">아래 [품목 추가] 버튼으로 고객 요청 품목을 한 줄씩 입력하세요.</span></div></td></tr>` : null}
      </tbody>
    </table></div>
    <div><button class="btn sm" onClick=${add}><${Icon} name="plus" size=${14} />품목 추가</button></div>
  </div>`;
}

/* 품목표를 입력하면서 옆에 띄워 보는 1단계 원문 · 첨부 */
function RequestSource({ p }) {
  const req = p.request || {};
  const files = (req.files || []).map((f, i) => ({ id: 'saved' + i, name: f.name, note: f.note, text: f.text, sheets: f.sheets, status: 'ready', kind: 'text' }));
  const [openId, setOpenId] = useState(null);
  if (!str(req.raw) && !files.length) return null;
  const opened = files.find((f) => f.id === openId) || null;
  return html`<details class="panel">
    <summary class="panel-h" style="cursor:pointer"><h3>고객 요청 원문 보기</h3><span class="sub">${[str(req.raw) ? '붙여넣은 내용' : '', files.length ? '첨부 ' + files.length + '개' : ''].filter(Boolean).join(' · ')}</span></summary>
    <div class="panel-b stack s8">
      ${str(req.raw) ? html`<div class="fpreview"><div class="fpreview-b"><pre>${req.raw}</pre></div></div>` : null}
      <${FileChips} files=${files} openId=${openId} onOpen=${setOpenId} />
      <${FilePreview} file=${opened} onClose=${() => setOpenId(null)} />
    </div>
  </details>`;
}

function StepItems({ p, up, settings, go }) {
  const cd = p.conditions || {};
  const qs = p.questions || [];
  const setCd = (k, v) => up((x) => { x.conditions = x.conditions || {}; x.conditions[k] = v; });
  const open = qs.filter((q) => !q.done);
  const rep = repOf(settings, p.repId);
  function copyAsk() {
    const c = p.customer || {};
    const lines = [
      [c.company, c.contact ? c.contact + '님' : '담당자님'].filter(Boolean).join(' ') + ', 안녕하세요.',
      (settings.company.short || '유니포인트') + ' ' + repLabel(rep) + '입니다.',
      '',
      '요청하신 ' + (p.title || '견적') + ' 건을 진행하기 위해 몇 가지 확인 부탁드립니다.',
      ''
    ].concat(open.map((q, i) => (i + 1) + '. ' + q.text)).concat(['', '확인해 주시면 바로 견적 진행하겠습니다. 감사합니다.']);
    copyText(lines.join('\n'), '고객 확인 문구');
  }
  return html`<div class="stack s16">
    <${RequestSource} p=${p} />
    <section class="stack s8">
      <div class="section-title"><h3>요청 품목</h3><span class="hint">매입처에 그대로 전달되는 표입니다. 사양은 구성 요소별로 한 줄씩 적으면 읽기 쉽습니다.</span></div>
      <${ItemsTable} p=${p} up=${up} />
    </section>
    <div class="grid2" style="align-items:start">
      <section class="panel">
        <div class="panel-h"><h3>요청 조건</h3></div>
        <div class="panel-b grid2">
          <${Field} label="납품 희망일"><input id="cd-due" class="input" value=${cd.dueDate || ''} placeholder="예) 2026-03-31 또는 3월 말" onInput=${(e) => setCd('dueDate', e.target.value)} /><//>
          <${Field} label="납품 장소"><input id="cd-place" class="input" value=${cd.deliveryPlace || ''} onInput=${(e) => setCd('deliveryPlace', e.target.value)} /><//>
          <${Field} label="설치 · 구성" className="span2"><input id="cd-install" class="input" value=${cd.install || ''} placeholder="예) 랙 설치, OS 구성 포함" onInput=${(e) => setCd('install', e.target.value)} /><//>
          <${Field} label="기타 조건" className="span2"><${AutoText} id="cd-other" value=${cd.other || ''} minRows=${2} onInput=${(v) => setCd('other', v)} /><//>
        </div>
      </section>
      <section class="panel">
        <div class="panel-h"><h3>고객 확인 필요</h3>${open.length ? html`<span class="chip warn">${open.length}건 남음</span>` : qs.length ? html`<span class="chip ok">모두 확인</span>` : null}</div>
        <div class="panel-b stack s8">
          ${qs.map((q, i) => html`<div key=${q.id} class="row" style="flex-wrap:nowrap;align-items:flex-start">
            <label class="check" style="padding-top:8px"><input type="checkbox" aria-label="확인 완료" checked=${q.done} onChange=${(e) => up((x) => { x.questions[i].done = e.target.checked; })} /></label>
            <${AutoText} value=${q.text} className=${q.done ? 'faint' : ''} onInput=${(v) => up((x) => { x.questions[i].text = v; })} />
            <button class="btn ghost icon sm" aria-label="삭제" style="margin-top:4px" onClick=${() => up((x) => { x.questions.splice(i, 1); })}><${Icon} name="x" size=${14} /></button>
          </div>`)}
          ${!qs.length ? html`<p class="small muted">수량 누락이나 모호한 사양처럼 고객에게 물어볼 점을 적어 두세요.</p>` : null}
          <div class="row">
            <button class="btn sm" onClick=${() => up((x) => { x.questions = (x.questions || []).concat([{ id: L.uid('q'), text: '', done: false }]); })}><${Icon} name="plus" size=${14} />확인 사항 추가</button>
            ${open.length ? html`<button class="btn sm" onClick=${copyAsk}><${Icon} name="copy" size=${14} />고객 확인 문구 복사</button>` : null}
          </div>
        </div>
      </section>
    </div>
    <${StepNav} prev="고객 요청" onPrev=${() => go(1)} next="매입 요청" nextDisabled=${!(p.items || []).length} onNext=${() => go(3)} />
  </div>`;
}

/* ===================== 3. 매입 요청 ===================== */
function VendorQuickAdd({ onSave, onCancel, initial }) {
  const [v, setV] = useState(Object.assign({ name: '', contact: '', email: '', phone: '' }, initial || {}));
  return html`<div class="panel" style="background:var(--surface-2)"><div class="panel-b grid4">
    <${Field} label="업체명"><input id="nv-name" class="input" value=${v.name} onInput=${(e) => setV(Object.assign({}, v, { name: e.target.value }))} /><//>
    <${Field} label="담당자"><input id="nv-contact" class="input" value=${v.contact} onInput=${(e) => setV(Object.assign({}, v, { contact: e.target.value }))} /><//>
    <${Field} label="이메일"><input id="nv-email" class="input" type="email" value=${v.email} onInput=${(e) => setV(Object.assign({}, v, { email: e.target.value }))} /><//>
    <${Field} label="연락처"><input id="nv-phone" class="input" value=${v.phone} onInput=${(e) => setV(Object.assign({}, v, { phone: e.target.value }))} /><//>
  </div><div class="panel-f"><button class="btn primary sm" disabled=${!str(v.name)} onClick=${() => onSave(v)}>매입처 저장</button><button class="btn ghost sm" onClick=${onCancel}>취소</button></div></div>`;
}

function StepRfq({ p, up, settings, vendors, go, saveVendor }) {
  const rfq = p.rfq || {};
  const targets = rfq.targets || [];
  const sent = rfq.sent || [];
  const replyBy = rfq.replyBy || L.addBizDays(L.today(), settings.defaults.replyDays || 2);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [preview, setPreview] = useState(targets.length ? targets[0].vendorId : null);
  const [busy, setBusy] = useState('');
  const items = p.items || [];
  const rep = repOf(settings, p.repId);
  const opts = { replyBy: replyBy, showCustomer: !!rfq.showCustomer, extra: rfq.extra || '' };
  const vmap = new Map((vendors || []).map((v) => [v.id, v]));
  const setR = (fn) => up((x) => { x.rfq = x.rfq || {}; fn(x.rfq); });
  const isSel = (id) => targets.some((t) => t.vendorId === id);
  const toggle = (id) => setR((r) => {
    r.targets = r.targets || [];
    const k = r.targets.findIndex((t) => t.vendorId === id);
    if (k >= 0) r.targets.splice(k, 1); else r.targets.push({ vendorId: id, itemIds: null });
  });
  const list = (vendors || []).filter((v) => !q || (v.name + ' ' + (v.contact || '') + ' ' + (v.category || '')).toLowerCase().includes(q.toLowerCase()));
  const tv = targets.map((t) => ({ t: t, vendor: vmap.get(t.vendorId) })).filter((x) => x.vendor);
  const sentAt = (id) => { const s = sent.find((x) => x.vendorId === id); return s ? s.at : null; };

  async function doEml(sel) {
    setBusy('eml');
    try { await exportRfqEml(p, sel.map((x) => ({ vendor: x.vendor, itemIds: x.t.itemIds })), settings, opts); }
    catch (e) { toast(e.message || '메일 파일을 만들지 못했습니다', 'bad'); }
    finally { setBusy(''); }
  }
  async function doXlsx(x) {
    setBusy('x' + x.vendor.id);
    try { await exportRfqXlsx(p, x.vendor, settings, Object.assign({}, opts, { itemIds: x.t.itemIds })); }
    catch (e) { toast(e.message || '엑셀을 만들지 못했습니다', 'bad'); }
    finally { setBusy(''); }
  }
  const markSent = (id, on) => setR((r) => {
    r.sent = (r.sent || []).filter((s) => s.vendorId !== id);
    if (on) r.sent.push({ vendorId: id, at: L.today() });
  });

  return html`<div class="stack s16">
    <div class="grid2" style="grid-template-columns:minmax(0,1fr) minmax(0,1.25fr);align-items:start">
      <section class="panel">
        <div class="panel-h"><h3>받는 매입처</h3><span class="sub">${targets.length ? targets.length + '곳 선택' : '견적을 받을 곳을 고르세요'}</span></div>
        <div class="panel-b stack s8">
          <div class="row" style="flex-wrap:nowrap"><input class="input" placeholder="업체명 · 담당자 · 취급 품목 검색" value=${q} onInput=${(e) => setQ(e.target.value)} aria-label="매입처 검색" /><button class="btn" onClick=${() => setAdding(true)}><${Icon} name="plus" size=${14} />새 매입처</button></div>
          ${adding ? html`<${VendorQuickAdd} onCancel=${() => setAdding(false)} onSave=${async (v) => { const id = await saveVendor(v); setAdding(false); if (id) toggle(id); }} />` : null}
          <div style="max-height:300px;overflow:auto;border:1px solid var(--line);border-radius:var(--r-1)">
            ${list.map((v) => html`<label key=${v.id} class="row" style="padding:8px 10px;border-bottom:1px solid var(--line);flex-wrap:nowrap;cursor:pointer;background:${isSel(v.id) ? 'var(--brand-soft)' : 'transparent'}">
              <input type="checkbox" checked=${isSel(v.id)} onChange=${() => toggle(v.id)} style="accent-color:var(--brand);width:16px;height:16px" />
              <div style="min-width:0;flex:1"><b>${v.name}</b> <span class="small muted">${v.contact || ''}</span><div class="xs faint" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${v.email || '이메일 없음'}${v.category ? ' · ' + v.category : ''}</div></div>
              ${!v.email ? html`<span class="chip warn">이메일 없음</span>` : null}
            </label>`)}
            ${!list.length ? html`<div class="empty" style="padding:20px"><span class="small">${(vendors || []).length ? '검색 결과가 없습니다' : '등록된 매입처가 없습니다. [새 매입처]로 추가하세요.'}</span></div>` : null}
          </div>
        </div>
      </section>
      <section class="panel">
        <div class="panel-h"><h3>요청 옵션</h3></div>
        <div class="panel-b grid2">
          <${Field} label="회신 요청일"><input id="rfq-reply" type="date" class="input" value=${replyBy} onInput=${(e) => setR((r) => { r.replyBy = e.target.value; })} /><//>
          <${Field} label="보내는 사람"><select id="rfq-rep" class="select" value=${p.repId || (settings.reps[0] && settings.reps[0].id)} onChange=${(e) => { lsSet('uq.rep', e.target.value); up((x) => { x.repId = e.target.value; }); }}>${settings.reps.map((r) => html`<option key=${r.id} value=${r.id}>${repLabel(r) || '(이름 없음)'}</option>`)}</select><//>
          <label class="check span2"><input type="checkbox" checked=${!!rfq.showCustomer} onChange=${(e) => setR((r) => { r.showCustomer = e.target.checked; })} />메일·요청서에 고객사명 표시 <span class="faint small">(딜 등록이 필요한 경우)</span></label>
          <${Field} label="추가 요청 사항" hint="메일 '요청 사항' 끝에 붙습니다" className="span2"><${AutoText} id="rfq-extra" minRows=${2} value=${rfq.extra || ''} placeholder="예) 3년 무상 유지보수 포함 가격으로 부탁드립니다." onInput=${(v) => setR((r) => { r.extra = v; })} /><//>
        </div>
      </section>
    </div>

    ${tv.length ? html`<section class="stack s8">
      <div class="section-title"><h3>요청 메일</h3>
        <div class="row">
          <span class="hint">Outlook 메일 파일(.eml)은 압축(zip) 안에 들어 있습니다. 열면 받는 사람·제목·본문·견적요청서 첨부가 채워진 새 메일 창이 뜹니다(Windows용 Outlook).</span>
          ${tv.length > 1 ? html`<button class="btn primary sm" disabled=${!!busy} onClick=${() => doEml(tv)}><${Icon} name="mail" size=${14} />${tv.length}곳 메일 파일 한 번에</button>` : null}
        </div>
      </div>
      ${tv.map((x) => {
        const v = x.vendor;
        const mail = L.rfqEmail(p, v, settings, rep, Object.assign({}, opts, { itemIds: x.t.itemIds }));
        const sat = sentAt(v.id);
        const open = preview === v.id;
        const selIds = x.t.itemIds;
        return html`<div key=${v.id} class="panel">
          <div class="panel-h">
            <div style="flex:1;min-width:200px"><b style="font-size:15px">${v.name}</b> <span class="small muted">${v.contact || ''}</span><div class="xs faint">${v.email || '이메일이 없습니다 — 매입처 화면에서 추가하세요'}${v.cc ? ' · 참조 ' + v.cc : ''}</div></div>
            <label class="check small"><input type="checkbox" checked=${!!sat} onChange=${(e) => markSent(v.id, e.target.checked)} />${sat ? '발송 완료 ' + sat.slice(5).replace('-', '/') : '발송 완료로 표시'}</label>
          </div>
          <div class="panel-b stack s8">
            ${items.length > 1 ? html`<div class="row small">
              <span class="muted">요청 품목</span>
              ${items.map((it, i) => html`<label key=${it.id} class="check chip outline" style="height:26px"><input type="checkbox" checked=${!selIds || selIds.includes(it.id)} onChange=${(e) => setR((r) => {
                const t = r.targets.find((y) => y.vendorId === v.id);
                const cur = t.itemIds || items.map((z) => z.id);
                t.itemIds = e.target.checked ? cur.concat([it.id]).filter((id, k, a) => a.indexOf(id) === k) : cur.filter((id) => id !== it.id);
                if (t.itemIds.length === items.length) t.itemIds = null;
              })} />${i + 1}. ${it.name || '품목'}</label>`)}
            </div>` : null}
            <div class="row">
              <button class="btn primary sm" disabled=${!!busy || !mail.itemCount} onClick=${() => doEml([x])}><${Icon} name="mail" size=${14} />Outlook 메일 파일</button>
              <button class="btn sm" disabled=${!mail.to.length} onClick=${() => copyText(mail.to.map((a) => a.email).concat(mail.cc.map((a) => a.email)).join('; '), '받는 사람')}>받는 사람 복사</button>
              <button class="btn sm" onClick=${() => copyText(mail.subject, '제목')}>제목 복사</button>
              <button class="btn sm" onClick=${() => copyRich(mail.html, mail.text, '본문')}><${Icon} name="copy" size=${14} />본문 복사</button>
              <button class="btn sm" disabled=${!!busy} onClick=${() => doXlsx(x)}><${Icon} name="dl" size=${14} />견적요청서 엑셀</button>
              <button class="btn ghost sm" onClick=${() => setPreview(open ? null : v.id)}>${open ? '미리보기 닫기' : '미리보기'}</button>
            </div>
            ${open ? html`<div class="mailbox">
              <div class="hd"><span>받는 사람</span><b>${mail.to.map((a) => a.name + ' <' + a.email + '>').join(', ') || '(이메일 없음)'}</b>
                ${mail.cc.length ? html`<span>참조</span><b>${mail.cc.map((a) => a.email).join(', ')}</b>` : null}
                <span>제목</span><b>${mail.subject}</b><span>첨부</span><b>${rfqFileName(p, v)}</b></div>
              <div class="bd" dangerouslySetInnerHTML=${{ __html: mail.html }}></div>
            </div>` : null}
          </div>
        </div>`;
      })}
    </section>` : null}
    <${StepNav} prev="요청 정리" onPrev=${() => go(2)} next="매입 견적 받기" onNext=${() => go(4)} />
  </div>`;
}

/* ===================== 4. 매입 검토 ===================== */
const MATCH_LABEL = { exact: '일치', alternative: '대체품', partial: '일부 다름', extra: '요청 외' };
const MATCH_CHIP = { exact: 'ok', alternative: 'warn', partial: 'warn', extra: 'info' };
const LV_LABEL = { bad: '불일치', warn: '확인', info: '참고', ok: '일치' };

function QuoteCard({ p, qt, qi, up, vendors, saveVendor, open, onToggle }) {
  const rv = L.reviewQuote(p, qt, L.today());
  const items = p.items || [];
  const setQ = (fn) => up((x) => { const t = x.quotes.find((y) => y.id === qt.id); if (t) fn(t, x); });
  const setIt = (k, key, v) => setQ((t) => { t.items[k][key] = v; });
  const sum = rv.sumAmt;
  const [partsOpen, setPartsOpen] = useState(null);
  const known = qt.vendorId && vendors.find((v) => v.id === qt.vendorId);
  const status = rv.counts.bad ? html`<span class="chip bad">불일치 ${rv.counts.bad}</span>` : null;
  const warn = rv.counts.warn ? html`<span class="chip warn">확인 ${rv.counts.warn}</span>` : null;
  return html`<div class="panel qcard">
    <div class="panel-h">
      <div style="flex:1;min-width:220px" class="stack" >
        <div class="row" style="gap:8px"><b style="font-size:15px">${qt.vendorName || '매입처 미지정'}</b>${status}${warn}${!rv.counts.bad && !rv.counts.warn ? html`<span class="chip ok">${items.length ? '요청과 일치' : '검토 이상 없음'}</span>` : null}${qt.vat === 'included' ? html`<span class="chip info">VAT 포함 견적</span>` : null}</div>
        <div class="xs faint">${[qt.quoteNo ? '견적번호 ' + qt.quoteNo : '', qt.quoteDate ? '견적일 ' + qt.quoteDate : '', '받은 날 ' + (qt.receivedAt || ''), rv.validUntil ? '유효 ~' + rv.validUntil : ''].filter(Boolean).join(' · ')}</div>
      </div>
      <div class="right"><div class="xs faint">품목 합계(견적서 기준)</div><b class="num" style="font-size:16px">${L.fmt(sum)}원</b></div>
      <button class="btn sm" onClick=${onToggle}>${open ? '접기' : '자세히'}</button>
      <${ConfirmBtn} small icon="trash" label="이 매입 견적 삭제" onConfirm=${() => up((x) => { x.quotes = x.quotes.filter((y) => y.id !== qt.id); if (x.adopt) Object.keys(x.adopt).forEach((k) => { if (x.adopt[k] && x.adopt[k].quoteId === qt.id) delete x.adopt[k]; }); })} />
    </div>
    <div class="panel-b stack">
      <ul class="findings">${rv.findings.filter((f) => open || f.level === 'bad' || f.level === 'warn').map((f, i) => html`<li key=${i} class=${f.level}><span class="lv">${LV_LABEL[f.level]}</span><span>${f.text}</span></li>`)}</ul>
      ${!known ? html`<div class="row small"><span class="muted">매입처 연결</span>
        <select class="select" style="width:auto;min-width:180px;height:30px" value="" onChange=${(e) => { const v = vendors.find((y) => y.id === e.target.value); if (v) setQ((t) => { t.vendorId = v.id; t.vendorName = v.name; }); }}>
          <option value="">목록에서 선택…</option>${vendors.map((v) => html`<option key=${v.id} value=${v.id}>${v.name}</option>`)}</select>
        ${qt.vendorName ? html`<button class="btn sm" onClick=${async () => { const id = await saveVendor({ name: qt.vendorName, contact: (qt.vendorContact && qt.vendorContact.contact) || '', email: (qt.vendorContact && qt.vendorContact.email) || '', phone: (qt.vendorContact && qt.vendorContact.phone) || '' }); if (id) setQ((t) => { t.vendorId = id; }); }}>'${qt.vendorName}' 새 매입처로 저장</button>` : null}
      </div>` : null}
      ${open ? html`<div class="stack s16">
        ${qt.source && qt.source.text ? html`<details class="fpreview" open>
          <summary class="fpreview-h" style="cursor:pointer"><${Icon} name="file" size=${14} /><b class="small" style="flex:1">견적 원본</b><span class="xs faint">${(qt.source.files || []).join(', ')}</span></summary>
          <div class="fpreview-b" style="max-height:340px">${qt.source.sheets && qt.source.sheets.length
            ? html`${qt.source.rest ? html`<pre style="margin-bottom:12px">${qt.source.rest}</pre>` : null}<${SheetTables} sheets=${qt.source.sheets} />`
            : html`<pre>${qt.source.text}</pre>`}</div>
        </details>` : null}
        <div class="tbl-wrap"><table class="tbl" style="min-width:1040px">
          <thead><tr>${items.length ? html`<th style="width:17%">요청 품목</th>` : null}<th>모델 · 품명</th><th class="num" style="width:70px">수량</th><th style="width:60px">단위</th><th class="num" style="width:130px">제안 단가</th><th class="num" style="width:140px">금액</th>${items.length ? html`<th style="width:118px">대응</th>` : null}<th style="width:70px"></th></tr></thead>
          <tbody>${qt.items.map((it, k) => {
            const calc = L.num(it.unitPrice) !== null && L.num(it.qty) !== null ? L.num(it.unitPrice) * L.num(it.qty) : null;
            const bad = calc !== null && L.num(it.amount) !== null && Math.abs(calc - L.num(it.amount)) > Math.max(1, Math.abs(L.num(it.amount)) * 0.0005);
            return html`<${Fragment} key=${it.id}><tr class=${bad ? 'flag-bad' : it.match === 'partial' || it.match === 'alternative' ? 'flag-warn' : ''}>
              ${items.length ? html`<td><select class="select" aria-label="요청 품목" value=${it.reqItemId || ''} onChange=${(e) => setQ((t) => { t.items[k].reqItemId = e.target.value || null; if (!e.target.value) t.items[k].match = 'extra'; else if (t.items[k].match === 'extra') t.items[k].match = 'partial'; })}>
                <option value="">요청 외 항목</option>${items.map((r, i) => html`<option key=${r.id} value=${r.id}>${i + 1}. ${r.name}</option>`)}</select></td>` : null}
              <td><div class="stack s8" style="gap:4px"><input class="input" aria-label="모델" value=${it.model} placeholder="모델" onInput=${(e) => setIt(k, 'model', e.target.value)} /><input class="input" aria-label="품명" value=${it.name} placeholder="품명 · 구성명" onInput=${(e) => setIt(k, 'name', e.target.value)} />${it.matchNote ? html`<div class="xs" style="color:var(--warn)">${it.matchNote}</div>` : null}</div></td>
              <td><${NumInput} ariaLabel="수량" value=${it.qty} onChange=${(v) => setIt(k, 'qty', v)} /></td>
              <td><input class="input" aria-label="단위" value=${it.unit} onInput=${(e) => setIt(k, 'unit', e.target.value)} /></td>
              <td><${NumInput} ariaLabel="제안 단가" value=${it.unitPrice} onChange=${(v) => setIt(k, 'unitPrice', v)} />${it.listPrice ? html`<div class="xs faint right">정가 ${L.fmt(it.listPrice)}</div>` : null}</td>
              <td><${NumInput} ariaLabel="금액" value=${it.amount} onChange=${(v) => setIt(k, 'amount', v)} />${bad ? html`<div class="xs right gp-low">계산값 ${L.fmt(calc)}</div>` : null}</td>
              ${items.length ? html`<td><select class="select" aria-label="대응" value=${it.match} onChange=${(e) => setIt(k, 'match', e.target.value)}>${Object.keys(MATCH_LABEL).map((m) => html`<option key=${m} value=${m}>${MATCH_LABEL[m]}</option>`)}</select></td>` : null}
              <td><div class="cell-actions"><button class="btn ghost sm" onClick=${() => setPartsOpen(partsOpen === it.id ? null : it.id)} aria-label="구성 보기">${(it.parts || []).length ? '파트 ' + it.parts.length : '사양'}</button>
                <button class="btn ghost icon sm" aria-label="행 삭제" onClick=${() => setQ((t) => { t.items.splice(k, 1); })}><${Icon} name="x" size=${14} /></button></div></td>
            </tr>
            ${partsOpen === it.id ? html`<tr class="sub"><td colspan=${items.length ? 8 : 6}><div class="grid2" style="align-items:start">
              <div class="stack s8"><b class="small">고객용 주요 사양 <span class="faint">(매출 견적서 상세내역으로 들어갑니다)</span></b>
                <${SpecEditor} specs=${it.specs || []} onChange=${(fn) => setQ((t) => { t.items[k].specs = t.items[k].specs || []; fn(t.items[k].specs); })} />
              </div>
              <div class="stack s8"><b class="small">견적서 파트 목록</b>
                ${(it.parts || []).length ? html`<div class="tbl-wrap" style="max-height:260px;overflow:auto"><table class="tbl"><thead><tr><th>파트 번호</th><th>상세 내역</th><th class="num">수량</th></tr></thead><tbody>${it.parts.map((pt, j) => html`<tr key=${j}><td class="mono">${pt.partNo}</td><td>${pt.desc}</td><td class="num">${pt.qty ?? ''}</td></tr>`)}</tbody></table></div>` : html`<span class="small faint">파트 목록 없음</span>`}
                ${it.summary ? html`<div class="xs muted">${it.summary}</div>` : null}
              </div>
            </div></td></tr>` : null}
            <//>`;
          })}</tbody>
        </table></div>
        <div><button class="btn sm" onClick=${() => setQ((t) => { t.items.push({ id: L.uid('qi'), reqItemId: null, model: '', name: '', summary: '', qty: 1, unit: 'EA', listPrice: null, unitPrice: null, amount: null, parts: [], specs: [], note: '', match: 'extra', matchNote: '' }); })}><${Icon} name="plus" size=${14} />행 추가</button></div>
        <div class="grid4">
          <${Field} label="부가세"><select class="select" value=${qt.vat} onChange=${(e) => setQ((t) => { t.vat = e.target.value; })}><option value="excluded">별도 (공급가)</option><option value="included">포함 (÷1.1 환산)</option><option value="unknown">불분명</option></select><//>
          <${Field} label="견적일자"><input class="input" value=${qt.quoteDate || ''} placeholder="YYYY-MM-DD" onInput=${(e) => setQ((t) => { t.quoteDate = e.target.value; })} /><//>
          <${Field} label="유효기간"><input class="input" value=${qt.terms.validUntil || ''} onInput=${(e) => setQ((t) => { t.terms.validUntil = e.target.value; })} /><//>
          <${Field} label="견적서 공급가 합계"><${NumInput} value=${qt.totals.supply} onChange=${(v) => setQ((t) => { t.totals.supply = v; })} /><//>
          <${Field} label="납기"><input class="input" value=${qt.terms.delivery || ''} onInput=${(e) => setQ((t) => { t.terms.delivery = e.target.value; })} /><//>
          <${Field} label="결제 조건"><input class="input" value=${qt.terms.payment || ''} onInput=${(e) => setQ((t) => { t.terms.payment = e.target.value; })} /><//>
          <${Field} label="무상 유지보수"><input class="input" value=${qt.terms.warranty || ''} onInput=${(e) => setQ((t) => { t.terms.warranty = e.target.value; })} /><//>
          <${Field} label="배송 · 설치"><input class="input" value=${qt.terms.shipping || ''} onInput=${(e) => setQ((t) => { t.terms.shipping = e.target.value; })} /><//>
        </div>
        <div class="stack s8">
          <div class="section-title"><b>요청과 달라진 점</b><span class="hint">매출 견적서 '주석'으로 가져갈 수 있습니다. 사유가 비어 있으면 채워 주세요.</span></div>
          ${(qt.deviations || []).map((d, j) => html`<div key=${d.id} class="grid2" style="grid-template-columns:minmax(0,1fr) minmax(0,1.3fr) auto;align-items:start">
            <input class="input" aria-label="변경 내용" value=${d.title} placeholder="예) GPU 모델 변경 (A → B)" onInput=${(e) => setQ((t) => { t.deviations[j].title = e.target.value; })} />
            <input class="input" aria-label="사유" value=${d.reason} placeholder="사유" onInput=${(e) => setQ((t) => { t.deviations[j].reason = e.target.value; })} />
            <button class="btn ghost icon sm" aria-label="삭제" onClick=${() => setQ((t) => { t.deviations.splice(j, 1); })}><${Icon} name="x" size=${14} /></button>
          </div>`)}
          <div><button class="btn sm" onClick=${() => setQ((t) => { t.deviations = (t.deviations || []).concat([{ id: L.uid('dv'), reqItemId: null, title: '', reason: '' }]); })}><${Icon} name="plus" size=${14} />변경 사항 추가</button></div>
        </div>
      </div>` : null}
    </div>
  </div>`;
}

function SpecEditor({ specs, onChange }) {
  return html`<div class="stack s8" style="gap:6px">
    ${specs.map((s, j) => html`<div key=${j} class="spec-row">
      <input class="input" aria-label="분류" placeholder="분류(CPU)" value=${s.cat} onInput=${(e) => onChange((a) => { a[j].cat = e.target.value; })} />
      <input class="input" aria-label="상세내역" placeholder="상세내역" value=${s.detail} onInput=${(e) => onChange((a) => { a[j].detail = e.target.value; })} />
      <input class="input" aria-label="스펙" placeholder="스펙(2EA)" value=${s.spec} onInput=${(e) => onChange((a) => { a[j].spec = e.target.value; })} />
      <button class="btn ghost icon sm" aria-label="줄 삭제" onClick=${() => onChange((a) => { a.splice(j, 1); })}><${Icon} name="x" size=${14} /></button>
    </div>`)}
    <div><button class="btn ghost sm" onClick=${() => onChange((a) => { a.push({ cat: '', detail: '', spec: '' }); })}><${Icon} name="plus" size=${14} />사양 줄 추가</button></div>
  </div>`;
}

function CompareTable({ p, up }) {
  const quotes = p.quotes || [];
  const items = p.items || [];
  const adopt = L.effectiveAdopt(p);
  if (!quotes.length || !items.length) return null;
  const choose = (reqId, val) => up((x) => { x.adopt = x.adopt || {}; x.adopt[reqId] = val; });
  return html`<section class="stack s8">
    <div class="section-title"><h3>매입처 비교 · 채택</h3><span class="hint">요청 품목별로 매출 견적서에 쓸 매입 견적을 고릅니다. 처음에는 최저가(공급가 기준)가 선택됩니다.</span></div>
    <div class="tbl-wrap"><table class="tbl cmp" style=${'min-width:' + (260 + quotes.length * 210) + 'px'}>
      <thead><tr><th style="width:240px">요청 품목</th>${quotes.map((qt) => html`<th key=${qt.id}>${qt.vendorName || '매입처 미지정'}${qt.vat === 'included' ? ' (VAT 포함→환산)' : ''}</th>`)}<th style="width:90px">미채택</th></tr></thead>
      <tbody>${items.map((it, i) => {
        const cands = [];
        quotes.forEach((qt) => (qt.items || []).forEach((qi) => { if (qi.reqItemId === it.id) cands.push({ qt: qt, qi: qi, u: L.supplyUnit(qt, qi) }); }));
        const min = cands.filter((c) => c.u !== null).reduce((m, c) => (m === null || c.u < m ? c.u : m), null);
        const cur = adopt[it.id];
        return html`<tr key=${it.id}>
          <td><b>${i + 1}. ${it.name}</b><div class="xs faint">요청 수량 ${it.qty ?? '-'} ${it.unit || ''}</div></td>
          ${quotes.map((qt) => {
            const cs = cands.filter((c) => c.qt.id === qt.id);
            if (!cs.length) return html`<td key=${qt.id} class="faint small">견적 없음</td>`;
            return html`<td key=${qt.id} style="padding:4px">${cs.map((c) => {
              const on = cur && cur.quoteId === qt.id && cur.quoteItemId === c.qi.id;
              return html`<label key=${c.qi.id} class=${'row pick' + (on ? ' on' : '')} style="flex-wrap:nowrap;align-items:flex-start;padding:6px;border-radius:6px;cursor:pointer;gap:8px">
                <input type="radio" name=${'adopt-' + it.id} checked=${on} onChange=${() => choose(it.id, { quoteId: qt.id, quoteItemId: c.qi.id })} style="margin-top:4px;accent-color:var(--brand)" />
                <div style="min-width:0"><span class="price">${c.u === null ? '단가 없음' : L.fmt(c.u)}</span>${c.u !== null && c.u === min && cands.length > 1 ? html`<span class="badge-low">최저</span>` : null}
                  <div class="xs muted" style="white-space:normal">${c.qi.model || c.qi.name} · ${L.num(c.qi.qty) ?? '-'}${c.qi.unit || ''}</div>
                  <span class=${'chip ' + MATCH_CHIP[c.qi.match]} style="height:18px;font-size:11px;margin-top:2px">${MATCH_LABEL[c.qi.match]}</span></div>
              </label>`;
            })}</td>`;
          })}
          <td><label class="check small"><input type="radio" name=${'adopt-' + it.id} checked=${!cur} onChange=${() => choose(it.id, 'none')} />빼기</label></td>
        </tr>`;
      })}</tbody>
    </table></div>
  </section>`;
}

function StepQuotes({ p, up, vendors, go, saveVendor }) {
  const fr = useFileReader();
  const [raw, setRaw] = useState('');
  const [vsel, setVsel] = useState('');
  const [openQ, setOpenQ] = useState(null);
  const [openF, setOpenF] = useState(null);
  const quotes = p.quotes || [];
  const requested = ((p.rfq && p.rfq.targets) || []).map((t) => t.vendorId);
  const vlist = vendors.slice().sort((a, b) => (requested.includes(b.id) ? 1 : 0) - (requested.includes(a.id) ? 1 : 0));
  const reading = fr.files.some((f) => f.status === 'reading');
  const openedFile = fr.files.find((f) => f.id === openF) || null;

  // 요청 품목마다 한 줄씩 미리 만든 빈 매입 견적. 붙여넣은 원문·첨부 글자는 원본으로 함께 보관한다.
  function addQuote() {
    const v = vsel ? vendors.find((x) => x.id === vsel) : null;
    const text = Files.collectText(raw, fr.files);
    const qt = { id: L.uid('qt'), vendorId: v ? v.id : null, vendorName: v ? v.name : '', vendorContact: {}, receivedAt: L.today(), quoteNo: '', quoteDate: L.today(), vat: 'excluded',
      items: (p.items || []).map((it) => ({ id: L.uid('qi'), reqItemId: it.id, model: it.model || '', name: it.name, summary: '', qty: it.qty, unit: it.unit, listPrice: null, unitPrice: null, amount: null, parts: [], specs: [], note: '', match: 'exact', matchNote: '' })),
      totals: { supply: null, vat: null, total: null }, terms: { validUntil: '', warranty: '', delivery: '', payment: '', shipping: '', note: '' }, deviations: [] };
    // 요청 품목 없이 시작한 경우: 견적서 품목을 적을 빈 줄 하나
    if (!qt.items.length) qt.items.push({ id: L.uid('qi'), reqItemId: null, model: '', name: '', summary: '', qty: 1, unit: 'EA', listPrice: null, unitPrice: null, amount: null, parts: [], specs: [], note: '', match: 'extra', matchNote: '' });
    if (text) {
      const ready = fr.files.filter((f) => f.status === 'ready');
      const sheets = [];
      ready.forEach((f) => (f.sheets || []).forEach((sh) => sheets.push({ name: f.name + (f.sheets.length > 1 ? ' · ' + sh.name : ''), rows: sh.rows })));
      qt.source = { files: ready.map((f) => f.name), text: text.slice(0, 20000) };
      // 엑셀은 표로 보여 주고, 붙여넣은 본문·PDF·메일 등 나머지는 글자로 함께 보관
      if (sheets.length) { qt.source.sheets = sheets; qt.source.rest = Files.collectText(raw, ready.filter((f) => !f.sheets)).slice(0, 20000); }
    }
    up((x) => { x.quotes = (x.quotes || []).concat([qt]); });
    setRaw(''); fr.clear(); setVsel(''); setOpenF(null); setOpenQ(qt.id);
  }

  return html`<div class="stack s16">
    <section class="panel">
      <div class="panel-h"><h3>매입 견적 추가</h3><span class="sub">받은 견적서를 열어 두고 단가·금액을 표에 옮겨 적으면 요청 품목과 맞춰 검토합니다</span></div>
      <div class="panel-b stack">
        <div class="grid2" style="grid-template-columns:minmax(0,1fr) minmax(0,1.6fr);align-items:start">
          <div class="stack s8">
            <${Field} label="매입처"><select id="q-vendor" class="select" value=${vsel} onChange=${(e) => setVsel(e.target.value)}>
              <option value="">나중에 선택</option>
              ${vlist.map((v) => html`<option key=${v.id} value=${v.id}>${v.name}${requested.includes(v.id) ? ' · 요청함' : ''}</option>`)}
            </select><//>
            <${FileDrop} onFiles=${fr.add} title="견적서 파일 열기" sub="엑셀 · PDF · 이미지 · .eml — 내용을 바로 보여 줍니다" />
            <${FileChips} files=${fr.files} onRemove=${(f) => { if (openF === f.id) setOpenF(null); fr.remove(f); }} openId=${openF} onOpen=${setOpenF} />
          </div>
          <${Field} label="메일 본문 붙여넣기 (선택)"><textarea id="q-raw" class="textarea" rows="7" value=${raw} placeholder="견적 메일 본문을 붙여넣어 두면 견적과 함께 보관됩니다" onInput=${(e) => setRaw(e.target.value)}
            onPaste=${(e) => { const fl = Array.from((e.clipboardData && e.clipboardData.files) || []); if (fl.length) { e.preventDefault(); fr.add(fl); } }}></textarea><//>
        </div>
        <${FilePreview} file=${openedFile} onClose=${() => setOpenF(null)} />
        <div class="row">
          <button class="btn primary" disabled=${reading} onClick=${addQuote}><${Icon} name="plus" />매입 견적 추가</button>
          ${!(p.items || []).length ? html`<span class="small muted">요청 품목 없이 시작합니다. 견적서의 품목을 표에 옮겨 적으면 그대로 매출 견적서 줄이 됩니다.</span>` : html`<span class="small muted">요청 품목 ${(p.items || []).length}개가 미리 채워진 표가 만들어집니다.</span>`}
        </div>
      </div>
    </section>

    ${quotes.length ? html`<section class="stack s8">
      <div class="section-title"><h3>받은 매입 견적 ${quotes.length}건</h3><span class="hint">숫자를 고치면 검토 결과가 바로 다시 계산됩니다.</span></div>
      ${quotes.map((qt) => html`<${QuoteCard} key=${qt.id} p=${p} qt=${qt} up=${up} vendors=${vendors} saveVendor=${saveVendor} open=${openQ === qt.id} onToggle=${() => setOpenQ(openQ === qt.id ? null : qt.id)} />`)}
    </section>` : html`<div class="panel"><div class="empty"><h3>아직 받은 매입 견적이 없습니다</h3><span class="small">매입처 회신 메일이나 견적서 파일을 위에 넣어 주세요.</span></div></div>`}

    <${CompareTable} p=${p} up=${up} />
    <${StepNav} prev="매입 요청" onPrev=${() => go(3)} next="매출 견적서 만들기" nextDisabled=${!quotes.length && !((p.sales && p.sales.lines) || []).length} onNext=${() => go(5)} />
  </div>`;
}

/* ===================== 5. 매출 견적서 ===================== */
function StepSales({ p, up, settings, go }) {
  const s = p.sales || {};
  const lines = s.lines || [];
  const unit = L.num(settings.defaults.priceRound) || 1;
  const [gpAll, setGpAll] = useState(settings.defaults.gpRate);
  const [openSpec, setOpenSpec] = useState(null);
  const [busy, setBusy] = useState('');
  const [rebuildArm, setRebuildArm] = useState(false);
  const quoteOnly = L.quoteOnly(p);
  // 다시 만들 때도 지금 줄을 만든 매입 견적을 그대로 쓴다
  const [baseQ, setBaseQ] = useState(() => { const ln = lines.find((x) => x.src && x.src.quoteId); return ln ? ln.src.quoteId : null; });
  const tot = L.salesTotals(lines);
  const low = (L.num(settings.defaults.lowGp) || 0) / 100;
  const extras = L.extraQuoteItems(p).filter((e) => !lines.some((ln) => ln.src && ln.src.quoteItemId === e.qi.id));
  const devs = L.collectDeviations(p).filter((d) => !(s.notes || []).some((n) => n.title === d.title));

  function build() {
    up((x) => {
      x.sales = x.sales || {};
      x.sales.lines = L.buildSalesLines(x, { gpRate: gpAll, priceRound: unit }, baseQ);
      x.sales.date = x.sales.date || L.today();
      x.sales.validity = x.sales.validity || settings.defaults.validity;
      if (!x.sales.conditions) x.sales.conditions = (settings.defaults.conditions || []).slice();
      if (!x.sales.notes || !x.sales.notes.length) x.sales.notes = L.collectDeviations(x);
    });
    setRebuildArm(false);
  }
  const setL = (i, fn) => up((x) => { fn(x.sales.lines[i], x); });
  const setGp = (i, v) => setL(i, (ln) => { ln.gpRate = v; if (v !== null && L.num(ln.costUnit) !== null) ln.unitPrice = L.priceFromGp(ln.costUnit, v, unit); });
  const setPrice = (i, v) => setL(i, (ln) => { ln.unitPrice = v; const r = L.gpRateOf(v, ln.costUnit); if (r !== null) ln.gpRate = Math.round(r * 1000) / 10; });
  const setCost = (i, v) => setL(i, (ln) => { ln.costUnit = v; if (L.num(ln.gpRate) !== null && v !== null) ln.unitPrice = L.priceFromGp(v, ln.gpRate, unit); });
  const applyAll = () => up((x) => { (x.sales.lines || []).forEach((ln) => { ln.gpRate = gpAll; if (L.num(ln.costUnit) !== null) ln.unitPrice = L.priceFromGp(ln.costUnit, gpAll, unit); }); });
  const move = (i, d) => up((x) => { const a = x.sales.lines; const j = i + d; if (j < 0 || j >= a.length) return; const t = a[i]; a[i] = a[j]; a[j] = t; });
  const addLine = () => up((x) => { x.sales = x.sales || {}; x.sales.lines = (x.sales.lines || []).concat([{ id: L.uid('l'), category: '', name: '', specs: [], qty: 1, unit: 'EA', costUnit: null, gpRate: gpAll, unitPrice: null, note: '', src: null, vendorName: '', costLabel: '' }]); if (!x.sales.date) x.sales.date = L.today(); if (!x.sales.validity) x.sales.validity = settings.defaults.validity; if (!x.sales.conditions) x.sales.conditions = (settings.defaults.conditions || []).slice(); });
  const addExtra = (e) => up((x) => { x.sales.lines.push(L.makeLineFromQuote(x, null, e.qt, e.qi, { gpRate: gpAll, priceRound: unit })); });

  async function doExport(kind) {
    setBusy(kind);
    try { if (kind === 'xlsx') await exportSalesXlsx(p, settings); else await exportSalesPdf(p, settings); }
    catch (e) { toast((e && e.message) || '파일을 만들지 못했습니다', 'bad'); console.warn(e); }
    finally { setBusy(''); }
  }

  if (!lines.length) {
    const adopt = L.effectiveAdopt(p);
    const withCost = Object.values(adopt).filter(Boolean).length;
    const quotes = p.quotes || [];
    const bq = quoteOnly ? L.baseQuote(p, baseQ) : null;
    return html`<div class="stack s16">
      <section class="panel"><div class="panel-b stack" style="align-items:flex-start;gap:14px">
        <h3 style="font-size:18px">매입 견적으로 매출 견적서 만들기</h3>
        ${quoteOnly ? html`<p class="muted">${bq.vendorName || '매입처 미지정'} 견적의 품목 ${(bq.items || []).length}개를 그대로 매출 견적서 줄로 만듭니다. 제안 단가 = 매입 단가 ÷ (1 − GP%), ${L.fmt(unit)}원 단위 올림.</p>
          ${quotes.length > 1 ? html`<label class="field" style="min-width:260px"><span>사용할 매입 견적</span><select id="sales-base" class="select" value=${bq.id} onChange=${(e) => setBaseQ(e.target.value)}>
            ${quotes.map((q, i) => html`<option key=${q.id} value=${q.id}>${i + 1}. ${q.vendorName || '매입처 미지정'} · 품목 ${(q.items || []).length}개 · ${L.fmt(L.reviewQuote(p, q).sumAmt)}원</option>`)}</select></label>` : null}`
        : !(p.items || []).length ? html`<p class="muted">아직 매입 견적이 없습니다. 4단계에서 받은 매입 견적서를 먼저 넣거나, 빈 견적서로 시작하세요.</p>`
        : html`<p class="muted">요청 품목 ${(p.items || []).length}개 중 ${withCost}개에 매입가가 있습니다. 제안 단가 = 매입 단가 ÷ (1 − GP%), ${L.fmt(unit)}원 단위 올림.</p>`}
        <div class="row"><label class="field" style="width:140px"><span>GP%</span><${NumInput} id="gp-init" decimals=${1} value=${gpAll} onChange=${setGpAll} /></label>
          <button class="btn primary lg" style="align-self:flex-end" disabled=${!(p.items || []).length && !quotes.length} onClick=${build}><${Icon} name="spark" />견적서 만들기</button>
          <button class="btn lg" style="align-self:flex-end" onClick=${addLine}>빈 견적서로 시작</button></div>
      </div></section>
      <${StepNav} prev="매입 검토" onPrev=${() => go(4)} />
    </div>`;
  }

  const doc = salesDocData(p, settings);
  return html`<div class="stack s16">
    <div class="row" style="justify-content:space-between">
      <div class="row">
        <label class="row small" style="gap:6px"><span class="muted">GP%</span><span style="width:84px"><${NumInput} ariaLabel="일괄 GP%" decimals=${1} value=${gpAll} onChange=${setGpAll} /></span></label>
        <button class="btn sm" onClick=${applyAll}>전체 품목에 적용</button>
        <span class="hint">단가는 ${L.fmt(unit)}원 단위 올림 (설정에서 변경)</span>
      </div>
      <div class="row">
        ${rebuildArm ? html`<span class="row tight"><span class="small" style="color:var(--warn)">품목 표를 다시 만듭니다</span><button class="btn sm danger solid" onClick=${build}>다시 만들기</button><button class="btn sm ghost" onClick=${() => setRebuildArm(false)}>취소</button></span>`
          : html`<button class="btn sm ghost" onClick=${() => setRebuildArm(true)}>매입 견적에서 다시 만들기</button>`}
      </div>
    </div>

    <div class="tbl-wrap"><table class="tbl" style="min-width:1240px">
      <thead><tr><th class="center">NO</th><th style="width:13%">품목</th><th style="min-width:240px">품명</th><th class="num" style="width:70px">수량</th><th class="num" style="width:128px">매입 단가</th><th class="num" style="width:84px">GP%</th><th class="num" style="width:132px">제안 단가</th><th class="num" style="width:130px">제안가 합계</th><th style="width:11%">비고</th><th style="width:126px"></th></tr></thead>
      <tbody>${lines.map((ln, i) => {
        const c = L.lineCalc(ln);
        const flag = c.cost === null ? 'flag-warn' : (c.rate !== null && c.rate < low ? 'flag-bad' : '');
        return html`<${Fragment} key=${ln.id}><tr class=${flag}>
          <td class="idx">${i + 1}</td>
          <td><${AutoText} ariaLabel="품목" value=${ln.category} onInput=${(v) => setL(i, (l) => { l.category = v; })} /></td>
          <td><input class="input" aria-label="품명" value=${ln.name} onInput=${(e) => setL(i, (l) => { l.name = e.target.value; })} />
            <div class="srcnote">${ln.vendorName ? html`<span class="chip outline" style="height:18px;font-size:11px">매입</span>${ln.vendorName}${ln.costLabel ? ' · ' + ln.costLabel : ''}` : html`<span style="color:var(--warn)">연결된 매입 견적 없음 — 매입 단가를 직접 입력하세요</span>`}</div></td>
          <td><${NumInput} ariaLabel="수량" value=${ln.qty} onChange=${(v) => setL(i, (l) => { l.qty = v; })} /></td>
          <td><${NumInput} ariaLabel="매입 단가" value=${ln.costUnit} onChange=${(v) => setCost(i, v)} /></td>
          <td><${NumInput} ariaLabel="GP%" decimals=${1} value=${ln.gpRate} className=${c.rate !== null && c.rate < low ? 'gp-low' : ''} onChange=${(v) => setGp(i, v)} /></td>
          <td><${NumInput} ariaLabel="제안 단가" value=${ln.unitPrice} onChange=${(v) => setPrice(i, v)} /></td>
          <td class="num" style="padding-top:12px"><b>${c.amount === null ? '-' : L.fmt(c.amount)}</b>${c.gp !== null ? html`<div class="xs faint">GP ${L.fmt(c.gp)}</div>` : null}</td>
          <td><${AutoText} ariaLabel="비고" value=${ln.note} onInput=${(v) => setL(i, (l) => { l.note = v; })} /></td>
          <td><div class="cell-actions">
            <button class="btn ghost sm" onClick=${() => setOpenSpec(openSpec === ln.id ? null : ln.id)}>사양 ${(ln.specs || []).length}</button>
            <button class="btn ghost icon sm" aria-label="위로" onClick=${() => move(i, -1)}><${Icon} name="up" size=${14} /></button>
            <button class="btn ghost icon sm" aria-label="아래로" onClick=${() => move(i, 1)}><${Icon} name="down" size=${14} /></button>
            <${ConfirmBtn} small icon="trash" label="품목 삭제" onConfirm=${() => up((x) => { x.sales.lines.splice(i, 1); })} />
          </div></td>
        </tr>
        ${openSpec === ln.id ? html`<tr class="sub"><td></td><td colspan="9"><div class="stack s8"><b class="small">상세내역 · 스펙 <span class="faint">(견적서에서 품명 아래 줄로 표시)</span></b>
          <${SpecEditor} specs=${ln.specs || []} onChange=${(fn) => setL(i, (l) => { l.specs = l.specs || []; fn(l.specs); })} /></div></td></tr>` : null}
        <//>`;
      })}</tbody>
    </table></div>
    <div class="row">
      <button class="btn sm" onClick=${addLine}><${Icon} name="plus" size=${14} />품목 추가</button>
      ${extras.map((e) => html`<button key=${e.qi.id} class="btn sm ghost" onClick=${() => addExtra(e)}><${Icon} name="plus" size=${14} />${e.qt.vendorName} '${e.qi.name || e.qi.model}' ${L.fmt(L.supplyUnit(e.qt, e.qi))}원 추가</button>`)}
    </div>

    <div class="totbar">
      <div><span>공급가액</span><b>${L.fmt(tot.supply)}</b></div>
      <div><span>부가세</span><b>${L.fmt(tot.vat)}</b></div>
      <div><span>합계(VAT 포함)</span><b>${L.fmt(tot.total)}</b></div>
      <span class="sep"></span>
      <div><span>매입 합계</span><b>${L.fmt(tot.cost)}</b></div>
      <div><span>GP</span><b>${L.fmt(tot.gp)}</b></div>
      <div><span>GP%</span><b class=${tot.rate !== null && tot.rate < low ? 'gp-low' : ''}>${L.pct(tot.rate)}</b></div>
      ${tot.missingCost ? html`<span class="chip warn">매입가 없는 품목 ${tot.missingCost}개</span>` : null}
    </div>

    <div class="grid2" style="align-items:start">
      <section class="panel">
        <div class="panel-h"><h3>견적 정보</h3></div>
        <div class="panel-b stack">
          <div class="grid2">
            <${Field} label="견적일자"><input id="s-date" type="date" class="input" value=${s.date || L.today()} onInput=${(e) => up((x) => { x.sales.date = e.target.value; })} /><//>
            <${Field} label="유효기간"><input id="s-valid" class="input" value=${s.validity || ''} onInput=${(e) => up((x) => { x.sales.validity = e.target.value; })} /><//>
          </div>
          <${Field} label="견적서 상단 담당자"><select id="s-rep" class="select" value=${p.repId || (settings.reps[0] && settings.reps[0].id)} onChange=${(e) => { lsSet('uq.rep', e.target.value); up((x) => { x.repId = e.target.value; }); }}>${settings.reps.map((r) => html`<option key=${r.id} value=${r.id}>${repLabel(r) || '(이름 없음)'}</option>`)}</select><//>
          <div class="stack s8">
            <b class="small">견적 조건</b>
            ${(s.conditions || []).map((c, j) => html`<div key=${j} class="row" style="flex-wrap:nowrap"><span class="faint small num" style="width:16px">${j + 1}.</span><input class="input" aria-label="견적 조건" value=${c} onInput=${(e) => up((x) => { x.sales.conditions[j] = e.target.value; })} /><button class="btn ghost icon sm" aria-label="삭제" onClick=${() => up((x) => { x.sales.conditions.splice(j, 1); })}><${Icon} name="x" size=${14} /></button></div>`)}
            <div><button class="btn ghost sm" onClick=${() => up((x) => { x.sales.conditions = (x.sales.conditions || []).concat(['']); })}><${Icon} name="plus" size=${14} />조건 추가</button></div>
          </div>
        </div>
      </section>
      <section class="panel">
        <div class="panel-h"><h3>주석</h3><span class="sub">고객 요청과 달라진 점과 사유</span></div>
        <div class="panel-b stack s8">
          ${(s.notes || []).map((n, j) => html`<div key=${n.id || j} class="stack s8" style="gap:4px;padding-bottom:8px;border-bottom:1px dashed var(--line)">
            <div class="row" style="flex-wrap:nowrap"><span class="faint small num" style="width:16px">${j + 1}.</span><input class="input" aria-label="주석 제목" value=${n.title} placeholder="예) GPU 모델 변경 (A → B)" onInput=${(e) => up((x) => { x.sales.notes[j].title = e.target.value; })} /><button class="btn ghost icon sm" aria-label="삭제" onClick=${() => up((x) => { x.sales.notes.splice(j, 1); })}><${Icon} name="x" size=${14} /></button></div>
            <div class="row" style="flex-wrap:nowrap;padding-left:24px"><span class="xs faint nowrap">사유</span><input class="input" aria-label="사유" value=${n.reason} placeholder=${n.reason ? '' : '사유를 적어 주세요'} onInput=${(e) => up((x) => { x.sales.notes[j].reason = e.target.value; })} /></div>
          </div>`)}
          ${!(s.notes || []).length ? html`<p class="small muted">주석이 없으면 견적서에서 이 칸이 빠집니다.</p>` : null}
          <div class="row">
            <button class="btn ghost sm" onClick=${() => up((x) => { x.sales.notes = (x.sales.notes || []).concat([{ id: L.uid('n'), title: '', reason: '' }]); })}><${Icon} name="plus" size=${14} />주석 추가</button>
            ${devs.length ? html`<button class="btn sm" onClick=${() => up((x) => { x.sales.notes = (x.sales.notes || []).concat(L.collectDeviations(x).filter((d) => !(x.sales.notes || []).some((n) => n.title === d.title))); })}>매입 검토의 변경 사항 ${devs.length}건 가져오기</button>` : null}
          </div>
        </div>
      </section>
    </div>

    <section class="stack s8">
      <div class="section-title"><h3>견적서 미리보기</h3>
        <div class="row">
          <button class="btn primary" disabled=${!!busy} onClick=${() => doExport('xlsx')}>${busy === 'xlsx' ? html`<span class="spin"></span>` : html`<${Icon} name="dl" />`}엑셀(.xlsx)</button>
          <button class="btn" disabled=${!!busy} onClick=${() => doExport('pdf')}>${busy === 'pdf' ? html`<span class="spin"></span>` : html`<${Icon} name="dl" />`}PDF</button>
        </div>
      </div>
      <div class="docwrap"><${ScaledDoc}><${QuoteDoc} data=${doc} /><//></div>
    </section>
    <${StepNav} prev="매입 검토" onPrev=${() => go(4)} next="원가분석표" onNext=${() => go(6)} />
  </div>`;
}

/* ===================== 6. 원가분석표 ===================== */
function StepCost({ p, up, settings, go }) {
  const lines = (p.sales && p.sales.lines) || [];
  const rows = L.costRows(lines);
  const tot = L.salesTotals(lines);
  const vs = L.vendorSummary(rows);
  const low = (L.num(settings.defaults.lowGp) || 0) / 100;
  const lowRows = rows.filter((r) => r.rate !== null && r.rate < low);
  const noCost = rows.filter((r) => r.cost === null);
  const [busy, setBusy] = useState(false);
  async function doExport() {
    setBusy(true);
    try { await exportCostXlsx(p, settings); } catch (e) { toast((e && e.message) || '파일을 만들지 못했습니다', 'bad'); } finally { setBusy(false); }
  }
  if (!lines.length) return html`<div class="stack s16"><div class="panel"><div class="empty"><h3>매출 견적서가 아직 없습니다</h3><span class="small">5단계에서 매출 견적서를 만들면 원가분석표가 자동으로 채워집니다.</span><button class="btn primary" onClick=${() => go(5)}>매출 견적서로 가기</button></div></div></div>`;
  return html`<div class="stack s16">
    <div class="kpis">
      <div class="kpi"><span>매출 합계</span><b>${L.fmt(tot.supply)}</b><small>부가세 별도</small></div>
      <div class="kpi"><span>매입 합계</span><b>${L.fmt(tot.cost)}</b><small>${vs.length}개 매입처</small></div>
      <div class="kpi"><span>GP</span><b>${L.fmt(tot.gp)}</b><small>매출 − 매입</small></div>
      <div class="kpi accent"><span>GP%</span><b class=${tot.rate !== null && tot.rate < low ? 'gp-low' : ''}>${L.pct(tot.rate)}</b><small>GP ÷ 매출</small></div>
    </div>
    ${noCost.length ? html`<div class="note warn">매입가가 없는 품목 ${noCost.length}개(${noCost.map((r) => r.no).join(', ')}번)는 원가 0으로 계산됐습니다. 5단계에서 매입 단가를 넣어 주세요.</div>` : null}
    ${lowRows.length ? html`<div class="note bad">GP% ${L.fmt(low * 100)}% 미만 품목: ${lowRows.map((r) => r.no + '번 ' + (r.category || r.name) + ' (' + L.pct(r.rate) + ')').join(', ')}</div>` : null}
    <section class="stack s8">
      <div class="section-title"><h3>품목별 원가 분석</h3><button class="btn primary" disabled=${busy} onClick=${doExport}>${busy ? html`<span class="spin"></span>` : html`<${Icon} name="dl" />`}원가분석표 엑셀</button></div>
      <div class="tbl-wrap"><table class="tbl" style="min-width:1180px">
        <thead><tr><th class="center">No</th><th>매출 품목</th><th>품명</th><th class="num">수량</th><th class="num">매출 단가</th><th class="num">매출 금액</th><th>매입처</th><th>매입 품목</th><th class="num">매입 단가</th><th class="num">매입 금액</th><th class="num">GP</th><th class="num">GP%</th></tr></thead>
        <tbody>${rows.map((r) => html`<tr key=${r.no} class=${r.cost === null ? 'flag-warn' : r.rate !== null && r.rate < low ? 'flag-bad' : ''}>
          <td class="idx" style="padding-top:6px">${r.no}</td><td>${r.category}</td><td>${r.name}</td><td class="num">${r.qty}</td>
          <td class="num">${L.fmt(r.price)}</td><td class="num">${L.fmt(r.amount)}</td><td>${r.vendor || html`<span class="faint">-</span>`}</td><td class="small" style="min-width:180px;max-width:260px;white-space:normal">${r.costItem || html`<span class="faint">-</span>`}</td>
          <td class="num">${r.cost === null ? html`<span style="color:var(--warn)">없음</span>` : L.fmt(r.cost)}</td><td class="num">${L.fmt(r.costAmount)}</td><td class="num">${L.fmt(r.gp)}</td>
          <td class=${'num ' + (r.rate !== null && r.rate < low ? 'gp-low' : '')}>${L.pct(r.rate)}</td></tr>`)}</tbody>
        <tfoot><tr><td colspan="5" class="center">합계</td><td class="num">${L.fmt(tot.supply)}</td><td colspan="3"></td><td class="num">${L.fmt(tot.cost)}</td><td class="num">${L.fmt(tot.gp)}</td><td class="num">${L.pct(tot.rate)}</td></tr></tfoot>
      </table></div>
    </section>
    <section class="stack s8">
      <div class="section-title"><h3>매입처별 합계</h3><span class="hint">발주 금액 확인용 (공급가 + 부가세)</span></div>
      <div class="tbl-wrap"><table class="tbl" style="min-width:640px">
        <thead><tr><th>매입처</th><th class="num">품목 수</th><th class="num">매입 금액</th><th class="num">부가세</th><th class="num">합계</th><th class="num">해당 매출</th></tr></thead>
        <tbody>${vs.map((v) => html`<tr key=${v.vendor}><td>${v.vendor}</td><td class="num">${v.count}</td><td class="num">${L.fmt(v.costAmount)}</td><td class="num">${L.fmt(v.vat)}</td><td class="num">${L.fmt(v.total)}</td><td class="num">${L.fmt(v.sales)}</td></tr>`)}</tbody>
      </table></div>
    </section>
    <section class="panel"><div class="panel-b row" style="justify-content:space-between">
      <div class="stack s8" style="gap:2px"><b>진행 상태</b><span class="small muted">고객에게 견적을 보냈거나 결과가 나오면 표시하세요. 목록에서 구분됩니다.</span></div>
      <div class="row">
        ${[['active', '작성 중'], ['submitted', '제출 완료'], ['won', '수주'], ['lost', '실주']].map((x) => html`<button key=${x[0]} class=${'btn sm ' + ((p.status || 'active') === x[0] ? 'primary' : '')} onClick=${() => up((y) => { y.status = x[0]; })}>${x[1]}</button>`)}
      </div>
    </div></section>
    <${StepNav} prev="매출 견적서" onPrev=${() => go(5)} />
  </div>`;
}
