// 오답 노트 — 교정에서 틀린 곳을 며칠 뒤 다시 고쳐 쓰기 (기획서 0-5절). 순수 함수만 (테스트: drill.test.mjs).
//
// 재료는 이미 쌓여 있다: 교정할 때마다 correction.data.b1.fixes 에 { from, to, type, hint, why } 가 남는다.
// AI 를 다시 부르지 않는다(비용 0).
//
//   간격  처음엔 교정 다음 날부터. 맞히면 3일 → 7일 뒤, 두 번 연속 맞히면 졸업. 틀리면 다음 날 다시.
//   교차  섞어서 할 때는 유형을 번갈아 낸다 (Kasus 만 연달아 나오지 않게).
//   저장  각 기록의 correction.progress.drill[fix 번호] = { streak, next, last, tries, done, made }
//
// 같은 문법을 내 DE 문장으로 더 연습하는 건 Fokus DE Dojo 📐 문법 몫 — 여기서는 링크만 건다(links.js deGrammarUrl).

import { addDays } from "./program.js";
import { selfFixed, normText } from "./correct.js";

/** 문법 연습으로 내지 않는 유형 — 철자·의도 문제는 다시 고쳐 쓰기로 배울 게 적다 */
const SKIP = new Set(["rechtschreibung", "bedeutung", "zeichensetzung", "großschreibung", "grossschreibung", "groß-/kleinschreibung"]);

export const typeKey = (t) => String(t || "").trim().toLowerCase();
export const drillable = (t) => !!typeKey(t) && !SKIP.has(typeKey(t));

/** 두 번 연속 맞히면 졸업 */
export const GRADUATE = 2;
const GAPS = [1, 3, 7]; // streak 0 → 1일 · 1 → 3일 · 2+ → 7일 (졸업이라 실제로는 안 쓰임)

const HANGUL = /[가-힣]/;
const LABEL = /^\[[^\]]+\]\s*/;

