// npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { formFor, composeText, hasContent, wordCount, randomQuestion, WHY_QUESTIONS, carryText, isSkipped } from "./templates.js";
import { appendSpoken } from "./speech.js";

test("형식별 칸", () => {
  assert.deepEqual(formFor("expand3", 3).fields.map((f) => f.key), ["l1", "l2", "l3"]);
  assert.deepEqual(formFor("problem4", 3).fields.map((f) => f.key), ["passiert", "warum", "folge", "verbesserung"]);
  assert.equal(formFor("weekday", 4).sub, "email"); // 목요일 = 이메일
  assert.equal(formFor("weekday", 5).sub, "problem");
  assert.equal(formFor("weekday", 0).sub, "rest"); // 일요일
});

test("교정에 보낼 글: 칸 이름을 붙이고 빈 칸은 뺀다", () => {
  const form = formFor("expand3", 3);
  const text = composeText(form, { l1: " Heute war es kalt. ", l2: "", l3: "Heute war es sehr kalt, weil …" });
  assert.equal(text, "[Level 1] Heute war es kalt.\n[Level 3] Heute war es sehr kalt, weil …");
});

test("질문 칸만 있으면 저장할 내용이 없다", () => {
  const form = formFor("why", 3);
  assert.equal(hasContent(form, { q: "Warum?" }), false);
  assert.equal(hasContent(form, { q: "Warum?", b1: "Wegen des Verkehrs." }), true);
});

test("단어 수", () => {
  assert.equal(wordCount("  Sehr geehrte  Damen und Herren, "), 5);
  assert.equal(wordCount(""), 0);
});

test("다른 질문은 지금 질문과 다르다", () => {
  for (const q of WHY_QUESTIONS) assert.notEqual(randomQuestion(q), q);
});

test("음성 조각 붙이기: 띄어쓰기, 문장 첫 글자 대문자(독일어만)", () => {
  assert.equal(appendSpoken("", "heute war ich müde", "de-DE"), "Heute war ich müde");
  assert.equal(appendSpoken("Heute war ich müde", "weil die Tour lang war", "de-DE"), "Heute war ich müde weil die Tour lang war");
  assert.equal(appendSpoken("Heute war ich müde.", "danach bin ich", "de-DE"), "Heute war ich müde. Danach bin ich");
  assert.equal(appendSpoken("오늘은", "피곤했다", "ko-KR"), "오늘은 피곤했다");
  assert.equal(appendSpoken("abc", "   ", "de-DE"), "abc");
});

test("Level 2·3 건너뛰기 — 건너뛴 칸은 글이 있어도 교정에 안 보내고, 이어 쓰기는 그 앞 칸에서", () => {
  const form = formFor("expand3", 1);
  const parts = { l1: "Heute war es kalt.", l2: "Heute war es kalt, weil …", l3: "", skip: { l2: true } };
  assert.equal(isSkipped(parts, "l2"), true);
  assert.equal(composeText(form, parts), "[Level 1] Heute war es kalt.");
  assert.equal(carryText(form, parts, form.fields[2]), "Heute war es kalt.");
  assert.equal(carryText(form, { ...parts, skip: {} }, form.fields[2]), "Heute war es kalt, weil …"); // 안 건너뛰면 Level 2 에서
  assert.equal(hasContent(form, { l2: "x", skip: { l2: true } }), false);
  assert.deepEqual(form.fields.filter((f) => f.optional).map((f) => f.key), ["l2", "l3"]);
});
