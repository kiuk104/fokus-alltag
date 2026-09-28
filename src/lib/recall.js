// 🔴 3문장 꺼내기 · 되살리기 워밍업 — 순수 함수만 (테스트: recall.test.mjs).
//
// 기획서 0-2절 "인출 연습": 외울 문장은 따라 읽지 않는다. 한국어 뜻만 보고 독일어로 꺼낸 뒤 정답을 연다.
// 채점은 AI 없이 단어 단위로 한다(비용 0). 음성 인식이 틀리게 받아 적는 일이 잦아서
// 철자가 한두 글자 다른 단어는 맞은 것으로 치고, 점수는 "대략 맞게 꺼냈나"만 본다.

import { norm, tokens, lev } from "./compare.js";

/** 정답 기준 — 이 이상이면 "꺼냈다" */
export const PASS = 0.8;
export const CLOSE = 0.55;

/**
 * 저장한 기록들 → DE 로 보낸 문장 목록.
 * 교정 5단계에서 보낸 문장은 correction.progress.keepEdited(켜 둔 것만, 보낸 순서) 와
 * saved_sentence_ids 가 같은 순서로 짝을 이룬다.
 * 반환: [{ id, de, ko, day, entryId, grammar, topic }]
 */
export function keptSentences(entries) {
  const out = [];
  for (const e of entries || []) {
    const ids = e.saved_sentence_ids || [];
    const c = e.correction;
    if (!ids.length || !c?.data) continue;
    const rows = (c.progress?.keepEdited || c.data.keep || []).filter((r) => (r.on ?? true) && String(r.de || "").trim());
    rows.forEach((r, i) => {
      if (ids[i] == null) return;
      out.push({ id: ids[i], de: r.de.trim(), ko: String(r.ko || "").trim(), day: e.day, entryId: e.id, grammar: r.grammar || "", topic: r.topic || "" });
    });
  }
  return out;
}

const words = (s) => tokens(String(s || "")).filter((t) => t.word).map((t) => norm(t.t)).filter(Boolean);
const same = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && lev(a, b) <= 1);

/**
 * 말한 것 ↔ 정답. 단어 순서까지 보는 LCS 로 맞은 단어를 센다.
 * score = 맞은 정답 단어 / 정답 단어 수 (말을 더 많이 해도 깎지 않는다 — 꺼내는 연습이지 받아쓰기가 아니다)
 * parts: 정답을 원래 모양대로 조각낸 것, 맞은 단어에 hit
 */
export function scoreRecall(said, target) {
  const tgt = tokens(String(target || ""));
  const tw = [];
  tgt.forEach((t, i) => { if (t.word && norm(t.t)) tw.push({ n: norm(t.t), i }); });
  const sw = words(said);
  // LCS 표
  const L = Array.from({ length: tw.length + 1 }, () => Array.from({ length: sw.length + 1 }, () => 0));
  for (let i = tw.length - 1; i >= 0; i--) {
    for (let j = sw.length - 1; j >= 0; j--) {
      L[i][j] = same(tw[i].n, sw[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    }
  }
  const hit = new Set();
  for (let i = 0, j = 0; i < tw.length && j < sw.length; ) {
    if (same(tw[i].n, sw[j])) { hit.add(tw[i].i); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) i++;
    else j++;
  }
  const score = tw.length ? hit.size / tw.length : 0;
  return { score, parts: tgt.map((t, i) => (hit.has(i) ? { ...t, hit: true } : t)) };
}

export const verdict = (score) => (score >= PASS ? "ok" : score >= CLOSE ? "close" : "miss");

/** 첫 글자 힌트 — "Die Lieferung war schwierig." → "D__ L_______ w__ s________." */
export function firstLetters(target) {
  return tokens(String(target || ""))
    .map((t) => (t.word ? t.t[0] + "_".repeat(Math.max(0, t.t.length - 1)) : t.t))
    .join("");
}

/** 되살리기 간격(일) — 기획서 2절: 1·3·7·14일 전 */
export const REVIVE_GAPS = [1, 3, 7, 14];

/**
 * 오늘 되살릴 문장 하나. sentences: keptSentences 결과, dayOf(offset) → "YYYY-MM-DD".
 * 오래된 간격부터 본다 — 14일 전 문장이 제일 잊히기 쉽다. 같은 간격 안에서는 날짜로 정해
 * 앱을 다시 열어도 같은 문장이 나온다.
 */
export function reviveFor(sentences, dayOf, today) {
  const seed = Number(String(today).replace(/-/g, "")) || 0;
  for (const gap of [...REVIVE_GAPS].reverse()) {
    const d = dayOf(gap);
    const pool = sentences.filter((s) => s.day === d);
    if (pool.length) return { ...pool[seed % pool.length], gap };
  }
  return null;
}
