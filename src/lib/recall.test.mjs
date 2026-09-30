import { test } from "node:test";
import assert from "node:assert/strict";
import { keptSentences, scoreRecall, verdict, firstLetters, reviveFor } from "./recall.js";

const entry = (id, day, keep, ids, edited) => ({
  id, day,
  correction: { data: { keep }, progress: { saved: true, sentIds: ids, ...(edited ? { keepEdited: edited } : {}) } },
});

test("보낸 문장만, 켜 둔 순서대로 id 와 짝짓는다", () => {
  const keep = [{ de: "A eins.", ko: "a" }, { de: "B zwei.", ko: "b" }, { de: "C drei.", ko: "c" }];
  const edited = [{ ...keep[0], on: true }, { ...keep[1], on: false }, { de: "C drei, neu.", ko: "c2", on: true }];
  const s = keptSentences([entry(1, "2026-10-02", keep, [11, 12], edited), entry(2, "2026-10-02", keep, [], null)]);
  assert.deepEqual(s.map((x) => [x.id, x.de, x.ko]), [[11, "A eins.", "a"], [12, "C drei, neu.", "c2"]]);
  // 옛 기록(칼럼에만 id 가 있던 것)도 읽는다
  const legacy = { id: 3, day: "d", saved_sentence_ids: [7], correction: { data: { keep: [keep[0]] }, progress: {} } };
  assert.deepEqual(keptSentences([legacy]).map((x) => x.id), [7]);
});

test("말한 것 채점 — 순서·철자 한 글자 차이는 봐준다, 더 말해도 깎지 않는다", () => {
  const t = "Die Lieferung war schwierig, weil es keinen Parkplatz gab.";
  assert.equal(scoreRecall("die lieferung war schwierig weil es keinen parkplatz gab", t).score, 1);
  assert.equal(scoreRecall("also die Liferung war heute schwierig weil es keinen Parkplatz gab", t).score, 1);
  const half = scoreRecall("Die Lieferung war schwierig", t);
  assert.equal(verdict(half.score), "miss");
  assert.deepEqual(half.parts.filter((p) => p.hit).map((p) => p.t), ["Die", "Lieferung", "war", "schwierig"]);
  assert.equal(verdict(scoreRecall("Die Lieferung war schwierig weil es kein Parkplatz gab", t).score), "ok");
  assert.equal(scoreRecall("", t).score, 0);
});

test("첫 글자 힌트", () => {
  assert.equal(firstLetters("Die Lieferung, weil's klappt."), "D__ L________, w_____ k_____.");
});

test("되살리기 — 오래된 간격부터, 날짜로 고정", () => {
  const s = [{ id: 1, day: "2026-10-09" }, { id: 2, day: "2026-10-03" }, { id: 3, day: "2026-10-03" }];
  const dayOf = (g) => ({ 1: "2026-10-09", 3: "2026-10-07", 7: "2026-10-03", 14: "2026-09-26" })[g];
  const r = reviveFor(s, dayOf, "2026-10-10");
  assert.equal(r.gap, 7);
  assert.equal(r.id, reviveFor(s, dayOf, "2026-10-10").id);
  assert.equal(reviveFor([], dayOf, "2026-10-10"), null);
});
