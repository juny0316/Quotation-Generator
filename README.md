# Quotation-Generator

유니포인트 견적서 생성기 — 고객 요청 → 요청 정리 → 매입 요청(Outlook .eml) → 매입 검토 → 매출 견적서(기존 양식) → 원가분석표

자세한 요구사항은 [PRD.md](PRD.md) 참고.

## 구조

| 경로 | 내용 |
|---|---|
| `src/` | 화면 코드 (Preact + htm, 빌드 도구 없음) |
| `public/index.html` | `node build.js`로 만드는 배포용 단일 페이지 |
| `api/login.js` | 팀 공용 비밀번호 확인 → 30일 쿠키 |
| `api/docs.js` | 데이터 저장소 (Supabase `docs` 테이블) |
| `api/ai.js` | AI 정리 (Anthropic API, 서버에서만 호출) |
| `supabase/schema.sql` | DB 테이블 만들기 (SQL Editor에서 1회 실행) |
| `test/` | 계산 로직 테스트, 로컬 개발 서버(모의 DB·AI), 브라우저 흐름 테스트 |

## Vercel 환경변수

| 이름 | 값 |
|---|---|
| `APP_PASSWORD` | 팀 공용 비밀번호 |
| `SUPABASE_URL` | `https://oryjutumjluttofaviie.supabase.co` |
| `SUPABASE_SECRET_KEY` | Supabase → Project Settings → API Keys → Secret key |
| `ANTHROPIC_API_KEY` | console.anthropic.com 에서 발급 |
| `ANTHROPIC_MODEL` (선택) | 기본 `claude-sonnet-4-5` |

## 로컬 실행

```
npm install
node build.js
node test/dev-server.js   # http://localhost:3999 , 비밀번호 test-pass (모의 DB·AI)
npm test                  # 계산 로직 테스트
```

화면 코드를 고친 뒤에는 `node build.js`로 `public/index.html`을 다시 만들어 커밋합니다 (Vercel도 배포 시 자동 실행).
