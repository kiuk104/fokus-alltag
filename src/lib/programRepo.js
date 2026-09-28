// alltag_program · alltag_days 읽고 쓰기. 이 앱 소유 테이블만 다룬다.
//
// 테이블이 아직 없으면(마이그레이션을 안 돌렸으면) 에러 대신 { missing: true } 를 돌려준다 —
// 화면이 "SQL 을 먼저 실행하세요"를 보여 줄 수 있게. Karten 의 srsOk 와 같은 방식.

import { supabase } from "./supabase";

export const MIGRATION_FILE = "supabase/migrations/20260923_alltag.sql";

// PostgREST 가 "표가 없다"고 할 때의 모양. 코드가 버전에 따라 달라서 둘 다 본다.
const isMissing = (error) =>
  !!error && (error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache/i.test(error.message));

export async function loadProgram(userId) {
  const { data, error } = await supabase
    .from("alltag_program").select("*").eq("user_id", userId).maybeSingle();
  if (isMissing(error)) return { missing: true, program: null };
  if (error) throw new Error(error.message);
  return { missing: false, program: data };
}

export async function saveProgram(userId, { start_date, settings }) {
  const row = { user_id: userId, start_date, updated_at: new Date().toISOString() };
  if (settings) row.settings = settings;
  const { data, error } = await supabase
    .from("alltag_program").upsert(row, { onConflict: "user_id" }).select().single();
  if (error) throw new Error(error.message);
  return data;
}

/** 최근 days 일치 하루 기록. 연속 일수 계산에 400일이면 충분하다(프로그램이 180일). */
export async function loadDays(userId, sinceDay) {
  const { data, error } = await supabase
    .from("alltag_days").select("*").eq("user_id", userId).gte("day", sinceDay).order("day");
  if (error) throw new Error(error.message);
  return data || [];
}

const DAY_FIELDS = ["listen", "speak", "correct", "repeat", "short_mode", "note"];

/** 하루의 칸 일부를 고친다. 없던 날이면 새로 만든다. */
export async function saveDay(userId, day, patch) {
  const row = { user_id: userId, day, updated_at: new Date().toISOString() };
  for (const k of DAY_FIELDS) if (k in patch) row[k] = patch[k];
  const { data, error } = await supabase
    .from("alltag_days").upsert(row, { onConflict: "user_id,day" }).select().single();
  if (error) throw new Error(error.message);
  return data;
}
