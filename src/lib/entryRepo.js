// alltag_entries — 말하기/쓰기 한 번 = 한 줄. 이 앱 소유 테이블이라 고치기도 된다.
//
// 저장은 두 겹이다:
//  1) 치는 동안 기기에 임시 저장 (fa-draft) — 배송 중 신호가 끊겨도 글이 안 날아가게
//  2) [저장] 을 누르면 DB — 다른 기기에서도 보이고, CP2 교정이 여기서 읽는다

import { supabase } from "./supabase";

const COLS = "id, day, month_no, template, input_mode, raw_text, parts, correction, saved_sentence_ids, created_at, updated_at";

export async function loadEntries(userId, day) {
  const { data, error } = await supabase
    .from("alltag_entries").select(COLS).eq("user_id", userId).eq("day", day).order("created_at");
  if (error) throw new Error(error.message);
  return data || [];
}

/** id 가 있으면 고치고, 없으면 새로 만든다. 저장된 줄을 돌려준다. */
export async function saveEntry(userId, entry) {
  const row = {
    day: entry.day,
    month_no: entry.month_no,
    template: entry.template,
    input_mode: entry.input_mode,
    raw_text: entry.raw_text,
    parts: entry.parts,
    updated_at: new Date().toISOString(),
  };
  const q = entry.id
    ? supabase.from("alltag_entries").update(row).eq("id", entry.id).eq("user_id", userId)
    : supabase.from("alltag_entries").insert({ ...row, user_id: userId });
  const { data, error } = await q.select(COLS).single();
  if (error) throw new Error(error.message);
  return data;
}

/** 교정 결과·진행 상태, DE 로 보낸 문장 id 만 고친다 (글은 그대로) */
export async function patchEntry(userId, id, patch) {
  const row = { updated_at: new Date().toISOString() };
  if ("correction" in patch) row.correction = patch.correction;
  if ("saved_sentence_ids" in patch) row.saved_sentence_ids = patch.saved_sentence_ids;
  const { data, error } = await supabase
    .from("alltag_entries").update(row).eq("id", id).eq("user_id", userId).select(COLS).single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteEntry(userId, id) {
  const { error } = await supabase.from("alltag_entries").delete().eq("id", id).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

// ── 기기 임시 저장 ──────────────────────────────────────────────────────────
// 날짜별 하나. 새 기록을 쓰다가 앱을 닫아도 다시 열면 그대로 있다. DB 에 저장하면 지운다.
const draftKey = (day) => `fa-draft2-${day}`;

export function loadDraft(day) {
  try {
    return JSON.parse(localStorage.getItem(draftKey(day)) || "null");
  } catch {
    return null;
  }
}

export function saveDraft(day, draft) {
  try {
    if (draft) localStorage.setItem(draftKey(day), JSON.stringify(draft));
    else localStorage.removeItem(draftKey(day));
  } catch {
    /* 기기 저장이 막혀 있으면 임시 저장 없이 간다 */
  }
}

// CP0 의 한 칸짜리 임시 글(fa-draft-<날짜>)을 첫 칸으로 옮겨 온다 — 업데이트 때 쓰던 글을 잃지 않게.
// 읽기와 지우기를 나눈 이유: React StrictMode 는 useState 초기값 함수를 두 번 부른다.
// 읽으면서 지우면 두 번째 호출이 빈 값을 받아 글이 사라질 수 있다.
const legacyKey = (day) => `fa-draft-${day}`;

export function peekLegacyDraft(day) {
  try {
    return localStorage.getItem(legacyKey(day)) || "";
  } catch {
    return "";
  }
}

export function clearLegacyDraft(day) {
  try {
    localStorage.removeItem(legacyKey(day));
  } catch {
    /* 무시 */
  }
}
