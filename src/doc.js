/* ===== 설정 기본값 · 견적서 데이터 · 미리보기 · 내보내기 ===== */
const DEFAULT_SETTINGS = {
  company: {
    name: '㈜ 유니포인트',
    short: '유니포인트',
    address1: '경기도 과천시 과천대로 12길 117,',
    address2: '과천지식정보타운 펜타원 D동 7F, 8F',
    ceoLine: '대 표 이 사 : 안국필, 정우천      (직인생략)'
  },
  reps: [{ id: 'rep1', name: '홍길동', title: '선임', tel: '02 - 6676 - 5500', fax: '02 - 6676 - 5599', mobile: '010-1234-5678', email: 'example@unipoint.co.kr' }],
  defaults: {
    gpRate: 10,
    priceRound: 1000,
    validity: '견적일자로부터 7일 이내',
    conditions: ['본 제안가는 금번 프로젝트에 한함.', '무상유지보수 기간 : HW - 3년'],
    replyDays: 2,
    prefix: 'UP',
    lowGp: 5
  },
  mail: {
    subject: '[{회사}] 견적 요청 - {건명} ({요청번호})',
    greeting: '{매입처} {담당자}님, 안녕하세요.\n{회사} {보내는사람}입니다.\n\n아래 품목에 대한 견적을 요청드립니다.',
    requests: '부가세 별도 단가로 회신 부탁드립니다.\n견적 유효기간, 납기, 무상 유지보수 조건을 함께 적어 주세요.\n요청 사양과 다른 모델·수량으로 제안하시는 경우 변경 사유를 함께 적어 주세요.\n첨부한 견적요청서의 노란 칸을 채워 회신해 주셔도 됩니다.',
    closing: '감사합니다.'
  },
  logo: null
};

function mergeSettings(doc) {
  const d = doc || {};
  const s = clone(DEFAULT_SETTINGS);
  s.company = Object.assign(s.company, d.company || {});
  if (Array.isArray(d.reps) && d.reps.length) s.reps = d.reps;
  s.defaults = Object.assign(s.defaults, d.defaults || {});
  if (!Array.isArray(s.defaults.conditions)) s.defaults.conditions = [];
  s.mail = Object.assign(s.mail, d.mail || {});
  s.logo = d.logo || null;
  s._saved = !!doc;
  return s;
}

function repOf(settings, id) {
  return (settings.reps || []).find((r) => r.id === id) || (settings.reps || [])[0] || { name: '', title: '' };
}
function repLabel(rep) { return [rep && rep.name, rep && rep.title].filter(Boolean).join(' '); }
function contactLine(rep) {
  if (!rep) return '';
  const parts = [];
  const head = repLabel(rep);
  if (rep.tel) parts.push((head ? head + ' ' : '') + 'TEL: ' + rep.tel); else if (head) parts.push(head);
  if (rep.fax) parts.push('FAX: ' + rep.fax);
  let line = parts.join(' / ');
  if (rep.mobile) line += ' /  Mobile : ' + rep.mobile;
  if (rep.email) line += '  e-mail : ' + rep.email;
  return line;
}
function logoB64(settings) {
  const src = (settings && settings.logo) || LOGO_DATA;
  return src.replace(/^data:image\/\w+;base64,/, '');
}

/* 견적서(매출) 데이터 */
function salesDocData(p, settings) {
  const rep = repOf(settings, p.repId);
  const s = p.sales || {};
  const date = s.date || L.today();
  return {
    logoBase64: logoB64(settings),
    logoSrc: settings.logo || LOGO_DATA,
    contactLine: contactLine(rep),
    customer: (p.customer && p.customer.company) || '',
    project: p.title || '',
    date: date,
    validity: s.validity || settings.defaults.validity,
    lines: (s.lines || []).map((ln) => ({ category: ln.category, name: ln.name, specs: ln.specs || [], qty: ln.qty, unitPrice: ln.unitPrice, note: ln.note })),
    notes: (s.notes || []).filter((n) => n.title || n.reason),
    conditions: (s.conditions || []).map(str).filter(Boolean),
    company: settings.company,
    meta: { rep: repLabel(rep), customer: (p.customer && p.customer.company) || '', project: p.title || '', date: date }
  };
}

