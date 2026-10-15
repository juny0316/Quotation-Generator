/* ===== 순수 계산·서식 로직 (브라우저/Node 공용) ===== */
(function (root) {
  'use strict';
  const L = {};

  /* ---------- id ---------- */
  L.uid = (p) => (p || '') + Math.random().toString(36).slice(2, 7) + (Date.now() % 1679616).toString(36);

  /* ---------- 숫자 ---------- */
  L.num = function (v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    let s = String(v).trim();
    if (!s) return null;
    const neg = /^\(.*\)$/.test(s) || /^-/.test(s.replace(/[₩\s]/g, ''));
    s = s.replace(/[^\d.]/g, '');
    if (!s || s === '.') return null;
    const n = Number(s);
    if (!isFinite(n)) return null;
    return neg ? -n : n;
  };
  L.fmt = (n) => (n === null || n === undefined || !isFinite(n)) ? '' : Math.round(n).toLocaleString('en-US');
  L.pct = (r, d) => (r === null || r === undefined || !isFinite(r)) ? '–' : (r * 100).toFixed(d === undefined ? 1 : d) + '%';

  L.roundUnit = function (v, unit, mode) {
    if (v === null || v === undefined || !isFinite(v)) return null;
    unit = unit > 0 ? unit : 1;
    const q = v / unit;
    let r;
    if (mode === 'floor') r = Math.floor(q + 1e-9);
    else if (mode === 'round') r = Math.round(q);
    else r = Math.ceil(q - 1e-9);
    return r * unit;
  };

  /* GP율(매출 대비) 기준 제안가: 매입가 ÷ (1 − GP%) → 단위 올림 */
  L.priceFromGp = function (cost, gpRate, unit) {
    cost = L.num(cost); gpRate = L.num(gpRate);
    if (cost === null || gpRate === null || gpRate >= 100) return null;
    return L.roundUnit(cost / (1 - gpRate / 100), unit || 1, 'ceil');
  };
  /* 실제 GP율(0~1) */
  L.gpRateOf = function (price, cost) {
    price = L.num(price); cost = L.num(cost);
    if (price === null || cost === null || !price) return null;
    return (price - cost) / price;
  };
  /* 부가세: 공급가액 × 10%, 원 미만 절사 */
  L.vat = (supply) => {
    const s = L.num(supply) || 0;
    return Math.trunc(s * 0.1 + (s >= 0 ? 1e-7 : -1e-7));
  };

  /* 한글 금액 (일금 ○○원정) */
  L.koreanAmount = function (n) {
    n = Math.round(Math.abs(L.num(n) || 0));
    if (n === 0) return '영';
    const D = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
    const S = ['', '십', '백', '천'];
    const B = ['', '만', '억', '조', '경'];
    let out = '';
    let i = 0;
    while (n > 0) {
      const chunk = n % 10000;
      n = Math.floor(n / 10000);
      if (chunk) {
        let cs = '';
        let c = chunk, j = 0;
        while (c > 0) {
          const d = c % 10;
          if (d) cs = D[d] + S[j] + cs;
          c = Math.floor(c / 10); j++;
        }
        out = cs + B[i] + out;
      }
      i++;
    }
    return out;
  };

  /* ---------- 날짜 ---------- */
  L.ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  L.today = () => L.ymd(new Date());
  L.parseYmd = function (s) {
    if (!s) return null;
    if (s instanceof Date) return isNaN(s) ? null : new Date(s.getFullYear(), s.getMonth(), s.getDate());
    const str = String(s).trim();
    let m = /(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/.exec(str);
    if (m) {
      const d = new Date(+m[1], +m[2] - 1, +m[3]);
      return isNaN(d) ? null : d;
    }
    return null;
  };
  L.addDays = function (s, n) {
    const d = L.parseYmd(s) || new Date();
    d.setDate(d.getDate() + n);
    return L.ymd(d);
  };
  L.addBizDays = function (s, n) {
    const d = L.parseYmd(s) || new Date();
    let k = 0;
    while (k < n) {
      d.setDate(d.getDate() + 1);
      const w = d.getDay();
      if (w !== 0 && w !== 6) k++;
    }
    return L.ymd(d);
  };
  L.fmtDateK = function (s) {
    const d = L.parseYmd(s);
    if (!d) return s || '';
    return L.ymd(d) + '(' + '일월화수목금토'[d.getDay()] + ')';
  };
  L.fmtDateLong = function (s) {
    const d = L.parseYmd(s);
    if (!d) return s || '';
    return d.getFullYear() + '년 ' + String(d.getMonth() + 1).padStart(2, '0') + '월 ' + String(d.getDate()).padStart(2, '0') + '일';
  };
  /* "2026-03-12", "견적일로부터 1주", "30일" → 만료일 */
  L.resolveValidity = function (baseDate, text) {
    if (!text) return null;
    const direct = L.parseYmd(text);
    if (direct) return direct;
    const base = L.parseYmd(baseDate);
    if (!base) return null;
    const m = /(\d+)\s*(일|주|개월|달|日|day|week|month)/i.exec(String(text));
    if (!m) return null;
    const n = +m[1];
    const u = m[2];
    const d = new Date(base);
    if (/주|week/i.test(u)) d.setDate(d.getDate() + n * 7);
    else if (/개월|달|month/i.test(u)) d.setMonth(d.getMonth() + n);
    else d.setDate(d.getDate() + n);
    return d;
  };

  /* ---------- 견적번호 ---------- */
  L.nextQuoteNo = function (prefix, ymd, existing) {
    const base = (prefix || 'Q') + '-' + String(ymd || L.today()).replace(/-/g, '').slice(2);
    let max = 0;
    (existing || []).forEach((no) => {
      if (no && String(no).indexOf(base + '-') === 0) {
        const k = parseInt(String(no).slice(base.length + 1), 10);
        if (k > max) max = k;
      }
    });
    return base + '-' + String(max + 1).padStart(2, '0');
  };

  /* ---------- 매입 견적 ---------- */
  /* 매입 단가(공급가, 부가세 별도) */
  L.supplyUnit = function (quote, qi) {
    if (!qi) return null;
    let u = L.num(qi.unitPrice);
    if (u === null) {
      const a = L.num(qi.amount), q = L.num(qi.qty);
      if (a !== null && q) u = a / q;
    }
    if (u === null) return null;
    return quote && quote.vat === 'included' ? Math.round(u / 1.1) : u;
  };
  L.quoteItemAmount = function (qi) {
    const a = L.num(qi.amount);
    if (a !== null) return a;
    const u = L.num(qi.unitPrice), q = L.num(qi.qty);
    return u !== null && q !== null ? u * q : null;
  };

  L.reviewQuote = function (project, quote, todayStr) {
    const F = [];
    const items = project.items || [];
    const qItems = quote.items || [];
    const add = (level, text, ref) => F.push({ level: level, text: text, ref: ref || null });
    const f = L.fmt;

    items.forEach((it, i) => {
      const label = (i + 1) + '. ' + (it.name || '품목');
      const ms = qItems.filter((q) => q.reqItemId === it.id);
      if (!ms.length) { add('bad', label + ' — 견적에 없음', it.id); return; }
      ms.forEach((q) => {
        const rq = L.num(it.qty), qq = L.num(q.qty);
        if (rq !== null && qq !== null && rq !== qq) add('warn', label + ' — 수량 다름 (요청 ' + rq + ' / 견적 ' + qq + ')', it.id);
        if (q.match === 'alternative') add('warn', label + ' — 대체품 제안' + (q.matchNote ? ': ' + q.matchNote : ''), it.id);
        else if (q.match === 'partial') add('warn', label + ' — 사양 일부 다름' + (q.matchNote ? ': ' + q.matchNote : ''), it.id);
        else if (q.match === 'exact') add('ok', label + ' — 요청 사양과 일치', it.id);
      });
    });

    qItems.forEach((q) => {
      const nm = q.model || q.name || '품목';
      const u = L.num(q.unitPrice), qty = L.num(q.qty), amt = L.num(q.amount);
      if (u === null && amt === null) add('bad', nm + ' — 단가 없음');
      if (u !== null && qty !== null && amt !== null) {
        const calc = u * qty;
        if (Math.abs(calc - amt) > Math.max(1, Math.abs(amt) * 0.0005)) {
          add('bad', nm + ' — 금액 계산 불일치 (' + f(u) + ' × ' + qty + ' = ' + f(calc) + ', 견적서 ' + f(amt) + ')');
        }
      }
      if (!q.reqItemId) add('info', '요청 외 항목: ' + nm + (amt !== null ? ' ' + f(amt) + '원' : ''));
    });

    const sumAmt = qItems.reduce((s, q) => s + (L.quoteItemAmount(q) || 0), 0);
    const t = quote.totals || {};
    const supply = L.num(t.supply), vat = L.num(t.vat), total = L.num(t.total);
    if (quote.vat === 'included') add('info', '부가세 포함 단가 — 공급가(÷1.1)로 환산해 사용');
    else if (quote.vat !== 'excluded') add('warn', '부가세 포함 여부가 불분명 — 확인 필요');
    if (supply !== null && Math.abs(supply - sumAmt) > 10) add('warn', '합계 불일치 — 품목 합 ' + f(sumAmt) + ' / 견적서 공급가 ' + f(supply));
    if (supply !== null && vat !== null && quote.vat !== 'included' && Math.abs(L.vat(supply) - vat) > 10) add('warn', '부가세 확인 — 공급가의 10% ' + f(L.vat(supply)) + ' / 견적서 ' + f(vat));
    if (supply !== null && vat !== null && total !== null && Math.abs(supply + vat - total) > 10) add('warn', '총액 확인 — ' + f(supply) + ' + ' + f(vat) + ' ≠ ' + f(total));

    const terms = quote.terms || {};
    const vd = L.resolveValidity(quote.quoteDate, terms.validUntil);
    if (vd) {
      const today = L.parseYmd(todayStr || L.today());
      const diff = Math.round((vd - today) / 86400000);
      if (diff < 0) add('bad', '견적 유효기간 만료 (' + L.ymd(vd) + ')');
      else if (diff <= 3) add('warn', '견적 유효기간 임박 (' + L.ymd(vd) + ', ' + diff + '일 남음)');
      else add('ok', '유효기간 ' + L.ymd(vd) + '까지');
    } else if (!terms.validUntil) add('warn', '견적 유효기간 기재 없음');

    const counts = { bad: 0, warn: 0, info: 0, ok: 0 };
    F.forEach((x) => { counts[x.level] = (counts[x.level] || 0) + 1; });
    return { findings: F, counts: counts, sumAmt: sumAmt, validUntil: vd ? L.ymd(vd) : null };
  };

  /* 요청 품목별 채택(매입처·품목) — 명시 선택 우선, 없으면 최저가 */
  L.effectiveAdopt = function (project) {
    const out = {};
    const quotes = project.quotes || [];
    const explicit = project.adopt || {};
    (project.items || []).forEach((it) => {
      const ex = explicit[it.id];
      if (ex === 'none') { out[it.id] = null; return; }
      if (ex && ex.quoteId) {
        const qt = quotes.find((q) => q.id === ex.quoteId);
        const qi = qt && (qt.items || []).find((x) => x.id === ex.quoteItemId);
        if (qi) { out[it.id] = { quoteId: qt.id, quoteItemId: qi.id }; return; }
      }
      let best = null;
      quotes.forEach((qt) => (qt.items || []).forEach((qi) => {
        if (qi.reqItemId !== it.id) return;
        const u = L.supplyUnit(qt, qi);
        if (u === null) return;
        if (!best || u < best.u) best = { quoteId: qt.id, quoteItemId: qi.id, u: u };
      }));
      out[it.id] = best ? { quoteId: best.quoteId, quoteItemId: best.quoteItemId } : null;
    });
    return out;
  };

  L.findQuoteItem = function (project, ref) {
    if (!ref || !ref.quoteId) return null;
    const qt = (project.quotes || []).find((q) => q.id === ref.quoteId);
    const qi = qt && (qt.items || []).find((x) => x.id === ref.quoteItemId);
    return qi ? { qt: qt, qi: qi } : null;
  };

  /* ---------- 매출 견적 ---------- */
  L.makeLineFromQuote = function (project, it, qt, qi, defaults) {
    const gp = L.num(defaults.gpRate) ?? 10;
    const unit = L.num(defaults.priceRound) || 1;
    const costUnit = qi ? L.supplyUnit(qt, qi) : null;
    const qty = L.num(it && it.qty) ?? L.num(qi && qi.qty) ?? 1;
    return {
      id: L.uid('l'),
      category: (it && it.name) || (qi && qi.name) || '',
      name: (qi && (qi.model || qi.name)) || (it && (it.model || it.name)) || '',
      specs: ((qi && qi.specs) || []).map((s) => ({ cat: s.cat || '', detail: s.detail || '', spec: s.spec || '' })),
      qty: qty,
      unit: (it && it.unit) || (qi && qi.unit) || 'EA',
      costUnit: costUnit,
      gpRate: gp,
      unitPrice: costUnit !== null ? L.priceFromGp(costUnit, gp, unit) : null,
      note: '',
      src: qi ? { quoteId: qt.id, quoteItemId: qi.id, reqItemId: it ? it.id : null } : { reqItemId: it ? it.id : null },
      vendorName: qt ? (qt.vendorName || '') : '',
      costLabel: qi ? [qi.model, qi.name].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' / ') : ''
    };
  };

  L.buildSalesLines = function (project, defaults) {
    const adopt = L.effectiveAdopt(project);
    return (project.items || []).map((it) => {
      const hit = L.findQuoteItem(project, adopt[it.id]);
      return L.makeLineFromQuote(project, it, hit && hit.qt, hit && hit.qi, defaults);
    });
  };

  /* 채택된 견적의 '요청 외 항목'(배송비·설치비 등) */
  L.extraQuoteItems = function (project) {
    const adopt = L.effectiveAdopt(project);
    const used = new Set(Object.values(adopt).filter(Boolean).map((a) => a.quoteId));
    const out = [];
    (project.quotes || []).forEach((qt) => {
      if (!used.has(qt.id)) return;
      (qt.items || []).forEach((qi) => { if (!qi.reqItemId) out.push({ qt: qt, qi: qi }); });
    });
    return out;
  };

  /* 견적 주석 후보(변경 사항) — 채택된 견적 품목 기준 */
  L.collectDeviations = function (project) {
    const adopt = L.effectiveAdopt(project);
    const out = [];
    const seen = new Set();
    Object.keys(adopt).forEach((reqId) => {
      const a = adopt[reqId];
      if (!a) return;
      const qt = (project.quotes || []).find((q) => q.id === a.quoteId);
      if (!qt) return;
      (qt.deviations || []).forEach((d) => {
        if (d.reqItemId && d.reqItemId !== reqId) return;
        const key = (d.title || '') + '|' + (d.reason || '');
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ id: L.uid('n'), title: d.title || '', reason: d.reason || '' });
      });
    });
    return out;
  };

  L.lineCalc = function (ln) {
    const qty = L.num(ln.qty) ?? 0;
    const price = L.num(ln.unitPrice);
    const cost = L.num(ln.costUnit);
    const amount = price !== null ? price * qty : null;
    const costAmount = cost !== null ? cost * qty : null;
    const gp = amount !== null && costAmount !== null ? amount - costAmount : null;
    const rate = gp !== null && amount ? gp / amount : null;
    return { qty: qty, price: price, cost: cost, amount: amount, costAmount: costAmount, gp: gp, rate: rate };
  };

  L.salesTotals = function (lines) {
    let supply = 0, cost = 0, missingCost = 0, missingPrice = 0;
    (lines || []).forEach((ln) => {
      const c = L.lineCalc(ln);
      if (c.amount === null) missingPrice++; else supply += c.amount;
      if (c.costAmount === null) missingCost++; else cost += c.costAmount;
    });
    const vat = L.vat(supply);
    const gp = supply - cost;
    return { supply: supply, vat: vat, total: supply + vat, cost: cost, gp: gp, rate: supply ? gp / supply : null, missingCost: missingCost, missingPrice: missingPrice };
  };

  /* ---------- 원가분석표 ---------- */
  L.costRows = function (lines) {
    return (lines || []).map((ln, i) => {
      const c = L.lineCalc(ln);
      return {
        no: i + 1,
        category: ln.category || '',
        name: ln.name || '',
        qty: c.qty,
        price: c.price,
        amount: c.amount,
        vendor: ln.vendorName || '',
        costItem: ln.costLabel || '',
        cost: c.cost,
        costAmount: c.costAmount,
        gp: c.gp,
        rate: c.rate
      };
    });
  };
  L.vendorSummary = function (rows) {
    const map = new Map();
    rows.forEach((r) => {
      const k = r.vendor || '(매입처 미지정)';
      if (!map.has(k)) map.set(k, { vendor: k, count: 0, costAmount: 0, sales: 0 });
      const v = map.get(k);
      v.count++;
      v.costAmount += r.costAmount || 0;
      v.sales += r.amount || 0;
    });
    return Array.from(map.values()).map((v) => Object.assign(v, { vat: L.vat(v.costAmount), total: v.costAmount + L.vat(v.costAmount) }));
  };

  /* ---------- 진행 단계 ---------- */
  L.stageOf = function (p) {
    if (p.status === 'won') return { key: 'won', label: '수주' };
    if (p.status === 'lost') return { key: 'lost', label: '실주' };
    if (p.status === 'submitted') return { key: 'submitted', label: '제출 완료' };
    const lines = (p.sales && p.sales.lines) || [];
    if (lines.length) return { key: 'sales', label: '견적 작성' };
    if ((p.quotes || []).length) return { key: 'review', label: '매입 검토' };
    if (((p.rfq && p.rfq.sent) || []).length) return { key: 'rfq', label: '회신 대기' };
    if ((p.items || []).length) return { key: 'items', label: '요청 정리' };
    return { key: 'new', label: '요청 입력' };
  };

  /* ---------- 문자열 ---------- */
  L.esc = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  L.fill = (tpl, vars) => String(tpl || '').replace(/\{([^{}]+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : m));
  L.normName = (s) => String(s || '').replace(/\(주\)|㈜|주식회사|\s|[()]/g, '').toLowerCase();

  /* ---------- 매입처 견적 요청 메일 ---------- */
  L.rfqItems = function (project, itemIds) {
    const ids = itemIds && itemIds.length ? new Set(itemIds) : null;
    return (project.items || []).filter((it) => !ids || ids.has(it.id));
  };

  L.rfqEmail = function (project, vendor, settings, rep, opts) {
    opts = opts || {};
    const items = L.rfqItems(project, opts.itemIds);
    const company = (settings.company && settings.company.short) || '유니포인트';
    const mail = settings.mail || {};
    const repLabel = [rep && rep.name, rep && rep.title].filter(Boolean).join(' ');
    const vars = {
      '매입처': vendor.name || '',
      '담당자': vendor.contact || '담당자',
      '건명': project.title || '',
      '요청번호': project.no || '',
      '회신기한': L.fmtDateK(opts.replyBy),
      '보내는사람': repLabel,
      '회사': company,
      '고객사': opts.showCustomer ? ((project.customer && project.customer.company) || '') : ''
    };
    const subject = L.fill(mail.subject || '[{회사}] 견적 요청 - {건명}', vars).replace(/\s+/g, ' ').trim();
    const greet = L.fill(mail.greeting || '{매입처} {담당자}님, 안녕하세요.\n{회사} {보내는사람}입니다.\n\n아래 품목에 대한 견적을 요청드립니다.', vars);
    const reqs = L.fill(mail.requests || '부가세 별도 단가로 회신 부탁드립니다.\n견적 유효기간, 납기, 무상 유지보수 조건을 함께 적어 주세요.\n요청 사양과 다른 모델·수량으로 제안하시는 경우 변경 사유를 함께 적어 주세요.', vars);
    const closing = L.fill(mail.closing || '감사합니다.', vars);
    const c = project.conditions || {};
    const info = [
      ['건명', project.title + (opts.showCustomer && vars['고객사'] ? ' (' + vars['고객사'] + ')' : '')],
      ['요청번호', project.no],
      ['회신 요청일', vars['회신기한']],
      ['납품 희망일', c.dueDate],
      ['납품 장소', c.deliveryPlace],
      ['설치·구성', c.install],
      ['기타 조건', c.other]
    ].filter((r) => r[1]);
    const extra = (opts.extra || '').trim();
    const reqLines = reqs.split('\n').map((s) => s.trim()).filter(Boolean).concat(extra ? extra.split('\n').map((s) => s.trim()).filter(Boolean) : []);
    const sig = [
      repLabel ? (settings.company && settings.company.name ? settings.company.name + ' ' : '') + repLabel : (settings.company && settings.company.name) || '',
      rep && rep.tel ? 'TEL ' + rep.tel : '',
      rep && rep.mobile ? 'Mobile ' + rep.mobile : '',
      rep && rep.email ? rep.email : ''
    ].filter(Boolean);

    /* text */
    const tl = [];
    tl.push(greet, '');
    info.forEach((r) => tl.push('■ ' + r[0] + ': ' + r[1]));
    tl.push('');
    tl.push('[요청 품목]');
    items.forEach((it, i) => {
      tl.push((i + 1) + '. ' + (it.name || '') + ' — ' + (L.num(it.qty) ?? '') + ' ' + (it.unit || ''));
      [it.maker || it.model ? '제조사/모델: ' + [it.maker, it.model].filter(Boolean).join(' ') : '', it.spec ? '요구 사양: ' + String(it.spec).replace(/\n/g, ' / ') : '', it.note ? '비고: ' + it.note : '']
        .filter(Boolean).forEach((x) => tl.push('   ' + x));
    });
    tl.push('', '■ 요청 사항');
    reqLines.forEach((x) => tl.push('- ' + x));
    tl.push('', closing, '', sig.join('\n'));
    const text = tl.join('\n');

    /* html (Outlook 호환: 표 + 인라인 스타일) */
    const F = "font-family:'맑은 고딕','Malgun Gothic',sans-serif;font-size:10pt;color:#111;";
    const td = 'border:1px solid #9AA4B2;padding:5px 8px;vertical-align:top;' + F;
    const th = 'border:1px solid #9AA4B2;padding:5px 8px;background:#BDD7EE;font-weight:bold;text-align:center;' + F;
    const p = (s) => '<p style="margin:0 0 2px 0;' + F + '">' + (s ? L.esc(s) : '&nbsp;') + '</p>';
    let hb = '';
    greet.split('\n').forEach((s) => { hb += p(s); });
    hb += p('');
    hb += '<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:4px 0 10px 0;">';
    info.forEach((r) => {
      hb += '<tr><td style="padding:2px 12px 2px 0;' + F + 'color:#444;white-space:nowrap;">■ ' + L.esc(r[0]) + '</td><td style="padding:2px 0;' + F + '"><b>' + L.esc(r[1]) + '</b></td></tr>';
    });
    hb += '</table>';
    hb += '<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:4px 0 12px 0;">';
    hb += '<tr><th style="' + th + 'width:34px;">No</th><th style="' + th + 'min-width:110px;">품목</th><th style="' + th + 'min-width:240px;">요구 사양</th><th style="' + th + '">제조사/모델</th><th style="' + th + 'width:46px;">수량</th><th style="' + th + 'width:40px;">단위</th><th style="' + th + '">비고</th></tr>';
    items.forEach((it, i) => {
      hb += '<tr><td style="' + td + 'text-align:center;">' + (i + 1) + '</td><td style="' + td + '"><b>' + L.esc(it.name) + '</b></td><td style="' + td + '">' + L.esc(it.spec || '').replace(/\n/g, '<br>') + '</td><td style="' + td + '">' + L.esc([it.maker, it.model].filter(Boolean).join(' ')) + '</td><td style="' + td + 'text-align:center;">' + L.esc(L.num(it.qty) ?? '') + '</td><td style="' + td + 'text-align:center;">' + L.esc(it.unit || '') + '</td><td style="' + td + '">' + L.esc(it.note || '') + '</td></tr>';
    });
    hb += '</table>';
    hb += p('■ 요청 사항');
    reqLines.forEach((x) => { hb += p('- ' + x); });
    hb += p('');
    closing.split('\n').forEach((s) => { hb += p(s); });
    hb += p('');
    hb += '<p style="margin:0;' + F + 'color:#333;">' + sig.map(L.esc).join('<br>') + '</p>';
    const htmlDoc = '<div style="' + F + '">' + hb + '</div>';

    const to = vendor.email ? [{ name: vendor.contact ? vendor.name + ' ' + vendor.contact : vendor.name, email: vendor.email }] : [];
    const cc = String(vendor.cc || '').split(/[;,\s]+/).filter((e) => /@/.test(e)).map((e) => ({ name: '', email: e }));
    return { subject: subject, text: text, html: htmlDoc, to: to, cc: cc, itemCount: items.length };
  };

  /* ---------- MIME(.eml) ---------- */
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  L.bytesToB64 = function (bytes) {
    let out = '';
    let i = 0;
    for (; i + 2 < bytes.length; i += 3) {
      const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
      out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
    }
    const rem = bytes.length - i;
    if (rem === 1) {
      const n = bytes[i] << 16;
      out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + '==';
    } else if (rem === 2) {
      const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
      out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + '=';
    }
    return out;
  };
  L.utf8 = (s) => new TextEncoder().encode(String(s));
  L.b64utf8 = (s) => L.bytesToB64(L.utf8(s));
  L.wrap76 = (s) => s.replace(/.{1,76}/g, '$&\r\n');
  L.encodeWord = function (s) {
    s = String(s || '');
    if (/^[\x20-\x7e]*$/.test(s)) return s;
    const chunks = [];
    let cur = '', curBytes = 0;
    for (const ch of s) {
      const b = L.utf8(ch).length;
      if (curBytes + b > 42 && cur) { chunks.push(cur); cur = ''; curBytes = 0; }
      cur += ch; curBytes += b;
    }
    if (cur) chunks.push(cur);
    return chunks.map((c) => '=?UTF-8?B?' + L.b64utf8(c) + '?=').join('\r\n ');
  };
  L.addr = (a) => (a.name ? L.encodeWord(String(a.name).replace(/["<>]/g, '')) + ' <' + a.email + '>' : a.email);

  L.buildEml = function (m) {
    const rnd = () => Math.random().toString(36).slice(2, 12);
    const b1 = '----=_mix_' + rnd(), b2 = '----=_alt_' + rnd();
    const CRLF = '\r\n';
    const H = [];
    H.push('MIME-Version: 1.0');
    H.push('X-Unsent: 1');
    if (m.to && m.to.length) H.push('To: ' + m.to.map(L.addr).join(', '));
    if (m.cc && m.cc.length) H.push('Cc: ' + m.cc.map(L.addr).join(', '));
    H.push('Subject: ' + L.encodeWord(m.subject || ''));
    H.push('Content-Type: multipart/mixed; boundary="' + b1 + '"');
    let body = H.join(CRLF) + CRLF + CRLF;
    body += '--' + b1 + CRLF;
    body += 'Content-Type: multipart/alternative; boundary="' + b2 + '"' + CRLF + CRLF;
    body += '--' + b2 + CRLF + 'Content-Type: text/plain; charset="UTF-8"' + CRLF + 'Content-Transfer-Encoding: base64' + CRLF + CRLF;
    body += L.wrap76(L.b64utf8(String(m.text || '').replace(/\r?\n/g, CRLF)));
    body += '--' + b2 + CRLF + 'Content-Type: text/html; charset="UTF-8"' + CRLF + 'Content-Transfer-Encoding: base64' + CRLF + CRLF;
    body += L.wrap76(L.b64utf8('<html><head><meta charset="utf-8"></head><body>' + (m.html || '') + '</body></html>'));
    body += '--' + b2 + '--' + CRLF;
    (m.attachments || []).forEach((a) => {
      const nm = L.encodeWord(a.filename).replace(/\r\n /g, ' ');
      body += '--' + b1 + CRLF;
      body += 'Content-Type: ' + (a.mime || 'application/octet-stream') + '; name="' + nm + '"' + CRLF;
      body += 'Content-Disposition: attachment; filename="' + nm + '"' + CRLF;
      body += 'Content-Transfer-Encoding: base64' + CRLF + CRLF;
      body += L.wrap76(a.base64 || L.bytesToB64(a.bytes));
    });
    body += '--' + b1 + '--' + CRLF;
    return body;
  };

  /* 파일명 안전화 */
  L.safeName = (s) => String(s || '').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80);

  if (typeof module !== 'undefined' && module.exports) module.exports = L;
  else root.L = L;
})(typeof window !== 'undefined' ? window : globalThis);
