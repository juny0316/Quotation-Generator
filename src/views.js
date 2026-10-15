/* ===== 화면: 작업 영역 · 목록 · 매입처 · 설정 · 앱 ===== */
function projectSummary(p) {
  const tot = L.salesTotals((p.sales && p.sales.lines) || []);
  const st = L.stageOf(p);
  return {
    no: p.no || '', title: p.title || '', customer: (p.customer && p.customer.company) || '',
    status: p.status || 'active', stage: st.key, stageLabel: st.label,
    supply: tot.supply || 0, gpRate: tot.rate, items: (p.items || []).length,
    repId: p.repId || null, createdBy: p.createdBy || null,
    createdAt: p.createdAt || Date.now(), updatedAt: p.updatedAt || Date.now()
  };
}
function normalizeProject(d, id) {
  const p = Object.assign({ id: id, title: '', customer: {}, request: { raw: '' }, items: [], conditions: {}, questions: [], rfq: { targets: [], sent: [] }, quotes: [], adopt: {}, sales: null, status: 'active' }, d || {});
  p.id = id;
  return p;
}
async function saveProjectDocs(p) {
  await Promise.all([Store.set('projectData/' + p.id, p), Store.set('projects/' + p.id, projectSummary(p))]);
}

const STAGE_CHIP = { new: '', items: 'info', rfq: 'warn', review: 'warn', sales: 'brand', submitted: 'brand', won: 'ok', lost: 'bad' };

