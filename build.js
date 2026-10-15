// src/ → public/index.html (단일 페이지). 외부 의존성 없이 node build.js 로 실행.
const fs = require('fs');
const path = require('path');
const src = (f) => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const logo = src('logo.b64').trim();
const libs = [
  'https://cdn.jsdelivr.net/npm/preact@10.19.3/dist/preact.umd.js',
  'https://cdn.jsdelivr.net/npm/preact@10.19.3/hooks/dist/hooks.umd.js',
  'https://cdn.jsdelivr.net/npm/htm@3.1.1/dist/htm.umd.js'
];
const js = ['logic.js', 'excel.js', 'base.js', 'ai.js', 'doc.js', 'steps.js', 'views.js'].map((f) => '/* ---- ' + f + ' ---- */\n' + src(f)).join('\n');
const head = src('head.html');
const out = '<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22%3E%3Crect width=%2232%22 height=%2232%22 rx=%226%22 fill=%22%231B47A0%22/%3E%3Ccircle cx=%2223%22 cy=%229%22 r=%224%22 fill=%22%23EE7D1E%22/%3E%3C/svg%3E">\n' + head + '\n</head>\n<body>\n<div id="app"></div>\n' + libs.map((u) => '<script src="' + u + '"></script>').join('\n') + '\n<script>\n"use strict";\nconst LOGO_B64 = "' + logo + '";\n' + js.replace(/<\/script/gi, '<\\/script') + '\n</script>\n</body>\n</html>\n';
fs.mkdirSync(path.join(__dirname, 'public'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'public', 'index.html'), out);
console.log('public/index.html', (out.length / 1024).toFixed(1) + ' KB');
