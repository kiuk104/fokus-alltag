// Fokus DE 의 문장 창고(user_sentences)로 외울 문장을 보낸다. 이 앱이 DE 콘텐츠에 쓰는 유일한 곳.
//
// ⚠ 가드레일(scripts/check-guardrails.mjs): user_sentences · custom_words 는 이 파일에서만, 그리고 insert 만.
//    고치기·지우기는 DE·Karten 의 몫이다 — 여기는 "만들어서 보내는" 앱이다.
//
// 보낸 문장은 DE 에서 단어장 "Alltag" 으로 보이고, Karten 에서는 같은 이름의 덱이 된다.
// 태그는 DE 에 이미 있는 태그와 먼저 맞춘다(tagSimilarity) — 비슷한 태그가 또 생기면 DE 에서 병합할 일이 늘어난다.

import { supabase } from "./supabase";

import { NOTEBOOK, PROGRAM_TAG, matchTag, tagsFor } from "./tags.js";

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
 * 반환: 새 문장 id 들 (alltag_entries.saved_sentence_ids 에 남긴다)
 */
export async function insertSentences(userId, rows) {
  const payload = rows.map((r) => ({
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
  const { data, error } = await supabase.from("user_sentences").insert(payload).select("id");
  if (error) throw new Error(error.message);
  return (data || []).map((d) => d.id);
}
