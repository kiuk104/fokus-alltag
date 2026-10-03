-- ── 듣기 갈무리(🔖) — 다시 듣고 싶은 구간 ─────────────────────────────────────
-- 2026-10-03 · 듣기 화면에서 반복하던 구간을 저장해 두고, 🔖 목록에서 그 구간만 다시 듣는다.
--
-- 소리·영상 파일은 저장하지 않는다 — 원래 주소(mp3 주소 또는 유튜브 영상 id)와 시작·끝 시각만.
-- 문장 글자(text)는 원고를 연 뒤에만 붙인다(영상은 붙여넣은 자막에서 자동) — 듣기 전에 글자가 보이면 듣기 연습이 안 된다.
-- 이 앱이 소유하는 표라 DE 테이블은 건드리지 않는다.
-- Supabase 대시보드 → SQL Editor 에 통째로 붙여 넣고 Run. 여러 번 돌려도 안전하다.

create table if not exists public.alltag_clips (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  src         text not null,                 -- 출처 id (leicht · dw · tagesschau · easy · 내 링크)
  kind        text not null check (kind in ('audio', 'video')),
  media       text not null,                 -- mp3 주소 또는 유튜브 영상 id
  item        text,                          -- Nachrichtenleicht 기사 경로 등 (다시 열 때)
  title       text not null default '',
  ep_date     text not null default '',      -- 그 편의 날짜 (표시용)
  start_s     real not null,
  end_s       real not null,
  dur_s       real,                          -- 갈무리할 때의 전체 길이 — 원고에서 근처 문장을 추천할 때 쓴다
  memo        text not null default '',
  text        text not null default '',      -- 이 구간의 독일어 문장 (원고에서 골라 붙인 것)
  heard       int not null default 0,        -- 🔖 목록에서 다시 들은 횟수
  created_at  timestamptz not null default now()
);

create index if not exists alltag_clips_user_idx on public.alltag_clips (user_id, created_at desc);

alter table public.alltag_clips enable row level security;
drop policy if exists "alltag_clips_own" on public.alltag_clips;
create policy "alltag_clips_own" on public.alltag_clips
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
