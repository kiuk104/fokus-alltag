// Fokus DE 의 문장 창고(user_sentences)로 외울 문장을, 내 단어(custom_words)로 새 단어를 보낸다.
// 이 앱이 DE 콘텐츠에 쓰는 유일한 곳.
//
// ⚠ 가드레일(scripts/check-guardrails.mjs): user_sentences · custom_words 는 이 파일에서만, 그리고 insert 만.
//    고치기·지우기는 DE·Karten 의 몫이다 — 여기는 "만들어서 보내는" 앱이다.
//
// 보낸 문장은 DE 에서 단어장 "Alltag" 으로 보이고, Karten 에서는 같은 이름의 덱이 된다.
// 태그는 DE 에 이미 있는 태그와 먼저 맞춘다(tagSimilarity) — 비슷한 태그가 또 생기면 DE 에서 병합할 일이 늘어난다.

import { supabase } from "./supabase";

import { NOTEBOOK, PROGRAM_TAG, matchTag, tagsFor } from "./tags.js";
import { wordKey } from "./correct.js";

export { NOTEBOOK, PROGRAM_TAG, matchTag, tagsFor };

/** DE 문장에 이미 쓰인 태그들 (최근 1000개 문장에서) */
export async function loadSentenceTags(userId) {
  const { data, error } = await supabase
    .from("user_sentences")
    .select("tags")
    .eq("user_id", userId)
    .not("tags", "is", null)
    .order("id", { ascending: false })
    .limit(1000);
  if (error) return [];
  const count = new Map();
  for (const r of data || []) for (const t of r.tags || []) if (t) count.set(t, (count.get(t) || 0) + 1);
  return [...count.entries()].map(([tag, n]) => ({ tag, count: n }));
}

/**
 * 문장들을 DE 로 보낸다. rows: [{ de, ko, tags, category, note }]
 * 반환: 문장 id 들, rows 와 같은 순서 (uuid — alltag_entries.correction.progress.sentIds 에 남긴다)
 *
 * 단어장 Alltag 에 똑같은 독일어 문장이 이미 있으면 새로 넣지 않고 그 id 를 쓴다.
 * 보내기는 됐는데 진행 저장이 실패해서 다시 누르는 경우 — DE 에 같은 문장이 두 번 생기지 않게.
 */
export async function insertSentences(userId, rows) {
  const germans = rows.map((r) => r.de.trim());
  const have = new Map();
  const { data: old } = await supabase
    .from("user_sentences").select("id, german").eq("user_id", userId).eq("notebook", NOTEBOOK).in("german", germans);
  for (const o of old || []) if (!have.has(o.german)) have.set(o.german, o.id);

  const fresh = rows.filter((r) => !have.has(r.de.trim()));
  const payload = fresh.map((r) => ({
    user_id: userId,
    notebook: NOTEBOOK,
    german: r.de.trim(),
    korean: (r.ko || "").trim(),
    english: "",
    note: r.note || "",
    category: r.category || "Berufs- und Arbeitsleben",
    level: "B2",
    tags: r.tags,
  }));
  if (payload.length) {
    const { data, error } = await supabase.from("user_sentences").insert(payload).select("id, german");
    if (error) throw new Error(error.message);
    for (const d of data || []) have.set(d.german, d.id);
  }
  return germans.map((g) => have.get(g)).filter((id) => id != null);
}

// ── 새 단어 → custom_words (연결 지점 2, CP3) ─────────────────────────────────
// DE 에 이미 있는 단어는 버튼 대신 ✓. "있다"의 기준은 기본 단어장(generated_words, 읽기만)과 내 단어.
// 기본 단어장은 크고 잘 안 바뀌니 기기에 사흘 기억해 둔다. 내 단어는 방금 넣은 것도 보여야 하니 매번 읽는다.

const BASE_KEY = "fa-base-words";
const BASE_TTL = 3 * 86400000;

async function baseWordKeys() {
  try {
    const c = JSON.parse(localStorage.getItem(BASE_KEY) || "null");
    if (c && Date.now() - c.at < BASE_TTL && Array.isArray(c.keys)) return new Set(c.keys);
  } catch { /* 새로 받는다 */ }
  const keys = new Set();
  const PAGE = 500;
  for (let from = 0; from < 20000; from += PAGE) {
    const { data, error } = await supabase.from("generated_words").select("words").range(from, from + PAGE - 1);
    if (error) break;
    for (const r of data || []) for (const w of r.words || []) {
      if (w?.de) keys.add(wordKey(w.de));
      if (w?.stem) keys.add(wordKey(w.stem));
    }
    if (!data || data.length < PAGE) break;
  }
  try { localStorage.setItem(BASE_KEY, JSON.stringify({ at: Date.now(), keys: [...keys] })); } catch { /* 용량 — 다음에 또 받는다 */ }
  return keys;
}

/** DE 에 이미 있는 단어 열쇠들 (wordKey) */
export async function knownWordKeys(userId) {
  const [base, mine] = await Promise.all([
    baseWordKeys().catch(() => new Set()),
    supabase.from("custom_words").select("de, stem").eq("user_id", userId).limit(5000),
  ]);
  const keys = new Set(base);
  for (const w of mine.data || []) {
    if (w.de) keys.add(wordKey(w.de));
    if (w.stem) keys.add(wordKey(w.stem));
  }
  return keys;
}

/** 단어 하나를 내 단어로. 단어장은 문장과 같은 "Alltag" 이라 DE 에서 한곳에 모인다. */
export async function insertWord(userId, w, { month } = {}) {
  const row = {
    user_id: userId,
    de: w.de.trim(),
    stem: w.de.trim(),
    article: ["der", "die", "das"].includes(w.article) ? w.article : null,
    en: (w.en || "").trim(),
    ko: (w.ko || "").trim(),
    level: w.level || "B2",
    tag: null,
    notebook: NOTEBOOK,
    tags: [PROGRAM_TAG, ...(month ? [`M${month}`] : [])],
  };
  const { data, error } = await supabase.from("custom_words").insert(row).select("id").single();
  if (error) throw new Error(error.message);
  return data.id;
}
