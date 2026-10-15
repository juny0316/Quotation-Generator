-- 견적서 생성기 저장소 테이블
-- 문서형 저장: path = '컬렉션/문서ID' (예: projects/p1, projectData/p1, vendors/v1, settings/main)
create table if not exists public.docs (
  path        text primary key,
  collection  text not null,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

create index if not exists docs_collection_idx on public.docs (collection, updated_at desc);

-- RLS 켜고 정책은 만들지 않음 → 브라우저용 공개 키로는 접근 불가.
-- 앱 서버(Vercel 함수)만 secret key로 읽고 씁니다.
alter table public.docs enable row level security;