/* ---------- 견적서 미리보기(기존 엑셀 양식과 같은 배치) ---------- */
const QD_COLS = [105, 177, 164, 249, 87, 71, 143, 160, 60];
function QuoteDoc({ data }) {
  const d = data;
  const rows = [];
  const fl = 'fl', fr = 'fr';
  const total = (d.lines || []).reduce((a, ln) => a + (L.num(ln.unitPrice) || 0) * (L.num(ln.qty) || 0), 0);
  const blank = (k, cls) => rows.push(html`<tr key=${k} class=${cls || ''}><td class=${fl} colspan="8"></td><td class=${fr}></td></tr>`);

  rows.push(html`<tr key="r2"><td colspan="9" class="contact fl fr">${d.contactLine}</td></tr>`);
  rows.push(html`<tr key="r3"><td colspan="9" class="title fl fr pre"><img src=${d.logoSrc} alt="" />${'견   적   서'}</td></tr>`);
  blank('r4');
  const co = d.company || {};
  const info = [['고   객   사 : ', d.customer, co.name, true], ['프로젝트명 : ', d.project, co.address1], ['견 적 일 자 : ', d.date, co.address2], ['유 효 기 간 : ', d.validity, co.ceoLine]];
  info.forEach((x, i) => rows.push(html`<tr key=${'i' + i}>
    <td class="lbl fl pre">${x[0]}</td>
    <td class="lbl" colspan="4">${x[1] || ''}</td>
    <td colspan="4" class=${'co fr' + (x[3] ? ' big' : '')} style="white-space:pre">${x[2] || ''}</td></tr>`));
  blank('r9');
  rows.push(html`<tr key="r10"><td class="lbl fl" colspan="8">아래와 같이 견적합니다.</td><td class="fr"></td></tr>`);
  rows.push(html`<tr key="r11"><td class="fl" colspan="6"></td><td class="unit fr" colspan="3">[단위 : 원, VAT별도]</td></tr>`);
  rows.push(html`<tr key="hd" class="hd">${['NO', '품목', '품명', '상세내역', '스펙', '수량', '제안 단가', '제안가 합계', '비고'].map((t, i) => html`<td key=${t} class=${i === 0 ? fl : i === 8 ? fr : ''}>${t}</td>`)}</tr>`);
  (d.lines || []).forEach((ln, idx) => {
    const specs = (ln.specs || []).filter((s) => s && (s.cat || s.detail || s.spec));
    const span = 1 + specs.length;
    const amt = (L.num(ln.unitPrice) || 0) * (L.num(ln.qty) || 0);
    for (let k = 0; k < span; k++) {
      const cls = 'it' + (k === 0 ? ' first' : '') + (k === span - 1 ? ' last' : '');
      const s = k > 0 ? specs[k - 1] : null;
      rows.push(html`<tr key=${'l' + idx + '-' + k} class=${cls}>
        ${k === 0 ? html`<td rowspan=${span} class="c m fl">${idx + 1}</td>` : null}
        ${k === 0 ? html`<td rowspan=${span} class="c m wrap">${ln.category || ''}</td>` : null}
        <td class="c ar" style=${k === 0 && (ln.name || '').length > 20 ? 'font-size:' + (14.7 * 20 / ln.name.length).toFixed(1) + 'px' : ''}>${k === 0 ? (ln.name || '') : (s.cat || '')}</td>
        <td style=${k > 0 && (s.detail || '').length > 30 ? 'font-size:' + (14.7 * 30 / s.detail.length).toFixed(1) + 'px' : ''}>${k === 0 ? '' : (s.detail || '')}</td>
        <td class="c">${k === 0 ? '' : (s.spec || '')}</td>
        ${k === 0 ? html`<td rowspan=${span} class="c m">${L.num(ln.qty) ?? ''}</td>` : null}
        ${k === 0 ? html`<td rowspan=${span} class="m amt">${L.num(ln.unitPrice) === null ? '' : L.fmt(ln.unitPrice)}</td>` : null}
        ${k === 0 ? html`<td rowspan=${span} class="m amt">${L.fmt(amt)}</td>` : null}
        ${k === 0 ? html`<td rowspan=${span} class="c m wrap fr">${ln.note || ''}</td>` : null}
      </tr>`);
    }
  });
  rows.push(html`<tr key="s1" class="sum"><td class="fl" colspan="7" style="text-align:center">합계 (VAT 별도)</td><td class="v">${L.fmt(total)}</td><td class="fr"></td></tr>`);
  rows.push(html`<tr key="s2" class="sum"><td class="fl" colspan="7" style="text-align:center">합계 (VAT 포함)</td><td class="v">${L.fmt(Math.floor(total * 1.1 + 1e-7))}</td><td class="fr"></td></tr>`);
  const notes = (d.notes || []).filter((n) => n.title || n.reason);
  if (notes.length) {
    blank('nb');
    rows.push(html`<tr key="nh" class="tx"><td class="hl fl pre">${'< 주  석 >'}</td><td colspan="7"></td><td class="fr"></td></tr>`);
    notes.forEach((n, i) => {
      rows.push(html`<tr key=${'n' + i} class="tx"><td class="fl" colspan="8">${(i + 1) + '. ' + (n.title || '')}</td><td class="fr"></td></tr>`);
      if (n.reason) rows.push(html`<tr key=${'nr' + i} class="tx"><td class="fl" colspan="8">${'사유 : ' + n.reason}</td><td class="fr"></td></tr>`);
    });
  }
  const conds = (d.conditions || []).filter(Boolean);
  if (conds.length) {
    blank('cb');
    rows.push(html`<tr key="ch" class="tx big"><td class="hl fl pre" style="text-align:left">${'< 견적 조건 >'}</td><td colspan="7"></td><td class="fr"></td></tr>`);
    conds.forEach((c, i) => rows.push(html`<tr key=${'c' + i} class="tx big"><td class="fl" colspan="8">${(i + 1) + '. ' + c}</td><td class="fr"></td></tr>`));
  }
  rows.push(html`<tr key="end" class="end"><td class="fl" colspan="8"></td><td class="fr"></td></tr>`);
  return html`<div class="qdoc"><table class="qd"><colgroup>${QD_COLS.map((w, i) => html`<col key=${i} style=${'width:' + w + 'px'} />`)}</colgroup><tbody>${rows}</tbody></table></div>`;
}

