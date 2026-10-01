-- ── 영상 자막(문장 구간) — 기기 사이에 맞추기 ───────────────────────────────
-- 2026-10-01 · 듣기 Easy German 문장 이동
--
-- PC 에서 유튜브 "스크립트 표시"를 한 번 붙여넣으면 폰에서도 같은 영상의 문장 이동을 쓰게 한다
-- (폰 삼성 인터넷/크롬은 스크립트 전체 선택 복사가 안 된다). 이 앱이 소유하는 표라 DE 테이블은 건드리지 않는다.
-- Supabase 대시보드 → SQL Editor 에 통째로 붙여 넣고 Run. 여러 번 돌려도 안전하다.

create table if not exists public.alltag_captions (
  user_id    uuid not null references auth.users(id) on delete cascade,
  video_id   text not null check (char_length(video_id) = 11),
  sentences  jsonb not null default '[]'::jsonb, -- [{ i, start, end, text }]
  updated_at timestamptz not null default now(),
  primary key (user_id, video_id)
);

alter table public.alltag_captions enable row level security;
drop policy if exists "alltag_captions_own" on public.alltag_captions;
create policy "alltag_captions_own" on public.alltag_captions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
