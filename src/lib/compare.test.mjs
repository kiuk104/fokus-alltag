// npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { compareLine, tokens, norm, scriptSentences } from "./compare.js";

const SCRIPT = [
  { h: "", p: "Mit seinem Papamobil ist der Papst auf der berühmten Straße Champs-Élysées in Paris gefahren. Eine große Menschen-Menge hat ihm zugejubelt." },
  { h: "", p: "Der Papst hat auch vor der UNO gesprochen." },
];

const kinds = (r) => r.mine.filter((t) => t.word).map((t) => `${t.t}:${t.kind}${t.fix ? "→" + t.fix : ""}`);

test("원고에 있는 단어는 ok, 철자가 가까우면 fix, 기능어는 표시 안 함", () => {
  const r = compareLine("Es geht um den Pabst in Paris.", SCRIPT);
  assert.deepEqual(kinds(r), ["Es:fn", "geht:fn", "um:fn", "den:fn", "Pabst:fix→Papst", "in:fn", "Paris:ok"]);
  assert.deepEqual(r.stats, { ok: 1, fix: 1, content: 2 });
});

test("원고에 없는 내 단어는 own (벌점처럼 보이지 않게)", () => {
  const r = compareLine("Der Papst besucht Frankreich.", SCRIPT);
  assert.deepEqual(kinds(r), ["Der:fn", "Papst:ok", "besucht:own", "Frankreich:own"]);
});

test("ß 와 ss, 대소문자는 같게 본다", () => {
  const r = compareLine("grosse Strasse", SCRIPT);
  assert.deepEqual(kinds(r), ["grosse:ok", "Strasse:ok"]);
});

test("짧은 단어(3글자 이하)는 철자 고치기를 하지 않는다", () => {
  const r = compareLine("UNI", SCRIPT);
  assert.deepEqual(kinds(r), ["UNI:own"]);
});

test("가장 가까운 원고 문장을 고르고 겹친 단어에 표시", () => {
  const r = compareLine("Der Papst fährt in Paris mit dem Papamobil.", SCRIPT);
  assert.equal(r.best.length, 2);
  assert.match(r.best[0].text, /^Mit seinem Papamobil/);
  const hits = r.best[0].parts.filter((p) => p.hit).map((p) => p.t);
  assert.deepEqual(hits, ["Papamobil", "Papst", "Paris"]);
});

test("겹치는 게 없으면 가까운 문장도 없다", () => {
  assert.deepEqual(compareLine("Heute regnet es.", SCRIPT).best, []);
});

test("낱말 풀이 단어도 원고 단어로 친다", () => {
  const r = compareLine("Gottesdienst", [], [{ term: "Messe", expl: "Ein Gottesdienst in der Kirche." }]);
  assert.deepEqual(kinds(r), ["Gottesdienst:ok"]);
});

test("조각 나누기는 원래 글을 그대로 되살린다", () => {
  const s = "Es geht um „den Papst“ — in Paris!";
  assert.equal(tokens(s).map((t) => t.t).join(""), s);
  assert.equal(norm("„Papst“,"), "papst");
});

test("원고 문장 나누기: 소제목 + 마침표", () => {
  assert.deepEqual(scriptSentences([{ h: "Titel", p: "Satz eins. Satz zwei." }]), ["Titel", "Satz eins.", "Satz zwei."]);
});