/* ---------- 작업 영역 ---------- */
function Workspace({ id, settings, vendors, saveVendor, onClose, onDeleted, summaries }) {
  const [p, setP] = useState(null);
  const [missing, setMissing] = useState(false);
  const [step, setStep] = useState(null);
  const dirty = useRef(false), timer = useRef(null), latest = useRef(null), saving = useRef(null);
  const top = useRef(null);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const cur = latest.current;
    if (!cur) return saving.current || Promise.resolve();
    latest.current = null;
    saving.current = saveProjectDocs(cur).catch((e) => { toast('저장하지 못했습니다' + (e && e.code ? ' (' + e.code + ')' : ''), 'bad'); })
      .finally(() => { if (!latest.current) dirty.current = false; });
    return saving.current;
  }, []);

  useEffect(() => {
    setP(null); setMissing(false); setStep(null); dirty.current = false;
    const unsub = Store.watchDoc('projectData/' + id, (data) => {
      if (dirty.current) return;
      if (!data) { setMissing(true); return; }
      const np = normalizeProject(data, id);
      setP(np);
      setStep((s) => s || suggestStep(np));
    }, () => setMissing(true));
    const hide = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', hide);
    return () => { flush(); unsub(); document.removeEventListener('visibilitychange', hide); };
  }, [id]);

  const up = useCallback((fn) => {
    setP((prev) => {
      if (!prev) return prev;
      const next = clone(prev);
      fn(next);
      next.updatedAt = Date.now();
      latest.current = next;
      dirty.current = true;
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, 650);
      return next;
    });
  }, []);

  const go = (n) => { setStep(n); if (top.current) top.current.scrollIntoView({ block: 'start', behavior: 'smooth' }); };

  if (missing) return html`<div class="panel"><div class="empty"><h3>견적을 찾을 수 없습니다</h3><span class="small">삭제되었거나 아직 불러오는 중입니다.</span><button class="btn" onClick=${onClose}>목록으로</button></div></div>`;
  if (!p) return html`<div class="stack"><div class="skeleton" style="width:40%;height:28px"></div><div class="skeleton" style="height:56px"></div><div class="skeleton" style="height:240px"></div></div>`;

  const st = L.stageOf(p);
  const tot = L.salesTotals((p.sales && p.sales.lines) || []);
  const props = { p: p, up: up, settings: settings, vendors: vendors, go: go, saveVendor: saveVendor };
  const S = [StepRequest, StepItems, StepRfq, StepQuotes, StepSales, StepCost][(step || 1) - 1];

  async function duplicate() {
    await flush();
    const nid = L.uid('p');
    const ymd = L.today();
    const np = clone(p);
    np.id = nid;
    np.no = L.nextQuoteNo(settings.defaults.prefix, ymd, summaries.map((s) => s.no));
    np.title = (p.title || '') + ' (복사)';
    np.status = 'active';
    np.rfq = { targets: (p.rfq && p.rfq.targets) || [], sent: [] };
    np.createdAt = Date.now(); np.updatedAt = Date.now(); np.createdBy = RT.uid || null;
    await saveProjectDocs(np);
    toast('복사본을 만들었습니다 · ' + np.no);
    onClose(nid);
  }

  return html`<div class="work-inner" ref=${top}>
    <div class="phead">
      <div class="ttl">
        <div class="meta">
          <button class="btn ghost sm back" onClick=${() => onClose()}><${Icon} name="back" size=${14} />목록</button>
          <span class="mono">${p.no}</span>
          <span class=${'chip ' + (STAGE_CHIP[st.key] || '')}>${st.label}</span>
          ${p.customer && p.customer.company ? html`<span>${p.customer.company}</span>` : null}
          ${tot.supply ? html`<span class="faint">·</span><span class="num">${L.fmt(tot.supply)}원</span><span class="faint">GP ${L.pct(tot.rate)}</span>` : null}
        </div>
        <input class="ttl-input" aria-label="건명" value=${p.title} placeholder="건명을 입력하세요" onInput=${(e) => up((x) => { x.title = e.target.value; })} />
      </div>
      <div class="tools">
        <button class="btn sm" onClick=${duplicate}><${Icon} name="copy" size=${14} />복사본 만들기</button>
        <${ConfirmBtn} small label="견적 삭제" icon="trash" className="ghost" confirmLabel="이 견적 삭제" onConfirm=${async () => {
          clearTimeout(timer.current); latest.current = null; dirty.current = true;
          try { await Promise.all([Store.del('projectData/' + p.id), Store.del('projects/' + p.id)]); toast('삭제했습니다'); onDeleted(); }
          catch (e) { toast('삭제하지 못했습니다', 'bad'); dirty.current = false; }
        }} />
      </div>
    </div>
    <nav class="stepper" aria-label="진행 단계">${STEPS.map((s) => html`<button key=${s.n} class=${'step' + (stepDone(p, s.n) ? ' done' : '')} aria-current=${step === s.n ? 'step' : undefined} onClick=${() => go(s.n)}>
      <span class="n">${stepDone(p, s.n) && step !== s.n ? html`<${Icon} name="check" size=${13} />` : s.n}</span>
      <span class="lb"><b>${s.title}</b><small>${s.sub}</small></span></button>`)}</nav>
    <${S} ...${props} />
  </div>`;
}