/* 컨테이너 폭에 맞춰 축소 표시 */
function ScaledDoc({ children, width }) {
  const outer = useRef(null), inner = useRef(null);
  const [st, setSt] = useState({ s: 0.5, h: 400 });
  useLayoutEffect(() => {
    const fit = () => {
      if (!outer.current || !inner.current) return;
      const w = outer.current.clientWidth;
      const s = Math.min(1, w / (width || 1256));
      setSt({ s: s, h: inner.current.offsetHeight * s });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(outer.current);
    ro.observe(inner.current);
    return () => ro.disconnect();
  }, []);
  return html`<div ref=${outer} style=${'width:100%;height:' + Math.ceil(st.h) + 'px;overflow:hidden'}><div ref=${inner} class="docscale" style=${'width:' + (width || 1256) + 'px;transform:scale(' + st.s + ')'}>${children}</div></div>`;
}

/* ---------- 내보내기 ---------- */
function fileBase(p) {
  return L.safeName([p.customer && p.customer.company, p.title].filter(Boolean).join('_') || p.no || '견적');
}

async function exportSalesXlsx(p, settings) {
  await loadLib('exceljs');
  const wb = XL.salesWorkbook(ExcelJS, salesDocData(p, settings));
  const buf = await wb.xlsx.writeBuffer();
  await saveFile('견적서_' + fileBase(p) + '_' + (p.no || '') + '.xlsx', new Blob([buf], { type: XLSX_MIME }));
}

async function exportSalesPdf(p, settings) {
  await Promise.all([loadLib('html2canvas'), loadLib('jspdf')]);
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-20000px;top:0;width:1256px;background:#fff;z-index:-1';
  document.body.appendChild(host);
  try {
    render(html`<${QuoteDoc} data=${salesDocData(p, settings)} />`, host);
    try { await document.fonts.ready; } catch (e) { /* 무시 */ }
    await sleep(60);
    const el = host.querySelector('.qdoc');
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', logging: false });
    const pdf = new jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    const margin = 8, pageW = 210, pageH = 297;
    const imgW = pageW - margin * 2;
    const pxPerMm = canvas.width / imgW;
    const pageHpx = Math.floor((pageH - margin * 2) * pxPerMm);
    let y = 0, page = 0;
    while (y < canvas.height - 2) {
      const hpx = Math.min(pageHpx, canvas.height - y);
      const c = document.createElement('canvas');
      c.width = canvas.width; c.height = hpx;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(canvas, 0, y, canvas.width, hpx, 0, 0, canvas.width, hpx);
      if (page) pdf.addPage();
      pdf.addImage(c.toDataURL('image/jpeg', 0.93), 'JPEG', margin, margin, imgW, hpx / pxPerMm);
      y += hpx; page++;
    }
    const blob = pdf.output('blob');
    await saveFile('견적서_' + fileBase(p) + '_' + (p.no || '') + '.pdf', blob);
  } finally {
    render(null, host);
    host.remove();
  }
}

function costDocData(p, settings) {
  const lines = (p.sales && p.sales.lines) || [];
  const rows = L.costRows(lines);
  const tot = L.salesTotals(lines);
  const parts = [];
  lines.forEach((ln) => {
    const hit = ln.src && ln.src.quoteId ? L.findQuoteItem(p, ln.src) : null;
    if (hit) (hit.qi.parts || []).forEach((pt) => parts.push({ vendor: hit.qt.vendorName, item: hit.qi.model || hit.qi.name, partNo: pt.partNo, desc: pt.desc, qty: pt.qty }));
  });
  return { no: p.no, project: p.title, customer: (p.customer && p.customer.company) || '', date: (p.sales && p.sales.date) || L.today(), rep: repLabel(repOf(settings, p.repId)), rows: rows, vendors: L.vendorSummary(rows), totals: tot, lowGp: settings.defaults.lowGp, parts: parts };
}

async function exportCostXlsx(p, settings) {
  await loadLib('exceljs');
  const wb = XL.costWorkbook(ExcelJS, costDocData(p, settings));
  const buf = await wb.xlsx.writeBuffer();
  await saveFile('원가분석표_' + fileBase(p) + '_' + (p.no || '') + '.xlsx', new Blob([buf], { type: XLSX_MIME }));
}

/* 견적요청서(매입처용) */
function rfqDocData(p, vendor, settings, opts) {
  const rep = repOf(settings, p.repId);
  const mail = L.rfqEmail(p, vendor, settings, rep, opts);
  return {
    logoBase64: logoB64(settings),
    no: p.no, date: L.today(), replyBy: L.fmtDateK(opts.replyBy),
    vendor: { name: vendor.name || '', contact: vendor.contact || '' },
    sender: { company: settings.company.name, rep: repLabel(rep), tel: rep.tel, mobile: rep.mobile, email: rep.email },
    title: p.title + (opts.showCustomer && p.customer && p.customer.company ? ' (' + p.customer.company + ')' : ''),
    items: L.rfqItems(p, opts.itemIds),
    conditions: p.conditions || {},
    requests: (settings.mail.requests || '').split('\n').map(str).filter(Boolean).concat(str(opts.extra) ? str(opts.extra).split('\n').map(str).filter(Boolean) : []),
    mail: mail
  };
}
async function rfqXlsxBuffer(p, vendor, settings, opts) {
  await loadLib('exceljs');
  const d = rfqDocData(p, vendor, settings, opts);
  const wb = XL.rfqWorkbook(ExcelJS, d);
  return { buf: await wb.xlsx.writeBuffer(), mail: d.mail };
}
function rfqFileName(p, vendor) { return '견적요청서_' + (p.no || '') + '_' + L.safeName(vendor.name || '매입처') + '.xlsx'; }

async function exportRfqXlsx(p, vendor, settings, opts) {
  const r = await rfqXlsxBuffer(p, vendor, settings, opts);
  await saveFile(rfqFileName(p, vendor), new Blob([r.buf], { type: XLSX_MIME }));
}

async function exportRfqEml(p, targets, settings, opts) {
  await Promise.all([loadLib('exceljs'), loadLib('jszip')]);
  const zip = new JSZip();
  let i = 0;
  for (const t of targets) {
    i++;
    const r = await rfqXlsxBuffer(p, t.vendor, settings, Object.assign({}, opts, { itemIds: t.itemIds }));
    const eml = L.buildEml({ to: r.mail.to, cc: r.mail.cc, subject: r.mail.subject, text: r.mail.text, html: r.mail.html, attachments: [{ filename: rfqFileName(p, t.vendor), mime: XLSX_MIME, bytes: new Uint8Array(r.buf) }] });
    const ascii = String(t.vendor.name || '').replace(/[^A-Za-z0-9]+/g, '').slice(0, 20);
    zip.file('RFQ_' + (p.no || 'quote') + '_' + String(i).padStart(2, '0') + (ascii ? '_' + ascii : '') + '.eml', eml);
  }
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const one = targets.length === 1 ? '_' + L.safeName(targets[0].vendor.name || '') : '_' + targets.length + '곳';
  await saveFile('견적요청메일_' + (p.no || '') + one + '.zip', blob);
}
