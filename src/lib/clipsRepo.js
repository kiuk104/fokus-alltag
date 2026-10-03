// 듣기 갈무리(🔖) — alltag_clips (supabase/migrations/20261003_alltag_clips.sql). 이 앱 소유 표라 고치기·지우기도 된다.
//
// 저장하는 것은 원래 주소와 시각뿐이다. 방송사가 옛 편을 내리면 그 갈무리는 재생되지 않는다(목록에서 알려 준다).

import { supabase } from "./supabase";

const COLS = "id, src, kind, media, item, title, ep_date, start_s, end_s, dur_s, memo, text, heard, created_at";
export const MIGRATION = "supabase/migrations/20261003_alltag_clips.sql";

const missing = (e) => /relation .*alltag_clips.* does not exist|could not find the table/i.test(e?.message || "");
const fail = (e) => new Error(missing(e) ? `갈무리 표가 아직 없어요 — Supabase SQL Editor 에서 ${MIGRATION} 를 실행해 주세요.` : e.message);

export async function loadClips(userId) {
  const { data, error } = await supabase.from("alltag_clips").select(COLS).eq("user_id", userId).order("created_at", { ascending: false }).limit(300);
  if (error) throw fail(error);
  return data || [];
}

/** 한 편(같은 소리·영상)의 갈무리 */
export async function loadEpisodeClips(userId, media) {
  const { data, error } = await supabase.from("alltag_clips").select(COLS).eq("user_id", userId).eq("media", media).order("start_s");
  if (error) throw fail(error);
  return data || [];
}

export async function addClip(userId, clip) {
  const row = {
    user_id: userId,
    src: clip.src,
    kind: clip.kind,
    media: clip.media,
    item: clip.item || null,
    title: clip.title || "",
    ep_date: clip.ep_date || "",
    start_s: Math.max(0, Math.round(clip.start * 100) / 100),
    end_s: Math.round(clip.end * 100) / 100,
    dur_s: clip.dur ? Math.round(clip.dur) : null,
    text: clip.text || "",
  };
  const { data, error } = await supabase.from("alltag_clips").insert(row).select(COLS).single();
  if (error) throw fail(error);
  return data;
}

/** 메모 · 문장 · 다시 들은 횟수만 고친다 */
export async function patchClip(userId, id, patch) {
  const row = {};
  for (const k of ["memo", "text", "heard"]) if (k in patch) row[k] = patch[k];
  const { data, error } = await supabase.from("alltag_clips").update(row).eq("id", id).eq("user_id", userId).select(COLS).single();
  if (error) throw fail(error);
  return data;
}

export async function deleteClip(userId, id) {
  const { error } = await supabase.from("alltag_clips").delete().eq("id", id).eq("user_id", userId);
  if (error) throw fail(error);
}