/* ---------- 견적 목록 ---------- */
function ProjectList({ list, openId, onOpen, onNew, creating }) {
  const [q, setQ] = useState('');
  const [f, setF] = useState('all');
  const items = (list || []).filter((s) => {
    if (f === 'open' && (s.status === 'won' || s.status === 'lost')) return false;
    if (f === 'done' && !(s.status === 'won' || s.status === 'lost' || s.status === 'submitted')) return false;
    if (!q) return true;
    return (s.no + ' ' + s.title + ' ' + s.customer).toLowerCase().includes(q.toLowerCase());
  });
  return html`<aside class="plist">
    <div class="plist-h">
      <button class="btn primary" onClick=${onNew} disabled=${creating}><${Icon} name="plus" />새 견적</button>
      <input class="input" aria-label="견적 검색" placeholder="고객사 · 건명 · 견적번호" value=${q} onInput=${(e) => setQ(e.target.value)} />
      <div class="row tight">${[['all', '전체'], ['open', '진행 중'], ['done', '제출·완료']].map((x) => html`<button key=${x[0]} class=${'btn sm ' + (f === x[0] ? 'primary' : 'ghost')} onClick=${() => setF(x[0])}>${x[1]}</button>`)}</div>
    </div>
    <div class="plist-items">
      ${list === null ? html`<div class="stack" style="padding:10px">${[1, 2, 3].map((k) => html`<div key=${k} class="skeleton" style="height:44px"></div>`)}</div>` : null}
      ${list && !items.length ? html`<div class="empty" style="padding:28px 12px"><b>${(list || []).length ? '조건에 맞는 견적이 없습니다' : '아직 견적이 없습니다'}</b><span class="small">${(list || []).length ? '' : '[새 견적]을 눌러 고객 요청을 붙여넣는 것부터 시작하세요.'}</span></div>` : null}
      ${items.map((s) => html`<button key=${s.id} class="pitem" aria-current=${openId === s.id ? 'true' : 'false'} onClick=${() => onOpen(s.id)}>
        <div class="top"><span class="mono xs faint">${s.no}</span><span class=${'chip ' + (STAGE_CHIP[s.stage] || '')} style="height:19px;font-size:11px">${s.stageLabel || ''}</span></div>
        <div class="t">${s.title || '(건명 없음)'}</div>
        <div class="m"><span>${s.customer || '고객사 미입력'}</span><span class="num">${s.supply ? L.fmt(s.supply) + ' · ' + L.pct(s.gpRate) : ''}</span></div>
      </button>`)}
    </div>
  </aside>`;
}

/* ---------- 매입처 ---------- */
function VendorsView({ vendors, saveVendor, delVendor }) {
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [edit, setEdit] = useState({});
  const list = (vendors || []).filter((v) => !q || JSON.stringify(v).toLowerCase().includes(q.toLowerCase()));
  const val = (v, k) => (edit[v.id] && edit[v.id][k] !== undefined ? edit[v.id][k] : (v[k] || ''));
  const pend = useRef({});
  const timers = useRef({});
  const setE = (v, k, x) => {
    pend.current[v.id] = Object.assign({}, pend.current[v.id] || {}, { [k]: x });
    setEdit((e) => Object.assign({}, e, { [v.id]: Object.assign({}, e[v.id] || {}, { [k]: x }) }));
    clearTimeout(timers.current[v.id]);
    timers.current[v.id] = setTimeout(() => { const patch = pend.current[v.id]; delete pend.current[v.id]; saveVendor(Object.assign({}, v, patch)); }, 700);
  };
  return html`<div class="page"><div class="page-inner">
    <div class="page-title"><div class="stack s8" style="gap:2px"><h2>매입처</h2><span class="muted small">견적 요청 메일의 받는 사람이 됩니다. 참조(CC)는 여러 개를 ; 로 구분하세요.</span></div>
      <div class="row"><input class="input" style="width:240px" aria-label="매입처 검색" placeholder="검색" value=${q} onInput=${(e) => setQ(e.target.value)} /><button class="btn primary" onClick=${() => setAdding(true)}><${Icon} name="plus" />매입처 추가</button></div></div>
    ${adding ? html`<${VendorQuickAdd} onCancel=${() => setAdding(false)} onSave=${async (v) => { await saveVendor(v); setAdding(false); }} />` : null}
    <div class="tbl-wrap"><table class="tbl" style="min-width:1000px">
      <thead><tr><th style="width:16%">업체명</th><th style="width:11%">담당자</th><th style="width:19%">이메일</th><th style="width:16%">참조(CC)</th><th style="width:12%">연락처</th><th>취급 품목 · 메모</th><th style="width:60px"></th></tr></thead>
      <tbody>${list.map((v) => html`<tr key=${v.id}>
        ${['name', 'contact', 'email', 'cc', 'phone', 'category'].map((k) => html`<td key=${k}><input class="input" aria-label=${k} value=${val(v, k)} onInput=${(e) => setE(v, k, e.target.value)} /></td>`)}
        <td><${ConfirmBtn} small icon="trash" label="매입처 삭제" onConfirm=${() => delVendor(v.id)} /></td>
      </tr>`)}
      ${!list.length ? html`<tr><td colspan="7"><div class="empty"><b>${(vendors || []).length ? '검색 결과가 없습니다' : '등록된 매입처가 없습니다'}</b></div></td></tr>` : null}</tbody>
    </table></div>
  </div></div>`;
}

