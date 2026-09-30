// npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractJson, normalizeCorrection, markFixes, selfFixed, correctionPrompt, normalizeExplain, CATEGORIES } from "./correct.js";

const TEXT = "[Level 1] Heute hatte ich ein schwierige Lieferung.\n[Level 2] Heute hatte ich eine schwierige Lieferung, weil es gab keinen Parkplatz.";

const RAW = {
  b1: {
    text: "Heute hatte ich eine schwierige Lieferung, weil es keinen Parkplatz gab.",
    fixes: [
      { from: "ein schwierige", to: "eine schwierige", type: "Artikel", hint: "Lieferung 의 성을 다시 봐요", why: "die Lieferung → eine" },
      { from: "weil es gab keinen Parkplatz", to: "weil es keinen Parkplatz gab", type: "Verbstellung", hint: "weil 뒤 동사 위치", why: "종속절은 동사가 끝" },
      { from: "nicht da", to: "nicht da", type: "x" }, // 같은 것 → 버림
      { from: "Parkplatz", to: "Parkplätze", hint: "정답은 Parkplätze" }, // 힌트에 정답이 샘 → hint 비움
    ],
  },
  b2: "Die Lieferung war heute schwierig, da vor dem Gebäude kein geeigneter Parkplatz vorhanden war.",
  native: "Heute war echt stressig – nirgends ein Parkplatz.",
  grammar: [{ key: "nebensatz", note: "weil 종속절" }, { key: "없는키", note: "x" }],
  keep: [
    { de: "Ich konnte keinen geeigneten Parkplatz finden.", ko: "적당한 주차 자리를 못 찾았다.", grammar: "", topic: "Park platz", category: "Verkehr" },
    { de: "Dadurch hat sich die Lieferung verzögert.", ko: "그래서 배송이 늦어졌다.", grammar: "kausal", topic: "Lieferung", category: "없는 카테고리" },
    { de: "Der Kunde war leider nicht zu Hause.", ko: "고객이 안타깝게도 집에 없었다.", topic: "Kunde" },
    { de: "넷째", ko: "" },
  ],
  errorTypes: ["Artikel", "Verbstellung"],
};

test("JSON 꺼내기: 울타리·앞뒤 말이 있어도", () => {
  assert.deepEqual(extractJson('자 여기요\n```json\n{"a":1}\n```\n끝'), { a: 1 });
  assert.deepEqual(extractJson('Antwort: {"a":{"b":2}} danke'), { a: { b: 2 } });
  assert.throws(() => extractJson("kein json"));
});

test("정리: 같은 고침·잘못된 키·넷째 문장은 버리고, 정답이 샌 힌트는 비운다", () => {
  const c = normalizeCorrection(RAW, { text: TEXT });
  assert.equal(c.b1.fixes.length, 3);
  assert.equal(c.b1.fixes[2].hint, "");
  assert.equal(c.b1.fixes[0].found, true);
  assert.deepEqual(c.grammar.map((g) => g.key), ["nebensatz"]);
  assert.equal(c.keep.length, 3);
  assert.equal(c.keep[0].topic, "Parkplatz");
  assert.equal(c.keep[1].category, "Berufs- und Arbeitsleben"); // 목록 밖 → 기본
  assert.equal(c.keep[0].category, "Verkehr");
  assert.equal(c.keep[2].grammar, "");
});

test("정리: 빈 응답도 화면이 쓸 수 있는 모양", () => {
  const c = normalizeCorrection({});
  assert.deepEqual(c, { b1: { text: "", fixes: [] }, b2: "", native: "", grammar: [], keep: [], keywords: [], words: [], errorTypes: [] });
});

test("고칠 곳 표시: 원문 순서대로, 겹치지 않게", () => {
  const c = normalizeCorrection(RAW, { text: TEXT });
  const parts = markFixes(TEXT, c.b1.fixes);
  assert.equal(parts.map((p) => p.t).join(""), TEXT); // 원문 그대로 복원
  const marked = parts.filter((p) => p.fix != null).map((p) => `${p.fix}:${p.t}`);
  // 3번째 고침(Parkplatz)은 2번째 고침 안에 들어 있어 따로 표시하지 않는다
  assert.deepEqual(marked, ["0:ein schwierige", "1:weil es gab keinen Parkplatz"]);
});

