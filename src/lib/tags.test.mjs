// npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { matchTag, tagsFor } from "./tags.js";

const EXISTING = [
  { tag: "Parkplatz", count: 12 },
  { tag: "Lieferung", count: 30 },
  { tag: "Nebensatz", count: 4 },
];

test("같은 태그가 있으면 그대로", () => {
  assert.deepEqual(matchTag("Lieferung", EXISTING), { tag: "Lieferung" });
});

test("표기만 다른 태그는 기존 것으로 맞춘다", () => {
  assert.deepEqual(matchTag("Parkplätze", EXISTING), { tag: "Parkplatz", from: "Parkplätze" });
  assert.deepEqual(matchTag("lieferung", EXISTING), { tag: "Lieferung", from: "lieferung" });
});

test("비슷한 게 없으면 새 태그", () => {
  assert.deepEqual(matchTag("Kunde", EXISTING), { tag: "Kunde" });
  assert.equal(matchTag("  ", EXISTING), null);
});

test("한 문장의 태그: 프로그램·개월·문법·주제, 중복 없이", () => {
  const r = tagsFor({ topic: "Parkplätze" }, { month: 3, existing: EXISTING, grammarLabel: "Nebensatz" });
  assert.deepEqual(r.tags, ["B2-Programm", "M3", "Nebensatz", "Parkplatz"]);
  assert.deepEqual(r.changed, ["Parkplätze → Parkplatz"]);
});
