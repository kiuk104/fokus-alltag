// node --test src/strings/strings.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { DICT, LANGS, translate, makeT } from "./t.js";

const holes = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

test("키를 찾고 값을 채운다", () => {
  assert.equal(translate("ko", "tab.today"), "오늘");
  assert.equal(translate("ko", "today.day", { n: 9 }), "· 9일째");
  assert.equal(translate("ko", "date.long", { m: 10, d: 9, dow: "금" }), "10월 9일 (금)");
  assert.equal(translate("ko", "today.day"), "· {n}일째", "값을 안 주면 자리 표시가 남는다");
});

test("고른 언어에 없으면 한국어, 한국어에도 없으면 키 그대로", () => {
  const key = Object.keys(DICT.ko).find((k) => !(k in DICT.de)) || "tab.today";
  assert.equal(translate("de", key), translate("ko", key));
  assert.equal(translate("fr", "tab.today"), "오늘", "모르는 언어도 한국어");
  assert.equal(translate("ko", "없는.키"), "없는.키");
});

test("makeT 는 언어마다 같은 함수를 돌려준다(화면이 다시 그려지지 않게)", () => {
  assert.equal(makeT("ko"), makeT("ko"));
  assert.equal(makeT("ko").lang, "ko");
  assert.equal(makeT("de").lang, "de");
  assert.equal(makeT("xx").lang, "ko");
  assert.equal(makeT("ko")("today.month", { n: 3 }), "3개월차");
});

test("모든 언어: 한국어에 있는 키만 쓰고, 자리 표시({n} 등)가 한국어와 같다", () => {
  assert.deepEqual(LANGS.map((l) => l.key).sort(), Object.keys(DICT).sort());
  for (const [lang, dict] of Object.entries(DICT)) {
    for (const [key, s] of Object.entries(dict)) {
      assert.equal(typeof s, "string", `${lang} ${key}`);
      assert.ok(key in DICT.ko, `${lang} 에만 있는 키: ${key}`);
      assert.equal(holes(s), holes(DICT.ko[key]), `${lang} ${key} 의 자리 표시`);
    }
  }
});