/** 원문 → 독일어 문장 목록 (칸 이름·한국어 의도 줄은 뺀다) */
export function germanSentences(text) {
  return String(text || "")
    .split("\n")
    .map((l) => l.replace(LABEL, "").trim())
    .filter((l) => l && !HANGUL.test(l))
    .flatMap((l) => l.split(/(?<=[.!?])\s+(?=\S)/))
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 고칠 곳 하나가 들어 있는 문장. 같은 문장의 **다른** 틀린 곳은 미리 고쳐 둔다 —
 * 지금 연습하는 오류 하나만 남아야 무엇을 고치는지 분명하다.
 * 반환 { before, after } 또는 null (원문에서 못 찾음)
 */
export function sentenceFor(text, fixes, n) {
  const fix = fixes[n];
  const found = germanSentences(text).find((s) => s.includes(fix.from));
  if (!found) return null;
  let before = found;
  fixes.forEach((f, i) => {
    if (i === n || !f.from || !before.includes(f.from)) return;
    if (f.from.includes(fix.from) || fix.from.includes(f.from)) return; // 겹치면 건드리지 않는다
    const next = before.replace(f.from, f.to);
    if (next.includes(fix.from)) before = next;
  });
  return { before, after: before.replace(fix.from, fix.to) };
}

/**
 * 기록들 → 오답 노트 항목. 한국어로 쓴 날(fixes 없음)·원문에서 못 찾은 곳·연습 안 하는 유형은 뺀다.
 * [{ id, entryId, day, n, fix, type, key, before, after, state }]
 */
export function collectItems(entries) {
  const out = [];
  for (const e of entries || []) {
    const c = e.correction;
    const fixes = c?.data?.b1?.fixes || [];
    if (!fixes.length || e.input_mode === "ko") continue;
    const text = c.forText ?? e.raw_text;
    fixes.forEach((fix, n) => {
      if (!drillable(fix.type)) return;
      const s = sentenceFor(text, fixes, n);
      if (!s) return;
      out.push({
        id: `${e.id}:${n}`, entryId: e.id, day: e.day, n, fix,
        type: fix.type.trim(), key: typeKey(fix.type),
        ...s,
        state: c.progress?.drill?.[n] || null,
      });
    });
  }
  return out;
}

/** 다음에 낼 날 — 아직 한 번도 안 했으면 교정 다음 날 */
export const nextDay = (item) => item.state?.next || addDays(item.day, 1);
export const isDone = (item) => !!item.state?.done;
export const isDue = (item, today) => !isDone(item) && nextDay(item) <= today;

/**
 * 이번에 낼 문제.
 *  type 을 주면 그 유형만 — 진도 탭에서 골라 들어온 것이라 때가 안 된 것도 뒤에 채운다.
 *  type 이 없으면 때가 된 것만, 유형을 번갈아.
 */
export function pickSession(items, today, { type = null, size = 5 } = {}) {
  const open = items.filter((it) => !isDone(it) && (!type || it.key === typeKey(type)));
  const order = (a, b) => (nextDay(a) < nextDay(b) ? -1 : nextDay(a) > nextDay(b) ? 1 : a.day < b.day ? -1 : a.day > b.day ? 1 : a.n - b.n);
  const due = open.filter((it) => isDue(it, today)).sort(order);
  if (type) {
    const later = open.filter((it) => !isDue(it, today)).sort(order);
    return [...due, ...later].slice(0, size);
  }
  // 유형별 줄을 세워 한 개씩 번갈아 뽑는다
  const lanes = new Map();
  for (const it of due) {
    if (!lanes.has(it.key)) lanes.set(it.key, []);
    lanes.get(it.key).push(it);
  }
  const out = [];
  while (out.length < size && lanes.size) {
    for (const [k, lane] of lanes) {
      if (out.length >= size) break;
      out.push(lane.shift());
      if (!lane.length) lanes.delete(k);
    }
  }
  return out;
}

/** 내가 고쳐 쓴 문장 채점 — 교정 1단계와 같은 기준(correct.js selfFixed) */
// + 고친 문장 전체가 정답 문장과 같으면 무조건 정답 (끝 문장부호는 봐준다)
const bare = (s) => normText(s).replace(/[\s.,;:!?]+$/, "");
export const judge = (item, mine) => selfFixed(mine, item.fix) || (!!bare(mine) && bare(mine) === bare(item.after));

/** 결과 → 새 상태 */
export function nextState(prev, correct, today) {
  const p = prev || { streak: 0, tries: 0 };
  const streak = correct ? (p.streak || 0) + 1 : 0;
  const done = streak >= GRADUATE;
  return {
    ...p,
    streak,
    tries: (p.tries || 0) + 1,
    last: today,
    next: addDays(today, GAPS[Math.min(streak, GAPS.length - 1)]),
    done,
  };
}

/** 기록의 correction 에 상태 하나를 끼워 넣은 새 객체 */
export function withDrill(correction, n, state) {
  const progress = correction.progress || {};
  return { ...correction, progress: { ...progress, drill: { ...progress.drill, [n]: state } } };
}

/**
 * 진도 탭 "자주 틀리는 것" — 유형별 틀린 횟수(연습 안 하는 유형 포함) + 졸업 수.
 * [{ key, type, count, done, drillable, open }] 많은 순
 */
export function typeStats(entries, items = collectItems(entries)) {
  const m = new Map();
  for (const e of entries || []) {
    for (const f of e.correction?.data?.b1?.fixes || []) {
      const key = typeKey(f.type);
      if (!key) continue;
      if (!m.has(key)) m.set(key, { key, type: f.type.trim(), count: 0, done: 0, open: 0, drillable: drillable(f.type) });
      m.get(key).count++;
    }
  }
  for (const it of items) {
    const row = m.get(it.key);
    if (!row) continue;
    if (isDone(it)) row.done++;
    else row.open++;
  }
  return [...m.values()].sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}

/**
 * 문장 고르기 화면의 세 묶음 — 오늘 할 때 / 아직 때가 아님 / 졸업.
 * 졸업한 것도 골라서 다시 할 수 있다(틀리면 졸업이 풀리고 다시 간격에 들어간다).
 */
export function pickerGroups(pool, today) {
  const order = (a, b) => (nextDay(a) < nextDay(b) ? -1 : nextDay(a) > nextDay(b) ? 1 : a.day < b.day ? -1 : a.day > b.day ? 1 : a.n - b.n);
  return {
    due: pool.filter((it) => isDue(it, today)).sort(order),
    later: pool.filter((it) => !isDone(it) && !isDue(it, today)).sort(order),
    done: pool.filter(isDone).sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : a.n - b.n)),
  };
}
