// 헤드리스 브라우저로 6단계 흐름 확인 (테스트 전용)
const { chromium } = require(process.env.PW_PATH);
const fs = require('fs');
const path = require('path');
const NM = process.env.NM_PATH;
const OUT = process.env.OUT_DIR;
const BASE = 'http://localhost:3999';
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = []; global.__errors = errors; global.__page = page;
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await ctx.route('https://cdn.jsdelivr.net/npm/**', (route) => {
    const m = /\/npm\/(@?[^@]+)@[^/]+\/(.*)$/.exec(route.request().url());
    const f = path.join(NM, m[1], m[2]);
    route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(f) });
  });
  await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const shot = (n) => page.screenshot({ path: path.join(OUT, n + '.png'), fullPage: true });
  const downloads = [];
  let dn = 0; page.on('download', async (d) => { const p = path.join(OUT, 'dl' + (++dn) + '_' + d.suggestedFilename()); await d.saveAs(p); downloads.push(p + ' url=' + d.url().slice(0, 30)); });

  await page.goto(BASE);
  await page.waitForSelector('#login-pw');
  await shot('00-login');
  await page.fill('#login-pw', 'wrong');
  await page.click('button[type=submit]');
  await page.waitForSelector('.note.bad');
  await page.fill('#login-pw', 'test-pass');
  await page.click('button[type=submit]');
  await page.waitForSelector('text=새 견적');
  await page.evaluate(() => fetch('/api/docs', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: 'vendors/v1', data: { name: '에이테크', contact: '박대리', email: 'park@atech.co.kr' } }) }));
  await page.reload();
  await page.waitForSelector('text=새 견적');
  await page.waitForTimeout(500);
  await shot('01-home');
  await page.click('.plist-h .btn.primary');
  await page.waitForSelector('#req-raw');
  await page.fill('#req-raw', '안녕하세요 홍길동손해보험 김과장입니다. AI GPU 서버 2대 견적 부탁드립니다. RTX Pro 6000 4장, 메모리 256GB...');
  await page.click('text=AI로 요청 정리');
  await page.waitForSelector('text=요청 품목', { timeout: 15000 });
  await page.waitForTimeout(400);
  await shot('02-items');
  // 3단계
  await page.click('.stepper .step:nth-child(3)');
  await page.waitForSelector('text=받는 매입처');
  await page.click('label:has-text("에이테크") input[type=checkbox]');
  await page.waitForSelector('text=Outlook 메일 파일');
  await page.click('text=미리보기');
  await page.waitForTimeout(400);
  await shot('03-rfq');
  await page.click('button:has-text("Outlook 메일 파일")');
  await page.waitForTimeout(2500);
  await page.click('button:has-text("견적요청서 엑셀")');
  await page.waitForTimeout(2000);
  // 4단계: 매입 견적 엑셀 업로드
  await page.click('.stepper .step:nth-child(4)');
  await page.waitForSelector('text=매입 견적 추가');
  await page.setInputFiles('.drop input[type=file]', process.env.PURCHASE_XLSX);
  await page.waitForSelector('.fchip:has-text("자")', { timeout: 15000 });
  await page.click('button:has-text("AI로 읽고 검토")');
  await page.waitForSelector('.qcard', { timeout: 15000 });
  await page.waitForTimeout(500);
  await shot('04-quotes');
  // 5단계
  await page.click('.stepper .step:nth-child(5)');
  await page.click('button:has-text("견적서 만들기")');
  await page.waitForSelector('.qdoc');
  await page.waitForTimeout(800);
  await shot('05-sales');
  await page.click('button:has-text("엑셀(.xlsx)")');
  await page.waitForTimeout(2500);
  await page.click('button:has-text("PDF")');
  await page.waitForTimeout(4000);
  // 6단계
  await page.click('.stepper .step:nth-child(6)');
  await page.waitForSelector('.kpis');
  await shot('06-cost');
  await page.click('button:has-text("원가분석표 엑셀")');
  await page.waitForTimeout(2500);
  // 모바일
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await shot('07-mobile');
  // 다크
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.click('.stepper .step:nth-child(5)');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, '08-dark.png') });
  const prompts = await (await fetch(BASE + '/__prompts')).text();
  console.log(JSON.stringify({ errors, downloads: downloads.map((d) => path.basename(d)), prompts }, null, 1));
  await browser.close();
})().catch(async (e) => { console.error('E2E FAIL', e.message.split('\n')[0]); try { await global.__page.screenshot({ path: path.join(OUT, 'zz-fail.png'), fullPage: true }); } catch (x) {} console.error(JSON.stringify(global.__errors)); process.exit(1); });
