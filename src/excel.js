/* ===== 엑셀 서식 빌더 (ExcelJS) — 매출견적서 / 원가분석표 / 견적요청서 ===== */
(function (root) {
  'use strict';
  const X = {};
  const FONT = '맑은 고딕';
  const ACC = '_-* #,##0_-;\\-* #,##0_-;_-* "-"_-;_-@_-';
  const SUMFMT = '#,##0;[Red]#,##0';
  const BLACK = { argb: 'FF000000' };
  const T = { style: 'thin', color: BLACK };
  const M = { style: 'medium', color: BLACK };
  const D = { style: 'double', color: BLACK };
  const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: argb } });
  const HEAD = 'FFBDD7EE';
  const SUMF = 'FFFFF2CC';
  const YEL = 'FFFFFF00';
  const WHITE = 'FFFFFFFF';

  function font(sz, bold, name) { return { name: name || FONT, size: sz, bold: !!bold, color: BLACK }; }
  function setB(cell, b) { cell.border = Object.assign({}, cell.border || {}, b); }
  function toDate(ymd) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || ''));
    if (!m) return null;
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  }
  function n(v) { return (v === null || v === undefined || v === '' || !isFinite(Number(v))) ? null : Number(v); }

  /* 사각 범위 테두리: 각 셀의 바깥 변에만 선 지정 */
  function box(ws, r1, c1, r2, c2, edge) {
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const b = {};
        if (r === r1 && edge.top) b.top = edge.top;
        if (r === r2 && edge.bottom) b.bottom = edge.bottom;
        if (c === c1 && edge.left) b.left = edge.left;
        if (c === c2 && edge.right) b.right = edge.right;
        if (Object.keys(b).length) setB(ws.getCell(r, c), b);
      }
    }
  }

  /* ------------------------------------------------------------------
     매출 견적서 — 유니포인트 기존 양식(표지) 재현
     d = { logoBase64, contactLine, customer, project, date, validity,
           lines:[{category,name,specs:[{cat,detail,spec}],qty,unitPrice,note}],
           notes:[{title,reason}], conditions:[str],
           company:{name,address1,address2,ceoLine}, meta:{rep,customer,project,date} }
  ------------------------------------------------------------------ */
  X.salesWorkbook = function (ExcelJS, d) {
    const wb = new ExcelJS.Workbook();
    wb.creator = '유니포인트 견적서 생성기';
    wb.created = new Date();
    const ws = wb.addWorksheet('표지', {
      views: [{ state: 'normal', style: 'pageBreakPreview', zoomScale: 70, zoomScaleNormal: 70, showGridLines: false }],
      properties: { defaultRowHeight: 17.4 }
    });
    const widths = { A: 1.6, B: 14.3, C: 24.6, D: 22.7, E: 34.9, F: 11.7, G: 9.4, H: 19.7, I: 22.2, J: 7.8, K: 1.6, L: 4, M: 17.3, N: 43.3 };
    Object.keys(widths).forEach((k) => { ws.getColumn(k).width = widths[k]; });
    const BCOL = 2, JCOL = 10;

    ws.getRow(1).height = 18;

    /* 2행: 담당자 연락처 */
    ws.mergeCells('B2:J2');
    const c2 = ws.getCell('B2');
    c2.value = d.contactLine || '';
    c2.font = font(11, true);
    c2.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(2).height = 24.6;
    box(ws, 2, BCOL, 2, JCOL, { top: M, bottom: D, left: M, right: M });

    /* 3행: 제목 */
    ws.mergeCells('B3:J3');
    const c3 = ws.getCell('B3');
    c3.value = '견   적   서   ';
    c3.font = font(28, true);
    c3.alignment = { horizontal: 'center', vertical: 'middle' };
    c3.fill = fill(WHITE);
    ws.getRow(3).height = 48.6;

    /* 4~11행 */
    for (let r = 4; r <= 11; r++) {
      if (r >= 5) ws.getRow(r).height = 21;
      for (let c = BCOL; c <= JCOL; c++) ws.getCell(r, c).fill = fill(WHITE);
    }
    const info = [['고   객   사 : ', d.customer], ['프로젝트명 : ', d.project], ['견 적 일 자 : ', null], ['유 효 기 간 : ', d.validity]];
    info.forEach((row, i) => {
      const r = 5 + i;
      const lc = ws.getCell(r, 2);
      lc.value = row[0];
      lc.font = font(14, true);
      lc.alignment = { horizontal: 'left', vertical: 'middle' };
      const vc = ws.getCell(r, 3);
      vc.font = font(14, true);
      vc.alignment = { horizontal: 'left', vertical: 'middle' };
      if (i === 2) {
        const dt = toDate(d.date);
        vc.value = dt || d.date || '';
        if (dt) vc.numFmt = 'yyyy-mm-dd';
      } else vc.value = row[1] || '';
    });

    /* 공급자 정보 블록 (기존 양식의 글상자 위치) */
    const co = d.company || {};
    const coRows = [
      [5, co.name || '', 20],
      [6, co.address1 || '', 14],
      [7, co.address2 || '', 14],
      [8, co.ceoLine || '', 14]
    ];
    coRows.forEach((x) => {
      ws.mergeCells(x[0], 7, x[0], 10);
      const c = ws.getCell(x[0], 7);
      c.value = x[1];
      c.font = font(x[2], true);
      c.alignment = { horizontal: 'left', vertical: 'middle', shrinkToFit: true };
    });
    ws.getRow(5).height = 30;

    const c10 = ws.getCell('B10');
    c10.value = '아래와 같이 견적합니다.';
    c10.font = font(14, true);
    ws.mergeCells('H11:J11');
    const c11 = ws.getCell('H11');
    c11.value = '[단위 : 원, VAT별도]';
    c11.font = font(12, true);
    c11.alignment = { horizontal: 'right', vertical: 'middle' };

    /* 12행: 머리글 */
    const heads = ['NO', '품목', '품명', '상세내역', '스펙', '수량', '제안 단가', '제안가 합계', '비고'];
    ws.getRow(12).height = 20.4;
    heads.forEach((t, i) => {
      const c = ws.getCell(12, BCOL + i);
      c.value = t;
      c.font = font(13, true);
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.fill = fill(HEAD);
      c.border = { top: T, bottom: T, left: i === 0 ? M : T, right: i === heads.length - 1 ? M : T };
    });

    /* 품목 블록 */
    let r = 13;
    const first = r;
    (d.lines || []).forEach((ln, idx) => {
      const specs = (ln.specs || []).filter((s) => s && (s.cat || s.detail || s.spec));
      const span = 1 + specs.length;
      const r1 = r, r2 = r + span - 1;
      for (let k = r1; k <= r2; k++) ws.getRow(k).height = 17.4;
      const mergeIf = (col) => { if (r2 > r1) ws.mergeCells(r1, col, r2, col); };
      [2, 3, 7, 8, 9, 10].forEach(mergeIf);
      const cB = ws.getCell(r1, 2); cB.value = idx + 1;
      const cC = ws.getCell(r1, 3); cC.value = ln.category || '';
      const cG = ws.getCell(r1, 7); cG.value = n(ln.qty);
      const cH = ws.getCell(r1, 8); cH.value = n(ln.unitPrice); cH.numFmt = ACC;
      const cI = ws.getCell(r1, 9);
      const amt = (n(ln.unitPrice) || 0) * (n(ln.qty) || 0);
      cI.value = { formula: 'H' + r1 + '*G' + r1, result: amt };
      cI.numFmt = ACC;
      const cJ = ws.getCell(r1, 10); cJ.value = ln.note || '';
      [cB, cC, cG, cH, cI, cJ].forEach((c) => {
        c.font = font(11, false);
        c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      });
      const cD = ws.getCell(r1, 4);
      cD.value = ln.name || '';
      cD.font = font(11, false, 'Arial');
      cD.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      specs.forEach((s, k) => {
        const rr = r1 + 1 + k;
        const dc = ws.getCell(rr, 4); dc.value = s.cat || ''; dc.font = font(11, false, 'Arial'); dc.alignment = { horizontal: 'center', vertical: 'middle' };
        const ec = ws.getCell(rr, 5); ec.value = s.detail || ''; ec.font = font(11, false); ec.alignment = { horizontal: 'left', vertical: 'middle', shrinkToFit: true };
        const fc = ws.getCell(rr, 6); fc.value = s.spec || ''; fc.font = font(11, false); fc.alignment = { horizontal: 'center', vertical: 'middle', shrinkToFit: true };
      });
      /* 테두리 */
      box(ws, r1, 2, r2, 2, { top: T, bottom: T, left: M, right: T });
      box(ws, r1, 3, r2, 3, { top: T, bottom: T, left: T, right: T });
      box(ws, r1, 4, r2, 4, { top: T, bottom: T, left: T, right: T });
      box(ws, r1, 5, r2, 5, { top: T, bottom: T, left: T, right: T });
      box(ws, r1, 6, r2, 6, { top: T, bottom: T, left: T });
      [7, 8, 9].forEach((c) => box(ws, r1, c, r2, c, { top: T, bottom: T, left: T, right: T }));
      box(ws, r1, 10, r2, 10, { top: T, bottom: T, left: T, right: M });
      r = r2 + 1;
    });
    const last = Math.max(first, r - 1);
    const totals = (d.lines || []).reduce((s, ln) => s + (n(ln.unitPrice) || 0) * (n(ln.qty) || 0), 0);

    /* 합계 */
    const sumRow = r;
    [['합계 (VAT 별도)', { formula: 'SUM(I' + first + ':I' + last + ')', result: totals }],
      ['합계 (VAT 포함)', { formula: 'ROUNDDOWN(I' + sumRow + '*1.1,0)', result: Math.floor(totals * 1.1 + 1e-7) }]].forEach((x, i) => {
      const rr = sumRow + i;
      ws.getRow(rr).height = 20.4;
      ws.mergeCells(rr, 2, rr, 8);
      const lc = ws.getCell(rr, 2);
      lc.value = x[0];
      lc.font = font(13, true);
      lc.alignment = { horizontal: 'center', vertical: 'middle' };
      for (let c = 2; c <= 10; c++) ws.getCell(rr, c).fill = fill(SUMF);
      const vc = ws.getCell(rr, 9);
      vc.value = x[1];
      vc.numFmt = SUMFMT;
      vc.font = font(13, true);
      vc.alignment = { horizontal: 'right', vertical: 'middle' };
      box(ws, rr, 2, rr, 8, { top: T, bottom: T, left: M });
      box(ws, rr, 9, rr, 9, { top: T, bottom: T, left: T, right: T });
      box(ws, rr, 10, rr, 10, { top: T, bottom: T, left: T, right: M });
    });
    r = sumRow + 2;

    const textRow = (txt, sz, opt) => {
      ws.getRow(r).height = sz >= 12 ? 19.2 : 20.4;
      const c = ws.getCell(r, 2);
      c.value = txt;
      c.font = font(sz, true);
      c.alignment = { horizontal: (opt && opt.align) || 'left', vertical: 'middle' };
      if (opt && opt.fill) c.fill = fill(opt.fill);
      r++;
    };
    const notes = (d.notes || []).filter((x) => x && (x.title || x.reason));
    if (notes.length) {
      r++;
      textRow('< 주  석 >', 11, { fill: YEL, align: 'center' });
      notes.forEach((x, i) => {
        textRow((i + 1) + '. ' + (x.title || ''), 11);
        if (x.reason) textRow('사유 : ' + x.reason, 11);
      });
    }
    const conds = (d.conditions || []).filter(Boolean);
    if (conds.length) {
      r++;
      textRow('< 견적 조건 >', 12, { fill: YEL });
      conds.forEach((x, i) => textRow((i + 1) + '. ' + x, 12));
    }
    const endRow = r;
    ws.getRow(endRow).height = 18;
    /* 바깥 프레임 */
    for (let k = 3; k <= endRow; k++) {
      setB(ws.getCell(k, 2), { left: M });
      setB(ws.getCell(k, 10), { right: M });
    }
    setB(ws.getCell(3, 2), { top: D });
    for (let c = 2; c <= 10; c++) {
      setB(ws.getCell(3, c), { top: D });
      setB(ws.getCell(endRow, c), { bottom: M });
    }

    /* 내부 관리용(인쇄 영역 밖) */
    const meta = d.meta || {};
    [['영업대표', meta.rep], ['고객사', meta.customer], ['프로젝트명', meta.project], ['견적일자', null]].forEach((x, i) => {
      const rr = 5 + i;
      const a = ws.getCell(rr, 13); a.value = x[0]; a.font = font(11, false); a.alignment = { horizontal: 'center' };
      const b = ws.getCell(rr, 14); b.font = font(11, false);
      if (i === 3) { const dt = toDate(meta.date); b.value = dt || meta.date || ''; if (dt) b.numFmt = 'yyyy-mm-dd'; b.alignment = { horizontal: 'left' }; } else b.value = x[1] || '';
    });

    /* 로고 */
    if (d.logoBase64) {
      const id = wb.addImage({ base64: d.logoBase64, extension: 'png' });
      ws.addImage(id, { tl: { col: 1.25, row: 2.18 }, ext: { width: 132, height: 40 }, editAs: 'oneCell' });
    }

    ws.pageSetup = {
      paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
      printArea: 'A$1:K$' + (endRow + 1)
    };
    return wb;
  };

  /* ------------------------------------------------------------------
     원가분석표 (내부용)
     d = { no, project, customer, date, rep, rows:[costRows], vendors:[vendorSummary], totals, lowGp, parts:[{vendor, item, partNo, desc, qty}] }
  ------------------------------------------------------------------ */
  X.costWorkbook = function (ExcelJS, d) {
    const wb = new ExcelJS.Workbook();
    wb.creator = '유니포인트 견적서 생성기';
    const ws = wb.addWorksheet('원가분석표', { views: [{ state: 'frozen', ySplit: 9, showGridLines: false, zoomScale: 85 }] });
    const cols = [['A', 1.6], ['B', 6], ['C', 20], ['D', 26], ['E', 8], ['F', 15], ['G', 17], ['H', 16], ['I', 30], ['J', 15], ['K', 17], ['L', 16], ['M', 9]];
    cols.forEach((c) => { ws.getColumn(c[0]).width = c[1]; });

    ws.mergeCells('B2:M2');
    const t = ws.getCell('B2');
    t.value = '원  가  분  석  표';
    t.font = font(20, true);
    t.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(2).height = 36;
    /* 기본 정보: [라벨칸, 값 시작, 값 끝] */
    const slots = [[3, 4, 5], [6, 7, 8], [9, 10, 13]];
    const meta = [[['견적번호', d.no], ['프로젝트명', d.project], ['고객사', d.customer]], [['견적일자', d.date], ['영업대표', d.rep]]];
    meta.forEach((row, ri) => {
      const rr = 4 + ri;
      ws.getRow(rr).height = 19;
      row.forEach((m, i) => {
        const s = slots[i];
        const a = ws.getCell(rr, s[0]); a.value = m[0]; a.font = font(10, true); a.fill = fill('FFF2F2F2'); a.alignment = { horizontal: 'center', vertical: 'middle' };
        ws.mergeCells(rr, s[1], rr, s[2]);
        const b = ws.getCell(rr, s[1]); b.value = m[1] || ''; b.font = font(10, false); b.alignment = { vertical: 'middle' };
        box(ws, rr, s[0], rr, s[2], { top: T, bottom: T, left: T, right: T });
        setB(a, { right: T });
      });
    });

    /* 요약 */
    const tot = d.totals || {};
    const kpis = [[3, 4, '매출 합계', tot.supply, ACC], [6, 7, '매입 합계', tot.cost, ACC], [9, 10, 'GP', tot.gp, ACC], [12, 13, 'GP%', tot.rate, '0.0%']];
    kpis.forEach((k) => {
      const a = ws.getCell(7, k[0]); a.value = k[2]; a.font = font(10, true); a.fill = fill(HEAD); a.alignment = { horizontal: 'center', vertical: 'middle' };
      const b = ws.getCell(7, k[1]); b.value = n(k[3]); b.numFmt = k[4]; b.font = font(12, true); b.alignment = { horizontal: 'right', vertical: 'middle' };
      a.border = { top: T, bottom: T, left: T, right: T };
      b.border = { top: T, bottom: T, left: T, right: T };
    });
    ws.getRow(7).height = 24;

    /* 본표 */
    const H = ['No', '매출 품목', '품명', '수량', '매출 단가', '매출 금액', '매입처', '매입 품목', '매입 단가', '매입 금액', 'GP', 'GP%'];
    const hr = 9;
    ws.getRow(hr).height = 22;
    H.forEach((h, i) => {
      const c = ws.getCell(hr, 2 + i);
      c.value = h; c.font = font(10, true); c.fill = fill(HEAD);
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.border = { top: T, bottom: T, left: T, right: T };
    });
    const low = (n(d.lowGp) || 0) / 100;
    let r = hr + 1;
    const r0 = r;
    (d.rows || []).forEach((row) => {
      const vals = [row.no, row.category, row.name, n(row.qty), n(row.price), null, row.vendor, row.costItem, n(row.cost), null, null, null];
      vals.forEach((v, i) => {
        const c = ws.getCell(r, 2 + i);
        c.value = v;
        c.font = font(10, false);
        c.border = { top: T, bottom: T, left: T, right: T };
        c.alignment = { vertical: 'middle', wrapText: i === 1 || i === 2 || i === 7, horizontal: i === 0 || i === 3 ? 'center' : (i >= 4 ? undefined : 'left') };
      });
      ws.getCell(r, 7).value = { formula: 'E' + r + '*F' + r, result: n(row.amount) };
      ws.getCell(r, 11).value = { formula: 'E' + r + '*J' + r, result: n(row.costAmount) };
      ws.getCell(r, 12).value = { formula: 'G' + r + '-K' + r, result: n(row.gp) };
      ws.getCell(r, 13).value = { formula: 'IF(G' + r + '=0,"",L' + r + '/G' + r + ')', result: row.rate === null ? '' : row.rate };
      [6, 7, 10, 11, 12].forEach((c) => { ws.getCell(r, c).numFmt = ACC; });
      ws.getCell(r, 13).numFmt = '0.0%';
      ws.getCell(r, 13).alignment = { horizontal: 'right', vertical: 'middle' };
      if (row.cost === null) ws.getCell(r, 10).fill = fill('FFFBE5E2');
      if (row.rate !== null && row.rate < low) {
        [12, 13].forEach((c) => { ws.getCell(r, c).font = Object.assign(font(10, true), { color: { argb: 'FFC00000' } }); });
      }
      r++;
    });
    const r1 = Math.max(r0, r - 1);
    ws.mergeCells(r, 2, r, 6);
    const tl = ws.getCell(r, 2); tl.value = '합계'; tl.font = font(11, true); tl.alignment = { horizontal: 'center' };
    for (let c = 2; c <= 13; c++) { const cc = ws.getCell(r, c); cc.fill = fill(SUMF); cc.border = { top: T, bottom: M, left: T, right: T }; }
    ws.getCell(r, 7).value = { formula: 'SUM(G' + r0 + ':G' + r1 + ')', result: n(tot.supply) };
    ws.getCell(r, 11).value = { formula: 'SUM(K' + r0 + ':K' + r1 + ')', result: n(tot.cost) };
    ws.getCell(r, 12).value = { formula: 'G' + r + '-K' + r, result: n(tot.gp) };
    ws.getCell(r, 13).value = { formula: 'IF(G' + r + '=0,"",L' + r + '/G' + r + ')', result: tot.rate === null ? '' : tot.rate };
    [7, 11, 12].forEach((c) => { const cc = ws.getCell(r, c); cc.numFmt = ACC; cc.font = font(11, true); });
    ws.getCell(r, 13).numFmt = '0.0%'; ws.getCell(r, 13).font = font(11, true);
    ws.getRow(r).height = 22;
    const sumRow = r;
    r += 2;

    /* 매입처별 합계 */
    const sh = ws.getCell(r, 2); sh.value = '매입처별 합계'; sh.font = font(11, true);
    r++;
    /* 열: B:C 매입처 | D 품목 수 | E:F 매입 금액 | G 부가세 | H 합계 */
    const vhead = (rr) => {
      ws.mergeCells(rr, 2, rr, 3);
      ws.mergeCells(rr, 5, rr, 6);
      [[2, '매입처'], [4, '품목 수'], [5, '매입 금액(공급가)'], [7, '부가세'], [8, '합계(VAT 포함)']].forEach((x) => {
        const c = ws.getCell(rr, x[0]); c.value = x[1]; c.font = font(10, true); c.fill = fill(HEAD); c.alignment = { horizontal: 'center', vertical: 'middle' };
      });
      for (let c = 2; c <= 8; c++) ws.getCell(rr, c).border = { top: T, bottom: T, left: T, right: T };
    };
    vhead(r);
    r++;
    (d.vendors || []).forEach((v) => {
      ws.mergeCells(r, 2, r, 3);
      ws.mergeCells(r, 5, r, 6);
      ws.getCell(r, 2).value = v.vendor;
      ws.getCell(r, 4).value = v.count;
      ws.getCell(r, 5).value = n(v.costAmount);
      ws.getCell(r, 7).value = { formula: 'ROUNDDOWN(E' + r + '*0.1,0)', result: n(v.vat) };
      ws.getCell(r, 8).value = { formula: 'E' + r + '+G' + r, result: n(v.total) };
      for (let c = 2; c <= 8; c++) { const cc = ws.getCell(r, c); cc.font = font(10, false); cc.border = { top: T, bottom: T, left: T, right: T }; if (c >= 5) cc.numFmt = ACC; }
      ws.getCell(r, 4).alignment = { horizontal: 'center' };
      r++;
    });
    r++;
    const note = ws.getCell(r, 2);
    note.value = '※ 금액은 부가세 별도 공급가 기준. GP% = GP ÷ 매출 금액. ' + (low ? 'GP% ' + (low * 100) + '% 미만은 빨간색 표시.' : '');
    note.font = Object.assign(font(9, false), { color: { argb: 'FF555555' } });

    ws.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 }, printArea: 'A$1:M$' + r };

    /* 매입 내역(파트) */
    if ((d.parts || []).length) {
      const ps = wb.addWorksheet('매입 상세', { views: [{ state: 'frozen', ySplit: 2, showGridLines: false }] });
      [['A', 1.6], ['B', 16], ['C', 24], ['D', 16], ['E', 60], ['F', 8]].forEach((c) => { ps.getColumn(c[0]).width = c[1]; });
      const ph = ['매입처', '매입 품목', '파트 번호', '상세 내역', '수량'];
      ph.forEach((h, i) => { const c = ps.getCell(2, 2 + i); c.value = h; c.font = font(10, true); c.fill = fill(HEAD); c.border = { top: T, bottom: T, left: T, right: T }; c.alignment = { horizontal: 'center' }; });
      let pr = 3;
      d.parts.forEach((p) => {
        [p.vendor, p.item, p.partNo, p.desc, n(p.qty)].forEach((v, i) => { const c = ps.getCell(pr, 2 + i); c.value = v === null ? '' : v; c.font = font(10, false); c.border = { top: T, bottom: T, left: T, right: T }; });
        ps.getCell(pr, 6).alignment = { horizontal: 'center' };
        pr++;
      });
    }
    ws.getCell(sumRow, 2).alignment = { horizontal: 'center', vertical: 'middle' };
    return wb;
  };

  /* ------------------------------------------------------------------
     견적요청서 (매입처 발송용 첨부)
     d = { logoBase64, no, date, replyBy, vendor:{name,contact}, sender:{company, rep, tel, mobile, email},
           title, customer, items:[{name,spec,maker,model,qty,unit,note}], conditions:{dueDate,deliveryPlace,install,other}, requests:[str] }
  ------------------------------------------------------------------ */
  X.rfqWorkbook = function (ExcelJS, d) {
    const wb = new ExcelJS.Workbook();
    wb.creator = '유니포인트 견적서 생성기';
    const ws = wb.addWorksheet('견적요청서', { views: [{ state: 'normal', showGridLines: false, zoomScale: 85 }] });
    [['A', 1.6], ['B', 6], ['C', 18], ['D', 44], ['E', 18], ['F', 7], ['G', 6], ['H', 16], ['I', 20], ['J', 16], ['K', 17], ['L', 18], ['M', 1.6]].forEach((c) => { ws.getColumn(c[0]).width = c[1]; });
    ws.getRow(1).height = 10;
    ws.mergeCells('B2:L2');
    const t = ws.getCell('B2');
    t.value = '견  적  요  청  서';
    t.font = font(24, true);
    t.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(2).height = 44;
    box(ws, 2, 2, 2, 12, { bottom: D });

    const left = [['수      신', (d.vendor.name || '') + ' 귀중'], ['참      조', d.vendor.contact || ''], ['요청번호', d.no || ''], ['요청일자', d.date || ''], ['회신 요청일', d.replyBy || '']];
    const right = [['발      신', d.sender.company || ''], ['담 당 자', d.sender.rep || ''], ['연 락 처', [d.sender.tel, d.sender.mobile].filter(Boolean).join(' / ')], ['이 메 일', d.sender.email || ''], ['건      명', d.title || '']];
    for (let i = 0; i < 5; i++) {
      const r = 4 + i;
      ws.getRow(r).height = 20;
      const a = ws.getCell(r, 2); ws.mergeCells(r, 2, r, 3); a.value = left[i][0]; a.font = font(10, true); a.fill = fill('FFF2F2F2'); a.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.mergeCells(r, 4, r, 4);
      const b = ws.getCell(r, 4); b.value = left[i][1]; b.font = font(10, i === 0); b.alignment = { vertical: 'middle' };
      const c = ws.getCell(r, 5); ws.mergeCells(r, 5, r, 6); c.value = right[i][0]; c.font = font(10, true); c.fill = fill('FFF2F2F2'); c.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.mergeCells(r, 7, r, 12);
      const e = ws.getCell(r, 7); e.value = right[i][1]; e.font = font(10, i === 4); e.alignment = { vertical: 'middle', shrinkToFit: true };
      box(ws, r, 2, r, 3, { top: T, bottom: T, left: T, right: T });
      box(ws, r, 4, r, 4, { top: T, bottom: T, left: T, right: T });
      box(ws, r, 5, r, 6, { top: T, bottom: T, left: T, right: T });
      box(ws, r, 7, r, 12, { top: T, bottom: T, left: T, right: T });
    }
    if (d.logoBase64) {
      const id = wb.addImage({ base64: d.logoBase64, extension: 'png' });
      ws.addImage(id, { tl: { col: 1.15, row: 1.2 }, ext: { width: 110, height: 34 }, editAs: 'oneCell' });
    }

    let r = 10;
    const g = ws.getCell(r, 2); g.value = '아래 품목에 대한 견적을 요청드립니다. 노란 칸(제안 모델·단가·금액·회신 비고)을 채워 회신해 주시면 감사하겠습니다.'; g.font = font(10, false);
    r += 1;
    const H = ['No', '품목', '요구 사양', '제조사/모델', '수량', '단위', '비고', '제안 모델', '제안 단가(VAT별도)', '금액', '회신 비고'];
    ws.getRow(r).height = 30;
    H.forEach((h, i) => {
      const c = ws.getCell(r, 2 + i);
      c.value = h; c.font = font(10, true);
      c.fill = fill(i >= 7 ? 'FFFFE699' : HEAD);
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.border = { top: T, bottom: T, left: T, right: T };
    });
    r++;
    const r0 = r;
    (d.items || []).forEach((it, i) => {
      const lines = String(it.spec || '').split('\n').length;
      ws.getRow(r).height = Math.max(22, Math.min(15 * lines + 6, 220));
      const vals = [i + 1, it.name || '', it.spec || '', [it.maker, it.model].filter(Boolean).join(' '), n(it.qty), it.unit || '', it.note || '', '', null, null, ''];
      vals.forEach((v, k) => {
        const c = ws.getCell(r, 2 + k);
        c.value = v;
        c.font = font(10, k === 1);
        c.alignment = { vertical: 'middle', wrapText: true, horizontal: k === 0 || k === 4 || k === 5 ? 'center' : 'left' };
        c.border = { top: T, bottom: T, left: T, right: T };
        if (k >= 7) c.fill = fill('FFFFF2CC');
      });
      ws.getCell(r, 10).numFmt = ACC;
      ws.getCell(r, 11).value = { formula: 'IF(J' + r + '="","",F' + r + '*J' + r + ')', result: '' };
      ws.getCell(r, 11).numFmt = ACC;
      r++;
    });
    const r1 = Math.max(r0, r - 1);
    ws.mergeCells(r, 2, r, 10);
    const sl = ws.getCell(r, 2); sl.value = '합계 (VAT 별도)'; sl.font = font(10, true); sl.alignment = { horizontal: 'center' };
    const sv = ws.getCell(r, 11); sv.value = { formula: 'SUM(K' + r0 + ':K' + r1 + ')', result: 0 }; sv.numFmt = ACC; sv.font = font(10, true);
    for (let c = 2; c <= 12; c++) { const cc = ws.getCell(r, c); cc.fill = fill(SUMF); cc.border = { top: T, bottom: T, left: T, right: T }; }
    r += 2;

    const c = d.conditions || {};
    const cond = [['납품 희망일', c.dueDate], ['납품 장소', c.deliveryPlace], ['설치·구성', c.install], ['기타 조건', c.other]].filter((x) => x[1]);
    if (cond.length) {
      const h = ws.getCell(r, 2); h.value = '■ 요청 조건'; h.font = font(10, true); r++;
      cond.forEach((x) => {
        const a = ws.getCell(r, 3); a.value = x[0]; a.font = font(10, true);
        ws.mergeCells(r, 4, r, 12);
        const b = ws.getCell(r, 4); b.value = x[1]; b.font = font(10, false); b.alignment = { wrapText: true, vertical: 'top' };
        r++;
      });
      r++;
    }
    const reqs = (d.requests || []).filter(Boolean);
    if (reqs.length) {
      const h = ws.getCell(r, 2); h.value = '■ 회신 요청 사항'; h.font = font(10, true); r++;
      reqs.forEach((x) => {
        ws.mergeCells(r, 3, r, 12);
        const b = ws.getCell(r, 3); b.value = '- ' + x; b.font = font(10, false);
        r++;
      });
    }
    ws.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 }, printArea: 'A$1:M$' + r };
    return wb;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = X;
  else root.XL = X;
})(typeof window !== 'undefined' ? window : globalThis);