/* ---------- 설정 ---------- */
function SettingsView({ settings, saveSettings }) {
  const [s, setS] = useState(() => clone(settings));
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (!dirty) setS(clone(settings)); }, [settings]);
  const ch = (fn) => { setS((x) => { const n = clone(x); fn(n); return n; }); setDirty(true); };
  const save = async () => { const out = clone(s); delete out._saved; await saveSettings(out); setDirty(false); toast('설정을 저장했습니다'); };
  const logoIn = useRef(null);
  async function pickLogo(file) {
    if (!file) return;
    const url = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(file); });
    const img = new Image();
    await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = url; });
    const w = Math.min(480, img.width), hh = Math.round(img.height * w / img.width);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = hh;
    cv.getContext('2d').drawImage(img, 0, 0, w, hh);
    ch((x) => { x.logo = cv.toDataURL('image/png'); });
  }
  const co = s.company, df = s.defaults, ml = s.mail;
  return html`<div class="page"><div class="page-inner">
    <div class="page-title"><div class="stack s8" style="gap:2px"><h2>설정</h2><span class="muted small">모든 견적서·요청 메일에 함께 쓰입니다. 바꾼 뒤 [저장]을 누르세요.</span></div>
      <div class="row">${dirty ? html`<span class="chip warn">저장 안 됨</span>` : !settings._saved ? html`<span class="chip info">기본값 사용 중</span>` : null}<button class="btn primary" disabled=${!dirty} onClick=${save}>저장</button></div></div>

    <section class="panel"><div class="panel-h"><h3>견적서 공급자 정보</h3><span class="sub">견적서 오른쪽 위 블록</span></div>
      <div class="panel-b grid2">
        <${Field} label="상호"><input id="co-name" class="input" value=${co.name} onInput=${(e) => ch((x) => { x.company.name = e.target.value; })} /><//>
        <${Field} label="회사 약칭" hint="메일 제목·서명"><input id="co-short" class="input" value=${co.short} onInput=${(e) => ch((x) => { x.company.short = e.target.value; })} /><//>
        <${Field} label="주소 1행"><input id="co-a1" class="input" value=${co.address1} onInput=${(e) => ch((x) => { x.company.address1 = e.target.value; })} /><//>
        <${Field} label="주소 2행"><input id="co-a2" class="input" value=${co.address2} onInput=${(e) => ch((x) => { x.company.address2 = e.target.value; })} /><//>
        <${Field} label="대표이사 줄" className="span2"><input id="co-ceo" class="input" value=${co.ceoLine} onInput=${(e) => ch((x) => { x.company.ceoLine = e.target.value; })} /><//>
        <div class="row span2">
          <div class="logo-plate" style="background:#fff;border:1px solid var(--line);border-radius:6px;padding:8px 12px"><img src=${s.logo || LOGO_DATA} alt="로고" style="height:30px;display:block" /></div>
          <button class="btn sm" onClick=${() => logoIn.current && logoIn.current.click()}>로고 바꾸기</button>
          ${s.logo ? html`<button class="btn ghost sm" onClick=${() => ch((x) => { x.logo = null; })}>기본 로고로</button>` : null}
          <input ref=${logoIn} type="file" accept="image/png,image/jpeg" hidden onChange=${(e) => { pickLogo(e.target.files[0]); e.target.value = ''; }} />
        </div>
      </div></section>

    <section class="panel"><div class="panel-h"><h3>영업대표</h3><span class="sub">견적서 맨 위 연락처 줄과 요청 메일 서명</span></div>
      <div class="panel-b stack">
        ${s.reps.map((r, i) => html`<div key=${r.id} class="stack s8" style="padding-bottom:12px;border-bottom:1px dashed var(--line)">
          <div class="grid4">
            <${Field} label="이름"><input class="input" value=${r.name} onInput=${(e) => ch((x) => { x.reps[i].name = e.target.value; })} /><//>
            <${Field} label="직급"><input class="input" value=${r.title} onInput=${(e) => ch((x) => { x.reps[i].title = e.target.value; })} /><//>
            <${Field} label="TEL"><input class="input" value=${r.tel} onInput=${(e) => ch((x) => { x.reps[i].tel = e.target.value; })} /><//>
            <${Field} label="FAX"><input class="input" value=${r.fax} onInput=${(e) => ch((x) => { x.reps[i].fax = e.target.value; })} /><//>
            <${Field} label="Mobile"><input class="input" value=${r.mobile} onInput=${(e) => ch((x) => { x.reps[i].mobile = e.target.value; })} /><//>
            <${Field} label="e-mail" className="span2"><input class="input" value=${r.email} onInput=${(e) => ch((x) => { x.reps[i].email = e.target.value; })} /><//>
            <div class="row" style="align-items:flex-end">${s.reps.length > 1 ? html`<button class="btn ghost sm" onClick=${() => ch((x) => { x.reps.splice(i, 1); })}>이 담당자 삭제</button>` : null}</div>
          </div>
          <div class="xs faint">미리보기: ${contactLine(r)}</div>
        </div>`)}
        <div><button class="btn sm" onClick=${() => ch((x) => { x.reps.push({ id: L.uid('rep'), name: '', title: '', tel: x.reps[0] ? x.reps[0].tel : '', fax: x.reps[0] ? x.reps[0].fax : '', mobile: '', email: '' }); })}><${Icon} name="plus" size=${14} />담당자 추가</button></div>
      </div></section>

    <section class="panel"><div class="panel-h"><h3>견적 기본값</h3></div>
      <div class="panel-b grid3">
        <${Field} label="기본 GP%" hint="매출 대비"><${NumInput} id="df-gp" decimals=${1} value=${df.gpRate} onChange=${(v) => ch((x) => { x.defaults.gpRate = v; })} /><//>
        <${Field} label="제안 단가 올림 단위"><select id="df-round" class="select" value=${String(df.priceRound)} onChange=${(e) => ch((x) => { x.defaults.priceRound = Number(e.target.value); })}>${[1, 10, 100, 1000, 10000].map((u) => html`<option key=${u} value=${String(u)}>${L.fmt(u)}원 단위</option>`)}</select><//>
        <${Field} label="GP% 경고 기준" hint="이 값 미만 빨간색"><${NumInput} id="df-low" decimals=${1} value=${df.lowGp} onChange=${(v) => ch((x) => { x.defaults.lowGp = v; })} /><//>
        <${Field} label="견적번호 앞글자"><input id="df-prefix" class="input" value=${df.prefix} onInput=${(e) => ch((x) => { x.defaults.prefix = e.target.value.replace(/[^A-Za-z0-9가-힣]/g, ''); })} /><//>
        <${Field} label="회신 요청 기한" hint="영업일"><${NumInput} id="df-reply" value=${df.replyDays} onChange=${(v) => ch((x) => { x.defaults.replyDays = v; })} /><//>
        <${Field} label="유효기간 문구"><input id="df-valid" class="input" value=${df.validity} onInput=${(e) => ch((x) => { x.defaults.validity = e.target.value; })} /><//>
        <${Field} label="기본 견적 조건" hint="한 줄에 하나" className="span2"><${AutoText} id="df-cond" minRows=${3} value=${(df.conditions || []).join('\n')} onInput=${(v) => ch((x) => { x.defaults.conditions = v.split('\n'); })} /><//>
      </div></section>

    <section class="panel"><div class="panel-h"><h3>견적 요청 메일 문구</h3><span class="sub">{매입처} {담당자} {회사} {보내는사람} {건명} {요청번호} {회신기한} 을 쓸 수 있습니다</span></div>
      <div class="panel-b stack">
        <${Field} label="제목"><input id="ml-subj" class="input" value=${ml.subject} onInput=${(e) => ch((x) => { x.mail.subject = e.target.value; })} /><//>
        <${Field} label="인사말"><${AutoText} id="ml-greet" minRows=${3} value=${ml.greeting} onInput=${(v) => ch((x) => { x.mail.greeting = v; })} /><//>
        <${Field} label="요청 사항" hint="한 줄에 하나 — 메일과 견적요청서에 목록으로 들어갑니다"><${AutoText} id="ml-req" minRows=${3} value=${ml.requests} onInput=${(v) => ch((x) => { x.mail.requests = v; })} /><//>
        <${Field} label="맺음말"><input id="ml-close" class="input" value=${ml.closing} onInput=${(e) => ch((x) => { x.mail.closing = e.target.value; })} /><//>
      </div></section>
    <div class="row" style="justify-content:flex-end"><button class="btn primary" disabled=${!dirty} onClick=${save}>저장</button></div>
  </div></div>`;
}

