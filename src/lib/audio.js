// 원어민 발음 — 🔴 꺼내기에서 정답을 연 뒤 듣는다(기획서 2절 "발음은 인출 뒤에").
//
// Fokus DE src/lib/cardAudio.js · Karten audioRepo.js 와 **같은 저장 규칙**을 따른다 — 세 앱이 같은 파일을 쓰게:
//   파일   → Storage 버킷 card-audio, 경로 <user_id>/sentence-<id>-<시각>.mp3
//   주소   → card_meta(item_type "sentence", item_id = user_sentences.id).meta.audio = { url, text, voice, more? }
// 그래서 여기서 한 번 만든 발음은 DE·Karten 에서 그 문장을 열 때도 그대로 들린다(연결 지점 3).
//
// 다른 점: 이 앱은 발음을 **만들어 붙이기만** 한다. 지우기·목소리 고르기는 DE·Karten 몫이다.
// card_meta 행에는 Karten 의 별표·서식 칸이 같이 있으므로 읽어 와서 audio 칸만 채워 다시 쓴다.
// ⚠ 가드레일: card_meta 는 이 파일에서만, upsert 만 (scripts/check-guardrails.mjs).
//
// 만드는 일은 /api/tts (DE 와 같은 파일) 가 한다. 창구가 없거나 키가 없으면 기기 목소리로 읽는다 —
// 소리가 조금 기계적이어도 "정답을 듣고 따라 말하기"는 끊기지 않아야 한다.

import { supabase } from "./supabase";

const BUCKET = "card-audio";
const BRACKETED = /[(（][^)）]*[)）]|[[［][^\]］]*[\]］]/g;

/** DE speech.js forSpeech 와 같은 규칙 — 발음 파일을 찾는 열쇠가 같아야 세 앱이 같은 소리를 쓴다 */
export function forSpeech(text) {
  return String(text || "").replace(BRACKETED, " ").split(/\s+\/\s+/)[0].replace(/\s+/g, " ").trim();
}

function toBlob(base64, mime) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime || "audio/mpeg" });
}

async function session() {
  const { data } = await supabase.auth.getSession();
  const s = data?.session;
  if (!s?.access_token || !s?.user?.id) throw new Error("로그인이 필요합니다.");
  return s;
}

async function metaRow(userId, id) {
  const { data, error } = await supabase
    .from("card_meta").select("meta")
    .eq("user_id", userId).eq("item_type", "sentence").eq("item_id", String(id))
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.meta || {};
}

/** /api/tts → mp3 Blob (+ 목소리 이름) */
async function ttsBlob(token, text) {
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ text }),
  });
  if (!(res.headers.get("content-type") || "").includes("application/json")) throw new Error("발음 창구(/api/tts)가 없어요");
  const json = await res.json();
  if (!res.ok || !json.audio) throw new Error(json?.error || `발음 만들기 실패 (${res.status})`);
  return { blob: toBlob(json.audio, json.mime), voice: json.voice || "" };
}

async function makeMp3(userId, token, id, text) {
  const { blob, voice } = await ttsBlob(token, text);
  const path = `${userId}/sentence-${id}-${Date.now()}.mp3`;
  const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: "31536000", upsert: false });
  if (up.error) throw new Error(up.error.message);
  return { url: supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl, text, voice };
}

const cache = new Map(); // 문장 id → mp3 주소 (페이지가 사는 동안)

/**
 * 이 문장의 원어민 mp3 주소. 이미 있으면(DE·Karten 에서 만들었어도) 그것, 없으면 만들어서 붙인다.
 * 실패하면 "" — 부르는 쪽이 기기 목소리로 넘어간다.
 */
export async function sentenceAudio(id, de) {
  const text = forSpeech(de);
  if (!text || id == null) return "";
  if (cache.has(id)) return cache.get(id);
  try {
    const s = await session();
    const meta = await metaRow(s.user.id, id);
    if (meta.audio?.url && (!meta.audio.text || meta.audio.text === text)) {
      cache.set(id, meta.audio.url);
      return meta.audio.url;
    }
    const made = await makeMp3(s.user.id, s.access_token, id, text);
    // 글자를 고친 문장이면 옛 발음은 more 로 보관한다(지우지 않는다 — 지우기는 DE·Karten 몫)
    const old = meta.audio?.url ? [{ url: meta.audio.url, text: meta.audio.text || "", voice: meta.audio.voice || "" }, ...(meta.audio.more || [])] : [];
    const audio = { ...made, ...(old.length ? { more: old.slice(0, 2) } : {}) };
    const { error } = await supabase.from("card_meta").upsert(
      { user_id: s.user.id, item_type: "sentence", item_id: String(id), meta: { ...meta, audio }, updated_at: new Date().toISOString() },
      { onConflict: "user_id,item_type,item_id" }
    );
    if (error) console.warn("[audio] card_meta 저장 실패:", error.message);
    cache.set(id, made.url);
    return made.url;
  } catch (e) {
    console.warn("[audio] 원어민 발음 없음 — 기기 목소리로:", e?.message || e);
    cache.set(id, "");
    return "";
  }
}

let player = null;

/** 재생 — mp3 가 있으면 그것, 없으면 기기 목소리(de-DE). rate: 0.8 = 천천히 */
export async function speak(id, de, { rate = 1 } = {}) {
  stopSpeaking();
  const url = await sentenceAudio(id, de);
  if (url) {
    player = new Audio(url);
    player.playbackRate = rate;
    try {
      await player.play();
      return "native";
    } catch {
      /* 아래 기기 목소리로 */
    }
  }
  return deviceVoice(forSpeech(de), rate);
}

const textCache = new Map(); // 글 → blob 주소 (페이지가 사는 동안)

/**
 * DE 문장 id 가 없는 글(오답 노트의 고친 문장 등) 읽기. 원어민 mp3 를 만들되 **저장하지 않는다** —
 * card_meta 는 DE 문장 id 에만 붙는 칸이라 여기 넣을 자리가 없다. 같은 글은 페이지가 사는 동안 한 번만 만든다.
 * 실패하면 기기 목소리. 반환 "native" | "device" | "none"
 */
export async function speakText(de, { rate = 1 } = {}) {
  stopSpeaking();
  const text = forSpeech(de);
  if (!text) return "none";
  let url = textCache.get(text);
  if (url === undefined) {
    try {
      const s = await session();
      const { blob } = await ttsBlob(s.access_token, text);
      url = URL.createObjectURL(blob);
    } catch (e) {
      console.warn("[audio] 원어민 발음 없음 — 기기 목소리로:", e?.message || e);
      url = "";
    }
    textCache.set(text, url);
  }
  if (url) {
    player = new Audio(url);
    player.playbackRate = rate;
    try {
      await player.play();
      return "native";
    } catch {
      /* 아래 기기 목소리로 */
    }
  }
  return deviceVoice(text, rate);
}

function deviceVoice(text, rate) {
  if (typeof speechSynthesis === "undefined") return "none";
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "de-DE";
  u.rate = rate * 0.95;
  const v = speechSynthesis.getVoices().find((x) => x.lang?.startsWith("de"));
  if (v) u.voice = v;
  speechSynthesis.speak(u);
  return "device";
}

export function stopSpeaking() {
  try { player?.pause(); } catch { /* 무시 */ }
  player = null;
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
}
