// alltag_captions — 붙여넣은 영상 자막을 계정에 맞춰 둔다(PC 에서 붙이면 폰에서도 쓰게).
// 표가 아직 없으면(마이그레이션 전) 조용히 건너뛴다 — 이 기기 저장(captions.js)만으로도 동작한다.

import { supabase } from "./supabase";

async function uid() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id || null;
}

/** 계정에 저장된 문장 구간. 없거나 표가 없으면 null */
export async function fetchRemoteCaptions(videoId) {
  try {
    const user = await uid();
    if (!user || !videoId) return null;
    const { data, error } = await supabase
      .from("alltag_captions").select("sentences").eq("user_id", user).eq("video_id", videoId).maybeSingle();
    if (error || !Array.isArray(data?.sentences) || !data.sentences.length) return null;
    return data.sentences;
  } catch {
    return null;
  }
}

/** 올린다. 성공하면 true — 표가 없거나 오프라인이면 false (화면에는 영향 없음) */
export async function saveRemoteCaptions(videoId, sentences) {
  try {
    const user = await uid();
    if (!user) return false;
    const { error } = await supabase.from("alltag_captions").upsert(
      { user_id: user, video_id: videoId, sentences, updated_at: new Date().toISOString() },
      { onConflict: "user_id,video_id" },
    );
    return !error;
  } catch {
    return false;
  }
}

export async function clearRemoteCaptions(videoId) {
  try {
    const user = await uid();
    if (!user) return;
    await supabase.from("alltag_captions").delete().eq("user_id", user).eq("video_id", videoId);
  } catch {
    /* 무시 */
  }
}

/** 가장 최근에 자막을 붙인 영상 id — 서버가 영상 목록을 못 받을 때(폰) PC 에서 붙인 영상을 바로 열기 위해 */
export async function latestCaptionVideo() {
  try {
    const user = await uid();
    if (!user) return null;
    const { data, error } = await supabase
      .from("alltag_captions").select("video_id").eq("user_id", user).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    return error ? null : data?.video_id || null;
  } catch {
    return null;
  }
}