/* ---------- 앱 ---------- */
function App() {
  const [ready, setReady] = useState(false);
  const [view, setView] = useState(() => lsGet('uq.view', 'projects'));
  const [list, setList] = useState(null);
  const [vendors, setVendors] = useState(null);
  const [sdoc, setSdoc] = useState(undefined);
  const [openId, setOpenId] = useState(() => lsGet('uq.open', null));
  const [ss, setSs] = useState({ pending: 0, error: null, mode: 'init' });
  const [creating, setCreating] = useState(false);

  const [auth, setAuth] = useState('checking'); // checking | need | ok | local
  useEffect(() => {
    RT.onUnauthorized = () => setAuth('need');
    (async () => {
      try {
        const r = await fetch('/api/login', { credentials: 'same-origin' });
        if (!r.ok) throw new Error('no api');
        const j = await r.json();
        setAuth(j.authed ? 'ok' : 'need');
      } catch (e) { setAuth('local'); }
    })();
  }, []);
  useEffect(() => {
    if (auth !== 'ok' && auth !== 'local') return;
    let unsubs = [];
    (async () => {
      if (auth === 'ok') {
        Store.init('api');
        RT.sample = AI.serverSample;
        RT.imageLimits = (await AI.serverSample.limits()).images;
      } else {
        Store.init(null);
        RT.sample = null;
      }
      RT.ready = true; RT.mode = auth === 'ok' ? 'api' : 'local';
      unsubs.push(Store.onStatus(setSs));
      unsubs.push(Store.watchCol('projects', { orderBy: 'updatedAt', dir: 'desc', limit: 300 }, (rows) => setList(rows), (e) => { console.warn(e); setList([]); }));
      unsubs.push(Store.watchCol('vendors', { orderBy: 'name' }, (rows) => setVendors(rows), () => setVendors([])));
      unsubs.push(Store.watchDoc('settings/main', (d) => setSdoc(d), () => setSdoc(null)));
      setReady(true);
    })();
    return () => unsubs.forEach((u) => u && u());
  }, [auth === 'ok' || auth === 'local' ? auth : 'wait']);

  useEffect(() => { lsSet('uq.view', view); }, [view]);
  useEffect(() => { lsSet('uq.open', openId); }, [openId]);

  const settings = useMemo(() => mergeSettings(sdoc || null), [sdoc]);

  const saveVendor = useCallback(async (v) => {
    const id = v.id || L.uid('v');
    const doc = { name: str(v.name), contact: str(v.contact), email: str(v.email), cc: str(v.cc), phone: str(v.phone), category: str(v.category), updatedAt: Date.now() };
    try { await Store.set('vendors/' + id, doc); if (!v.id) toast('매입처를 저장했습니다 · ' + doc.name); return id; }
    catch (e) { toast('매입처를 저장하지 못했습니다', 'bad'); return null; }
  }, []);
  const delVendor = useCallback(async (id) => { try { await Store.del('vendors/' + id); toast('삭제했습니다'); } catch (e) { toast('삭제하지 못했습니다', 'bad'); } }, []);
  const saveSettings = useCallback(async (s) => { try { await Store.set('settings/main', s); } catch (e) { toast('설정을 저장하지 못했습니다', 'bad'); } }, []);

  async function newProject() {
    setCreating(true);
    try {
      const id = L.uid('p');
      const ymd = L.today();
      const lastRep = lsGet('uq.rep', null);
      const p = normalizeProject({
        no: L.nextQuoteNo(settings.defaults.prefix, ymd, (list || []).map((s) => s.no)),
        title: '', status: 'active', repId: (settings.reps.find((r) => r.id === lastRep) || settings.reps[0] || {}).id || null,
        createdAt: Date.now(), updatedAt: Date.now(), createdBy: RT.uid || null
      }, id);
      await saveProjectDocs(p);
      setView('projects');
      setOpenId(id);
    } catch (e) { toast('새 견적을 만들지 못했습니다', 'bad'); }
    finally { setCreating(false); }
  }

  const listReady = list !== null;

  const saveLabel = ss.mode === 'local' ? '이 브라우저에만 저장' : ss.error ? '저장 실패 — 다시 시도 중' : ss.pending ? '저장 중…' : '저장됨';
  const saveCls = ss.mode === 'local' ? 'local' : ss.error ? 'err' : ss.pending ? 'busy' : '';

  if (auth === 'checking' || auth === 'need') return html`<${Fragment}><${LoginScreen} checking=${auth === 'checking'} onOk=${() => { if (ready) location.reload(); else setAuth('ok'); }} /><${Toasts} /><//>`;

  return html`<${Fragment}>
    <header class="topbar">
      <div class="brand"><span class="logo-plate"><img src=${settings.logo || LOGO_DATA} alt="유니포인트" /></span><b>견적서 생성기</b></div>
      <nav class="nav" aria-label="메뉴">
        ${[['projects', '견적'], ['vendors', '매입처'], ['settings', '설정']].map((x) => html`<button key=${x[0]} aria-current=${view === x[0] ? 'page' : undefined} onClick=${() => setView(x[0])}>${x[1]}</button>`)}
      </nav>
      <span class="spacer"></span>
      ${auth === 'ok' ? html`<button class="btn ghost sm" onClick=${async () => { await fetch('/api/login', { method: 'DELETE' }); location.reload(); }}>잠금</button>` : null}
      ${ready ? html`<span class=${'savestate ' + saveCls} title=${ss.mode === 'local' ? '서버에 연결되지 않아 이 브라우저에만 저장됩니다' : ''}><i></i><span>${saveLabel}</span></span>` : null}
    </header>
    ${!ready ? html`<div class="page"><div class="page-inner"><div class="skeleton" style="width:30%;height:24px"></div><div class="skeleton" style="height:180px"></div></div></div>` : null}
    ${ready && view === 'projects' ? html`<div class=${'split' + (openId ? ' has-open' : '')}>
      <${ProjectList} list=${list} openId=${openId} onOpen=${setOpenId} onNew=${newProject} creating=${creating} />
      <section class="work">
        ${openId ? html`<${Workspace} key=${openId} id=${openId} settings=${settings} vendors=${vendors || []} saveVendor=${saveVendor} summaries=${list || []}
            onClose=${(nid) => setOpenId(nid || null)} onDeleted=${() => setOpenId(null)} />`
          : html`<div class="work-inner"><${Welcome} list=${list} onNew=${newProject} onOpen=${setOpenId} creating=${creating} /></div>`}
      </section>
    </div>` : null}
    ${ready && view === 'vendors' ? html`<${VendorsView} vendors=${vendors} saveVendor=${saveVendor} delVendor=${delVendor} />` : null}
    ${ready && view === 'settings' ? html`<${SettingsView} settings=${settings} saveSettings=${saveSettings} />` : null}
    <${Toasts} />
  <//>`;
}

