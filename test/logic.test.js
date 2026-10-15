const L = require('../src/logic.js');
const assert = require('assert');
// GP pricing
assert.strictEqual(L.priceFromGp(65500000, 10, 1000), 72778000);
assert.strictEqual(L.priceFromGp(900000, 10, 1), 1000000);
assert.strictEqual(L.priceFromGp(900000, 10, 1000), 1000000);
assert.strictEqual(L.priceFromGp(100, 100, 1), null);
console.log('gp rate actual', L.pct(L.gpRateOf(72778000, 65500000), 2));
// vat
assert.strictEqual(L.vat(145556000), 14555600);
assert.strictEqual(L.vat(1234567), 123456);
assert.strictEqual(L.vat(-1234567), -123456);
// korean amount
assert.strictEqual(L.koreanAmount(11000000), '일천일백만');
assert.strictEqual(L.koreanAmount(160111600), '일억육천일십일만일천육백');
assert.strictEqual(L.koreanAmount(10000), '일만');
assert.strictEqual(L.koreanAmount(100000000), '일억');
// num
assert.strictEqual(L.num('₩1,234,000'), 1234000);
assert.strictEqual(L.num('(1,000)'), -1000);
assert.strictEqual(L.num('-500'), -500);
assert.strictEqual(L.num('abc'), null);
// dates
assert.strictEqual(L.addBizDays('2026-10-15', 2), '2026-10-19');
assert.strictEqual(L.fmtDateK('2026-10-19'), '2026-10-19(월)');
assert.strictEqual(L.ymd(L.resolveValidity('2026-03-05', '견적일로부터 1주')), '2026-03-12');
assert.strictEqual(L.ymd(L.parseYmd('2026년 03월 05일')), '2026-03-05');
// quote no
assert.strictEqual(L.nextQuoteNo('UP', '2026-10-15', ['UP-261015-01', 'UP-261015-03', 'UP-261014-07']), 'UP-261015-04');
// review & adopt
const project = {
  items: [{ id: 'r1', name: 'GPU 서버', qty: 2, unit: '대' }, { id: 'r2', name: '랙', qty: 1 }],
  quotes: [
    { id: 'q1', vendorName: 'A', vat: 'excluded', quoteDate: '2026-03-05', terms: { validUntil: '견적일로부터 1주' }, totals: { supply: 131000000, vat: 13100000, total: 144100000 },
      items: [{ id: 'a1', reqItemId: 'r1', model: 'SR650 V4', qty: 2, unitPrice: 65500000, amount: 131000000, match: 'partial', matchNote: 'GPU 변경' }],
      deviations: [{ reqItemId: 'r1', title: 'GPU 모델 변경', reason: '미지원' }] },
    { id: 'q2', vendorName: 'B', vat: 'included', items: [{ id: 'b1', reqItemId: 'r1', model: 'X', qty: 2, unitPrice: 71500000, amount: 143000000, match: 'exact' }, { id: 'b2', reqItemId: null, name: '배송비', qty: 1, unitPrice: 110000, amount: 110000, match: 'extra' }] }
  ]
};
const rv = L.reviewQuote(project, project.quotes[0], '2026-03-06');
console.log(rv.counts, rv.findings.map(f => f.level + ': ' + f.text).join('\n'));
const ad = L.effectiveAdopt(project);
console.log('adopt', ad);
assert.deepStrictEqual(ad.r1, { quoteId: 'q2', quoteItemId: 'b1' }); // q2 = 71.5M VAT포함 → 65.0M 공급가로 더 저렴
// supply unit of q2 is 65,000,000 -> cheaper! check
console.log('q2 supply unit', L.supplyUnit(project.quotes[1], project.quotes[1].items[0]));
assert.strictEqual(L.supplyUnit(project.quotes[1], project.quotes[1].items[0]), 65000000);
project.adopt = { r1: { quoteId: 'q1', quoteItemId: 'a1' } };
const lines = L.buildSalesLines(project, { gpRate: 10, priceRound: 1000 });
console.log(lines.map(l => [l.category, l.name, l.qty, l.costUnit, l.unitPrice, l.vendorName]));
const tot = L.salesTotals(lines);
console.log(tot);
assert.strictEqual(tot.supply, 145556000);
assert.strictEqual(tot.cost, 131000000);
console.log(L.collectDeviations(project));
console.log(L.extraQuoteItems(project).length, 'extras (q2 not adopted → 0)');
// 요청 품목 없이 매입 견적부터 시작
const qOnly = {
  items: [],
  quotes: [
    { id: 'q1', vendorName: 'A', vat: 'excluded', items: [
      { id: 'a1', reqItemId: null, model: 'SR650 V4', name: 'GPU서버', qty: 2, unitPrice: 65500000, amount: 131000000, match: 'extra', specs: [{ cat: 'GPU', detail: 'RTX 6000 Ada', spec: '2EA' }] },
      { id: 'a2', reqItemId: null, name: '배송비', qty: 1, unitPrice: 110000, amount: 110000, match: 'extra' }],
      deviations: [{ reqItemId: null, title: 'GPU 모델 변경', reason: '' }] },
    { id: 'q2', vendorName: 'B', vat: 'included', items: [{ id: 'b1', reqItemId: null, model: 'X', qty: 1, unitPrice: 1100000, amount: 1100000, match: 'extra' }] }
  ]
};
assert.strictEqual(L.quoteOnly(qOnly), true);
assert.strictEqual(L.quoteOnly({ items: [], quotes: [] }), false);
assert.strictEqual(L.quoteOnly(project), false);
const qLines = L.buildSalesLines(qOnly, { gpRate: 10, priceRound: 1000 });
assert.deepStrictEqual(qLines.map((l) => [l.category, l.name, l.qty, l.costUnit, l.unitPrice, l.vendorName]),
  [['GPU서버', 'SR650 V4', 2, 65500000, 72778000, 'A'], ['배송비', '배송비', 1, 110000, 123000, 'A']]);
assert.strictEqual(qLines[0].specs.length, 1);
assert.strictEqual(L.salesTotals(qLines).supply, 145679000);
const qLinesB = L.buildSalesLines(qOnly, { gpRate: 10, priceRound: 1000 }, 'q2');
assert.deepStrictEqual(qLinesB.map((l) => [l.vendorName, l.costUnit, l.unitPrice]), [['B', 1000000, 1112000]]);
qOnly.sales = { lines: qLines };
assert.deepStrictEqual(L.collectDeviations(qOnly).map((d) => d.title), ['GPU 모델 변경']);
qOnly.sales = { lines: qLinesB };
assert.deepStrictEqual(L.collectDeviations(qOnly), []);
assert.ok(!L.reviewQuote(qOnly, qOnly.quotes[0], '2026-03-06').findings.some((f) => /요청 외 항목/.test(f.text)));
// eml
const eml = L.buildEml({ to: [{ name: '에이사 김대리', email: 'kim@a.com' }], subject: '[유니포인트] 견적 요청 - AI GPU서버 도입 (UP-261015-01) 아주 긴 제목 테스트입니다', text: '안녕하세요\n본문', html: '<p>안녕하세요</p>', attachments: [{ filename: '견적요청서_UP-261015-01.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes: new Uint8Array([1,2,3,4,5]) }] });
console.log(eml.split('\r\n').slice(0, 12).join('\n'));
// verify b64 against Buffer
for (const s of ['', 'a', 'ab', 'abc', '한글 테스트', 'x'.repeat(100)]) assert.strictEqual(L.b64utf8(s), Buffer.from(s, 'utf8').toString('base64'));
console.log('ALL OK');