test("스스로 고쳤는지", () => {
  const f = { from: "weil es gab keinen Parkplatz", to: "weil es keinen Parkplatz gab" };
  assert.equal(selfFixed("…, weil es keinen Parkplatz gab.", f), true);
  assert.equal(selfFixed("…, weil es gab keinen Parkplatz.", f), false);
  assert.equal(selfFixed("", f), false);
  // to 가 from 을 품는 경우(단어 추가) — from 이 남아 있어도 to 가 있으면 고친 것
  assert.equal(selfFixed("in der Nähe vom Haus", { from: "Nähe", to: "in der Nähe" }), true);
});

test("요청문: 한국어 모드는 keywords 를, 독일어 모드는 스스로 고치기용 hint 를 요구", () => {
  assert.match(correctionPrompt({ text: "x", month: 1, tplTitle: "t", korean: true }), /"keywords"/);
  const de = correctionPrompt({ text: "x", month: 1, tplTitle: "t", korean: false });
  assert.match(de, /정답 단어를 절대 쓰지 말 것/);
  for (const c of CATEGORIES) assert.ok(de.includes(c));
});

test("자기 설명 응답", () => {
  assert.deepEqual(normalizeExplain({ ok: true, add: " 좋아요 " }), { ok: true, add: "좋아요" });
  assert.deepEqual(normalizeExplain({ ok: "yes" }), { ok: false, add: "" });
});

test("b2 · native 가 객체나 배열로 와도 글을 꺼낸다", async () => {
  const { normalizeLevelUp, textOf } = await import("./correct.js");
  const d = normalizeCorrection({ b1: { text: "A", fixes: [] }, b2: { text: "Die Lieferung wurde verzögert." }, native: ["Echt stressig.", "Kein Parkplatz."] });
  assert.equal(d.b2, "Die Lieferung wurde verzögert.");
  assert.equal(d.native, "Echt stressig. Kein Parkplatz.");
  assert.equal(normalizeCorrection({ b1: "Heute war ok.", B2: "X" }).b1.text, "Heute war ok.");
  assert.equal(normalizeCorrection({ B2: "X" }).b2, "X");
  assert.deepEqual(normalizeLevelUp({ b2: " B ", native: { de: "N" } }), { b2: "B", native: "N" });
  assert.equal(textOf(null), "");
});

test("새 단어 — 관사를 떼고, 구·중복·뜻 없는 것은 버린다", async () => {
  const { normalizeWords, wordKey } = await import("./correct.js");
  const w = normalizeWords([
    { de: "der Parkplatz", ko: "주차장", en: "parking space", level: "B1" },
    { de: "geeignet", article: "", ko: "적합한", en: "suitable" },
    { de: "Parkplatz", ko: "중복" },
    { de: "zur Verfügung stehen", ko: "구" },
    { de: "Lieferschein", article: "Der", en: "delivery note", level: "C9" },
    { de: "nichts" },
  ]);
  assert.deepEqual(w.map((x) => [x.de, x.article, x.level]), [["Parkplatz", "der", "B1"], ["geeignet", "", "B2"], ["Lieferschein", "der", "B2"]]);
  assert.equal(wordKey("die Straße"), "strasse");
  assert.deepEqual(normalizeCorrection({ b1: { text: "x" } }).words, []);
});

test("한국어 의도 줄 — 표시만 하고, 요청문이 의도 규칙을 넣는다", async () => {
  const { markIntent } = await import("./correct.js");
  const t = "[Level 1] 마라톤과 배송업무를 병행하는건 쉽지 않은 일이야.\nEs ist schwerige Job mit Marathon\n[Level 2] Weil ich müde bin.";
  const m = markIntent(t);
  assert.equal(m.has, true);
  assert.equal(m.text.split("\n")[0], "[Level 1] 🇰🇷 마라톤과 배송업무를 병행하는건 쉽지 않은 일이야.");
  assert.equal(m.text.split("\n")[1], "Es ist schwerige Job mit Marathon");
  const p = correctionPrompt({ text: t, month: 1, tplTitle: "3단계 확장" });
  assert.match(p, /🇰🇷 줄은 교정하지 않는다/);
  assert.doesNotMatch(correctionPrompt({ text: "Heute war gut.", month: 1, tplTitle: "x" }), /🇰🇷 줄은 교정하지 않는다/);
  assert.equal(markIntent("Nur Deutsch.").has, false);
});
