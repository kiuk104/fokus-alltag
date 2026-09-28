// DE 로 보낼 문장의 태그 정하기 — 순수 함수 (테스트: tags.test.mjs).
// 새 태그를 만들기 전에 DE 에 이미 있는 비슷한 태그를 찾는다(tagSimilarity, DE 와 같은 파일).

import { tagPairScore } from "./tagSimilarity.js";

export const NOTEBOOK = "Alltag";
export const PROGRAM_TAG = "B2-Programm";

/**
 * 새 태그 후보 → 이미 있는 비슷한 태그가 있으면 그것으로 (가장 많이 쓰인 것).
 * 반환: { tag, from? } — from 이 있으면 "바꿨다"는 뜻 (화면에 보여 준다)
 */
export function matchTag(tag, existing, minScore = 0.7) {
  const t = String(tag || "").trim();
  if (!t) return null;
  const same = existing.find((e) => e.tag === t);
  if (same) return { tag: t };
  let best = null;
  for (const e of existing) {
    const r = tagPairScore(t, e.tag);
    if (r && r.score >= minScore && (!best || r.score > best.score || (r.score === best.score && e.count > best.count))) {
      best = { tag: e.tag, score: r.score, count: e.count };
    }
  }
  return best ? { tag: best.tag, from: t } : { tag: t };
}

/** 한 문장에 붙일 태그들 */
export function tagsFor(keep, { month, existing, grammarLabel }) {
  const raw = [PROGRAM_TAG, `M${month}`, grammarLabel, keep.topic].filter(Boolean);
  const out = [];
  const changed = [];
  for (const t of raw) {
    const m = t === PROGRAM_TAG || /^M\d$/.test(t) ? { tag: t } : matchTag(t, existing);
    if (m && !out.includes(m.tag)) out.push(m.tag);
    if (m?.from) changed.push(`${m.from} → ${m.tag}`);
  }
  return { tags: out, changed };
}

