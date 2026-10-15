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
| `supabase/schema.sql` | DB 테이블 만들기 (SQL Editor에서 1회 실행) |
| `test/` | 계산 로직 테스트, 로컬 개발 서버(모의 DB), 브라우저 흐름 테스트 |

## 비밀값 관리

**비밀번호·키 같은 실제 값은 git에 올리지 않습니다.**

- 배포(Vercel): Vercel → Settings → Environment Variables 에만 넣습니다.
- 로컬: `.env.example`을 복사해 `.env.local`을 만들고 값을 채웁니다. `.env.local`은 `.gitignore`로 커밋되지 않습니다.

| 이름 | 값 |
|---|---|
| `APP_PASSWORD` | 팀 공용 비밀번호 |
| `SUPABASE_URL` | Supabase → Project Settings → Data API 의 Project URL |
| `SUPABASE_SECRET_KEY` | Supabase → Project Settings → API Keys → Secret key (`sb_secret_…`) |
| `USE_REAL_SUPABASE` | 로컬 테스트 서버만: `1`이면 실제 DB, 비우면 모의 DB |

## 로컬 실행

```
npm install
node build.js
node test/dev-server.js   # http://localhost:3999 , .env.local 의 APP_PASSWORD (없으면 test-pass) · 기본 모의 DB
npm test                  # 계산 로직 테스트
```

화면 코드를 고친 뒤에는 `node build.js`로 `public/index.html`을 다시 만들어 커밋합니다 (Vercel도 배포 시 자동 실행).
