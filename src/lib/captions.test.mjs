import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { parseCaptionText, loadCaptions, saveCaptions, clearCaptions } from "./captions.js";

// 노드에는 localStorage 가 없어서 간단한 가짜를 단다
beforeEach(() => {
  const m = new Map();
  globalThis.localStorage = {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
});

const PASTE = "0:00\nHallo und willkommen\n0:02\nbei Easy German. Heute\n0:04\nsind wir in Wien!\n0:07\nGehen wir ins Café?";

test("붙여넣은 스크립트 → 문장 구간", () => {
  const s = parseCaptionText(PASTE);
  assert.deepEqual(s.map((x) => x.text), ["Hallo und willkommen bei Easy German.", "Heute sind wir in Wien!", "Gehen wir ins Café?"]);
  assert.deepEqual(s.map((x) => x.i), [0, 1, 2]);
  assert.ok(s.every((x) => x.end > x.start));
});

test("시각이 없는 글은 문장이 없다", () => {
  assert.deepEqual(parseCaptionText("그냥 글입니다"), []);
  assert.deepEqual(parseCaptionText(""), []);
});

test("저장 · 읽기 · 지우기 (영상마다)", () => {
  const s = parseCaptionText(PASTE);
  assert.deepEqual(loadCaptions("AAAAAAAAAAA"), []);
  assert.equal(saveCaptions("AAAAAAAAAAA", s), true);
  assert.deepEqual(loadCaptions("AAAAAAAAAAA"), s);
  assert.deepEqual(loadCaptions("BBBBBBBBBBB"), []);
  clearCaptions("AAAAAAAAAAA");
  assert.deepEqual(loadCaptions("AAAAAAAAAAA"), []);
});

test("저장소를 못 쓰는 환경에서도 터지지 않는다", () => {
  globalThis.localStorage = {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("blocked"); },
    removeItem: () => { throw new Error("blocked"); },
  };
  assert.deepEqual(loadCaptions("AAAAAAAAAAA"), []);
  assert.equal(saveCaptions("AAAAAAAAAAA", []), false);
  clearCaptions("AAAAAAAAAAA");
});