function LoginScreen({ checking, onOk }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ password: pw }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok) onOk();
      else setErr(j.error === 'wrong_password' ? '비밀번호가 맞지 않습니다.' : j.error === 'not_configured' ? '서버에 비밀번호(APP_PASSWORD)가 아직 설정되지 않았습니다.' : '로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } catch (x) { setErr('서버에 연결하지 못했습니다.'); }
    finally { setBusy(false); }
  }
  return html`<div style="min-height:100vh;display:grid;place-items:center;padding-block:24px;padding-left:max(16px, env(safe-area-inset-left, 0px));padding-right:max(16px, env(safe-area-inset-right, 0px))">
    <form class="panel" style="width:min(380px,100%)" onSubmit=${submit}>
      <div class="panel-b stack s16" style="padding:28px 24px">
        <div class="row" style="gap:10px"><span class="logo-plate" style="background:#fff;border-radius:6px;padding:4px 8px;border:1px solid var(--line)"><img src=${LOGO_DATA} alt="유니포인트" style="height:22px;display:block" /></span><b style="font-size:16px">견적서 생성기</b></div>
        ${checking ? html`<div class="skeleton" style="height:36px"></div>` : html`<${Fragment}>
          <${Field} label="팀 비밀번호"><input id="login-pw" class="input" type="password" autocomplete="current-password" value=${pw} onInput=${(e) => setPw(e.target.value)} autofocus /><//>
          ${err ? html`<div class="note bad">${err}</div>` : null}
          <button class="btn primary lg" type="submit" disabled=${busy || !pw}>${busy ? html`<span class="spin"></span>` : null}들어가기</button>
          <span class="xs faint">이 브라우저에서는 30일 동안 다시 묻지 않습니다.</span>
        <//>`}
      </div>
    </form>
  </div>`;
}

function Welcome({ list, onNew, onOpen, creating }) {
  const flow = STEPS;
  const recent = (list || []).slice(0, 4);
  return html`<div class="stack s20">
    <section class="panel"><div class="panel-b stack s16" style="padding:24px">
      <div class="stack s8" style="gap:4px"><h2 style="font-size:22px;letter-spacing:-.02em">고객 요청부터 원가분석표까지 한 화면에서</h2>
        <p class="muted">서식이 제각각인 고객 요청과 매입 견적은 AI가 표로 정리하고, 매출 견적서는 유니포인트 양식 그대로 만듭니다.</p></div>
      <div class="grid3">${flow.map((s) => html`<div key=${s.n} class="row" style="flex-wrap:nowrap;align-items:flex-start;gap:10px">
        <span class="chip brand num" style="width:24px;justify-content:center;padding:0">${s.n}</span>
        <div><b>${s.title}</b><div class="small muted">${s.sub}</div></div></div>`)}</div>
      <div><button class="btn primary lg" onClick=${onNew} disabled=${creating}><${Icon} name="plus" />새 견적 시작</button></div>
    </div></section>
    ${recent.length ? html`<section class="stack s8"><div class="section-title"><h3>최근 견적</h3></div>
      <div class="grid2">${recent.map((s) => html`<button key=${s.id} class="panel" style="text-align:left;cursor:pointer;padding:14px 16px" onClick=${() => onOpen(s.id)}>
        <div class="row" style="justify-content:space-between"><span class="mono xs faint">${s.no}</span><span class=${'chip ' + (STAGE_CHIP[s.stage] || '')}>${s.stageLabel}</span></div>
        <b style="display:block;margin-top:4px">${s.title || '(건명 없음)'}</b>
        <div class="small muted">${s.customer || ''}${s.supply ? ' · ' + L.fmt(s.supply) + '원 · GP ' + L.pct(s.gpRate) : ''}</div>
      </button>`)}</div></section>` : null}
  </div>`;
}

render(html`<${App} />`, document.getElementById('app'));
