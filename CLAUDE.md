# CLAUDE.md — Quotation-Generator 작업 인수인계

Claude Code가 이 저장소에서 작업을 이어받기 위한 문서. 요구사항 전체는 `PRD.md`, 실행법은 `README.md`.

## 1. 무엇을 만드는가
유니포인트(IT 장비 유통, GPU 서버 등) 견적 업무 자동화 웹앱.
흐름: **고객 요청 → 요청 정리 → 매입 요청(Outlook .eml) → 매입 검토 → 매출 견적서 → 원가분석표**

## 2. 사용자가 확정한 결정
| 항목 | 결정 |
|---|---|
| GP 계산 | **GP율(매출 대비)**: 제안 단가 = 매입 단가 ÷ (1 − GP%), 설정 단위(기본 1,000원) **올림** |
| 매출 견적서 서식 | **기존 양식 그대로** — 원본: `../example doc/매출견적서/매출견적서 예시1_GPU서버.xlsx` (시트 `표지`) |
| 매입 견적 예시 | `../example doc/매입견적서/매입견적서 예시1_GPU서버.xlsx` (Lenovo 파트너형: 모델 1행 + 파트번호 목록) |
| 메일 | **Outlook** (커넥터 없음) → `.eml`(X-Unsent: 1)을 zip으로 내려받아 열면 새 메일 창 |
| 인프라 | GitHub + **Vercel**(정적 페이지 + Node 함수) + **Supabase** |
| 로그인 | 개인 계정 없이 **팀 공용 비밀번호 1개** (`APP_PASSWORD`, HttpOnly 서명 쿠키 30일) |
| 원가분석표 | 내부용. 고객용 견적서 파일과 반드시 분리 |
| AI 기능 | **사용 안 함** (2026-10-15 결정). 1단계·4단계는 표에 직접 입력. 첨부파일은 내용 미리보기만 제공 |

## 3. 구조 (PRD와 다른 점 포함)
- PRD는 Next.js를 적었지만 **실제 구현은 프레임워크 없음**: `src/*.js`(Preact + htm, 빌드 도구 없음) → `node build.js` → `public/index.html` 한 파일. 이전 프로토타입 화면을 그대로 살리려는 선택.
- PRD의 정규화 테이블 대신 **문서형 테이블 1개** `public.docs(path, collection, data jsonb, updated_at)`.
  - 경로: `projects/{id}`(목록용 요약), `projectData/{id}`(견적 1건 전체), `vendors/{id}`, `settings/main`
  - RLS 켜고 정책 없음 → 브라우저 공개키로는 접근 불가, `api/`만 secret key로 읽고 씀
- 서버 함수: `api/login.js`(비밀번호/쿠키), `api/docs.js`(GET path|collection, PUT, DELETE). AI용 `api/ai.js`는 삭제됨
- 클라이언트 핵심 파일
  - `src/logic.js` 계산·검토·한글금액·견적번호·.eml(MIME) 빌더 — Node에서도 동작, `npm test`
  - `src/excel.js` ExcelJS 빌더 3종: `salesWorkbook`(기존 양식 재현), `costWorkbook`, `rfqWorkbook`
  - `src/files.js` 첨부파일 읽기(SheetJS/pdf.js/mammoth/eml) → 화면 미리보기용 텍스트·이미지
  - `src/doc.js` 설정 기본값(회사 정보는 원본 견적서에서 가져옴), 견적서 HTML 미리보기, 엑셀/PDF/eml 내보내기
  - `src/steps.js` 6단계 화면, `src/views.js` 작업영역·목록·매입처·설정·로그인·앱 부팅
  - `src/base.js` 저장소(Store: api/local), 라이브러리 지연 로드(jsDelivr), 공용 컴포넌트
- 외부 라이브러리는 모두 jsDelivr 고정 버전: preact 10.19.3, htm 3.1.1, xlsx 0.18.5, exceljs 4.4.0, pdfjs-dist 3.11.174(워커를 script로 로드), mammoth 1.6.0, jszip 3.10.1, html2canvas 1.4.1, jspdf 2.5.1

## 4. 현재 상태
### 완료
- 6단계 전체 화면, 로그인, 서버 API, Supabase 스키마
- **Supabase `docs` 테이블 생성 완료** (SQL Editor에서 `supabase/schema.sql` 실행됨)
- GitHub `main`에 v0.1 코드 push (2026-10-15)
- **Vercel 배포 완료**: 프로젝트 `quotation-generator` (팀 juny031612-1489's projects), 주소 https://quotation-generator-blond.vercel.app — `main` push 시 자동 배포
- Vercel 환경변수(Production/Preview): `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `APP_PASSWORD`. (`ANTHROPIC_MODEL`이 남아 있으면 쓰지 않으므로 지워도 됨)
- AI 기능 제거: 1단계·4단계 직접 입력, 첨부파일은 미리보기만
- 계산 검증: 매입 65,500,000 · GP 10% → 72,778,000 / ×2 → GP 14,556,000 (10.0%)

### 미완료 (다음 할 일)
1. 배포 후 실제 환경 점검: 로그인, 저장/새로고침 유지, 첨부 미리보기(매입견적 예시 엑셀), 엑셀·PDF·eml 다운로드(한글 파일명), Outlook에서 .eml이 새 메일 창으로 열리는지
2. PRD 11장 미결 사항: 영업대표 실명·연락처(현재 예시값 "홍길동 선임"), 원본 파일 보관 여부, 직인 이미지, 견적번호 접두어(기본 `UP`)
3. 사용자 홈 폴더(`C:\Users\SEODONGJUN\.git`)에 같은 원격을 가리키는 잘못된 git 저장소가 있음 — 그 위치에서 git 명령 금지

## 5. 알아둘 점 / 알려진 이슈
- 첨부파일은 브라우저에서만 읽음(서버 전송 없음). 글자로 읽힌 1단계 첨부는 견적 건에 저장(30,000자까지), 이미지는 화면에서만 보임. 4단계 원문 텍스트는 매입 견적의 `source`로 보관.
- 데이터 갱신은 실시간이 아니라 20초 폴링 + 창 포커스 시 새로고침. 같은 견적을 두 명이 동시에 고치면 마지막 저장이 이김.
- `.msg`(Outlook 원본)·HWP는 읽지 못함 → 본문 복사/PDF 변환 안내.
- 헤드리스 리눅스 Chromium에서는 한글 다운로드 파일명이 "download"로 나왔음(테스트 환경 특성). 실제 Windows Chrome/Edge에서 확인 필요.
- 화면 코드 수정 후 반드시 `node build.js`로 `public/index.html` 재생성(Vercel도 배포 시 실행).
- `test/e2e.js`는 Playwright 경로·node_modules 경로를 환경변수(`PW_PATH`, `NM_PATH`, `OUT_DIR`, `PURCHASE_XLSX`)로 받음. 로컬 비밀번호 `test-pass`.
- 견적서 엑셀 인쇄영역: ExcelJS `printArea`는 `'A$1:K$n'` 형식으로 넣어야 `$A$1:$K$n`이 됨(이미 반영).
