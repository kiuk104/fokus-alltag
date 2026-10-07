import { test } from "node:test";
import assert from "node:assert/strict";
import {
  germanSentences, sentenceFor, collectItems, pickSession, nextState, withDrill, typeStats, judge, drillable, isDue,
} from "./drill.js";

const fix = (from, to, type) => ({ from, to, type, hint: "", why: "" });
const entry = (id, day, raw, fixes, drill = {}, extra = {}) => ({
  id, day, raw_text: raw, input_mode: "voice",
  correction: { forText: raw, data: { b1: { fixes } }, progress: { drill } },
  ...extra,
});

test("문장 나누기 — 칸 이름·한국어 의도 줄은 뺀다", () => {
  const raw = "[Level 1] 오늘 늦었다\nIch bin spät gekommen. Der Verkehr war schlimm.\n[Level 2] Weil es regnet, ich war müde.";
  assert.deepEqual(germanSentences(raw), ["Ich bin spät gekommen.", "Der Verkehr war schlimm.", "Weil es regnet, ich war müde."]);
});

test("같은 문장의 다른 오류는 미리 고쳐 둔다", () => {
  const fixes = [fix("mit der Auto", "mit dem Auto", "Kasus"), fix("ich bin gefahrt", "bin ich gefahren", "Verbstellung")];
  const raw = "Heute ich bin gefahrt mit der Auto.";
  assert.deepEqual(sentenceFor(raw, fixes, 0), { before: "Heute bin ich gefahren mit der Auto.", after: "Heute bin ich gefahren mit dem Auto." });
  assert.equal(sentenceFor(raw, [fix("nicht da", "x", "Kasus")], 0), null);
});

test("항목 모으기 — 철자·뜻·한국어로 쓴 날은 빼고, 저장된 상태를 붙인다", () => {
  const es = [
    entry(1, "2026-10-02", "Ich warte auf der Kunde.", [fix("auf der Kunde", "auf den Kunden", "Kasus"), fix("warte", "wartete", "Bedeutung")], { 0: { streak: 1, next: "2026-10-06" } }),
    entry(2, "2026-10-03", "오늘 피곤", [], {}, { input_mode: "ko" }),
    entry(3, "2026-10-03", "Ich habe Packet gebracht.", [fix("Packet", "Paket", "Rechtschreibung")]),
  ];
  const items = collectItems(es);
  assert.equal(items.length, 1);
  assert.equal(items[0].id, "1:0");
  assert.equal(items[0].before, "Ich wartete auf der Kunde."); // 다른 오류(Bedeutung)는 미리 고쳐 둠
  assert.equal(items[0].after, "Ich wartete auf den Kunden.");
  assert.equal(items[0].state.streak, 1);
  assert.equal(drillable("Präposition"), true);
  assert.equal(drillable(" rechtschreibung "), false);
});

test("간격: 교정 다음 날부터, 맞히면 3·7일, 두 번 연속 맞히면 졸업, 틀리면 다음 날", () => {
  const it = { day: "2026-10-05", state: null };
  assert.equal(isDue(it, "2026-10-05"), false);
  assert.equal(isDue(it, "2026-10-06"), true);
  let s = nextState(null, true, "2026-10-06");
  assert.deepEqual([s.streak, s.next, s.done], [1, "2026-10-09", false]);
  s = nextState(s, false, "2026-10-09");
  assert.deepEqual([s.streak, s.next, s.done, s.tries], [0, "2026-10-10", false, 2]);
  s = nextState(nextState(s, true, "2026-10-10"), true, "2026-10-13");
  assert.equal(s.done, true);
});

test("섞어서: 때가 된 것만, 유형을 번갈아 / 유형 지정: 때가 안 된 것도 뒤에 채움", () => {
  const mk = (id, key, day, state = null) => ({ id, key, type: key, day, n: 0, state });
  const items = [
    mk("a", "kasus", "2026-10-01"), mk("b", "kasus", "2026-10-02"), mk("c", "kasus", "2026-10-03"),
    mk("d", "verbstellung", "2026-10-02"), mk("e", "präposition", "2026-10-04"),
    mk("f", "kasus", "2026-10-06"), // 내일부터
    mk("g", "kasus", "2026-10-01", { done: true }),
  ];
  const mixed = pickSession(items, "2026-10-06", { size: 4 });
  assert.deepEqual(mixed.map((x) => x.id), ["a", "d", "e", "b"]);
  const only = pickSession(items, "2026-10-06", { type: "Kasus", size: 5 });
  assert.deepEqual(only.map((x) => x.id), ["a", "b", "c", "f"]);
});

test("채점은 교정 1단계와 같은 기준", () => {
  const it = { fix: fix("auf der Kunde", "auf den Kunden", "Kasus") };
  assert.equal(judge(it, "Ich warte auf den Kunden."), true);
  assert.equal(judge(it, "Ich warte auf der Kunde."), false);
});

test("상태 끼워 넣기 — 다른 진행 정보는 그대로", () => {
  const c = { data: {}, progress: { step: 4, sentIds: ["u1"], drill: { 1: { streak: 1 } } } };
  const out = withDrill(c, 0, { streak: 2, done: true });
  assert.deepEqual(out.progress.drill, { 0: { streak: 2, done: true }, 1: { streak: 1 } });
  assert.deepEqual(out.progress.sentIds, ["u1"]);
  assert.equal(c.progress.drill[0], undefined); // 원본은 안 바뀐다
});

test("자주 틀리는 것 — 유형별 횟수(철자 포함) + 졸업 수", () => {
  const es = [
    entry(1, "2026-10-02", "Ich warte auf der Kunde. Ich habe Packet.", [fix("auf der Kunde", "auf den Kunden", "Kasus"), fix("Packet", "Paket", "Rechtschreibung")], { 0: { done: true } }),
    entry(2, "2026-10-03", "Mit die Kollegen.", [fix("Mit die", "Mit den", "kasus")]),
  ];
  const st = typeStats(es);
  assert.deepEqual(st.map((r) => [r.key, r.count, r.done, r.open, r.drillable]), [["kasus", 2, 1, 1, true], ["rechtschreibung", 1, 0, 0, false]]);
});
