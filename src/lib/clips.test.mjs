import { test } from "node:test";
import assert from "node:assert/strict";
import { nearSentences, fmtRange } from "./clips.js";

const S = ["Eins eins eins.", "Zwei zwei zwei.", "Drei drei drei.", "Vier vier vier.", "Fünf fünf fünf.", "Sechs sechs sechs."];

test("근처 문장 추천 — 위치 비율로, 앞 4개는 원고 순서", () => {
  // 전체 60초 중 45~50초 → 뒤쪽 문장
  const r = nearSentences(S, { start_s: 45, end_s: 50, dur_s: 60 }, 2);
  assert.deepEqual(r.slice(0, 2), [4, 5]);
  assert.equal(r.length, S.length);
  assert.deepEqual(new Set(r), new Set([0, 1, 2, 3, 4, 5]));
  // 길이 모르면 원고 순서 그대로
  assert.deepEqual(nearSentences(S, { start_s: 1, end_s: 2 }), [0, 1, 2, 3, 4, 5]);
});

test("시각 범위 표시", () => {
  assert.equal(fmtRange(102.4, 108.9), "1:42–1:48");
  assert.equal(fmtRange(5, 9), "0:05–0:09");
});
