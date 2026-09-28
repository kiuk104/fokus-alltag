-- ── Fokus Alltag 테이블 ─────────────────────────────────────────────────────
-- 2026-09-23 · CP0
--
-- 이 앱이 **소유하는** 테이블만 만든다. Fokus DE 의 테이블(user_sentences, custom_words,
-- ai_usage_log …)은 컬럼 하나 건드리지 않는다 — Karten 과 같은 규칙.
-- Supabase 대시보드 → SQL Editor 에 통째로 붙여 넣고 Run. 여러 번 돌려도 안전하다.

-- ① 프로그램 — 사람마다 한 줄. 시작일이 모든 계산(N개월차·템플릿)의 기준이다.
create table if not exists public.alltag_program (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  start_date date not null,
  -- 앞으로 늘어날 설정(템플릿 수동 지정, 듣기 링크 목록 등). 컬럼으로 만들면
  -- 늘 때마다 마이그레이션이 필요하다 — Karten card_decks.settings 와 같은 이유.
  settings   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ② 하루 — 루틴 네 칸의 완료 여부. 연속 일수는 이 표에서 계산한다.
create table if not exists public.alltag_days (
  user_id    uuid not null references auth.users(id) on delete cascade,
  day        date not null,
  listen     boolean not null default false,  -- 🟢 듣기 5분
  speak      boolean not null default false,  -- 🟡 말하기 10분
  correct    boolean not null default false,  -- 🔵 AI 교정 5분
  repeat     boolean not null default false,  -- 🔴 3문장 소리 내기
  short_mode boolean not null default false,  -- "오늘은 10분만" — 말하기+소리 내기만 요구
  note       text,                            -- 듣기 한 줄 요약 등
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

-- ③ 기록 — 말하기/쓰기 한 번 = 한 줄. CP1 에서 쓰기 시작한다.
create table if not exists public.alltag_entries (
  id                 bigserial primary key,
  user_id            uuid not null references auth.users(id) on delete cascade,
  day                date not null,
  month_no           smallint not null,            -- 1~6 (기록 당시)
  template           text not null,                -- expand3 | why | problem4 | weekday:<요일>
  input_mode         text not null default 'text', -- voice | text | ko
  raw_text           text not null default '',
  parts              jsonb not null default '{}'::jsonb, -- 템플릿 칸별 입력 (Level1/2/3, 4칸 등)
  correction         jsonb,                        -- AI 교정 결과 (CP2)
  saved_sentence_ids bigint[] not null default '{}', -- DE user_sentences 로 보낸 문장 id
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_alltag_entries_user_day on public.alltag_entries(user_id, day desc);

-- ④ 월말 말하기 점검 (CP5)
create table if not exists public.alltag_checks (
  id         bigserial primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  month_no   smallint not null,
  prompt     text not null,
  transcript text not null default '',
  seconds    integer not null default 0,
  stats      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ── RLS: 네 표 모두 "내 줄만" ────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['alltag_program','alltag_days','alltag_entries','alltag_checks'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s_own" on public.%I', t, t);
    execute format(
      'create policy "%s_own" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t, t);
  end loop;
end $$;

-- ── 검증 ────────────────────────────────────────────────────────────────────
--   select * from alltag_program;
--   select * from alltag_days order by day desc limit 7;
--
-- ── 롤백 ────────────────────────────────────────────────────────────────────
--   drop table if exists public.alltag_checks, public.alltag_entries,
--                        public.alltag_days, public.alltag_program;
