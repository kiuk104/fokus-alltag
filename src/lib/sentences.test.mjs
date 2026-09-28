// npm test — 가짜 소리(말 = 사인파, 쉼 = 거의 무음)로 문장 경계 찾기를 검사한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sentenceStarts, segIndex, prevStart, nextStart } from "./sentences.js";

const SR = 8000;
/** parts: [["talk", 초] | ["gap", 초]] → Float32Array */
function make(parts, noise = 0.002) {
  const total = parts.reduce((s, [, d]) => s + d, 0);
  const out = new Float32Array(Math.round(total * SR));
  let i = 0;
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
  for (const [kind, d] of parts) {
    const n = Math.round(d * SR);
    for (let k = 0; k < n; k++, i++) {
      out[i] = (kind === "talk" ? 0.3 * Math.sin((2 * Math.PI * 220 * k) / SR) * (0.6 + 0.4 * Math.sin(k / 400)) : 0) + noise * rnd();
    }
  }
  return out;
}

// 문장 = 말 2.5초 + 쉼표 0.15초 + 말 2.5초, 문장 사이 = 0.8초 쉼
const sentence = [["talk", 2.5], ["gap", 0.15], ["talk", 2.5]];
const parts = [];
for (let s = 0; s < 8; s++) {
  parts.push(...sentence);
  if (s < 7) parts.push(["gap", 0.8]);
}

test("문장 사이(0.8초)에서만 자르고 쉼표(0.15초)에서는 자르지 않는다", () => {
  const starts = sentenceStarts(make(parts), SR);
  assert.equal(starts.length, 8);
  // 각 문장은 5.15초 + 쉼 0.8초 → n번째 문장은 약 n*5.95초에 시작 (조금 앞에서)
  starts.slice(1).forEach((t, k) => {
    const speech = (k + 1) * 5.95;
    assert.ok(t <= speech && t >= speech - 0.8, `문장 ${k + 1}: ${t.toFixed(2)} vs ${speech.toFixed(2)}`);
  });
});

test("쉼이 없는 소리는 [0] 만", () => {
  assert.deepEqual(sentenceStarts(make([["talk", 20]]), SR), [0]);
});

test("너무 짧은 소리는 [0]", () => {
  assert.deepEqual(sentenceStarts(make([["talk", 1]]), SR), [0]);
});

test("이전/다음 문장 버튼 규칙", () => {
  const s = [0, 6, 12, 18];
  assert.equal(segIndex(s, 7), 1);
  assert.equal(prevStart(s, 9), 6); // 문장 안으로 3초 → 그 문장 처음
  assert.equal(prevStart(s, 6.5), 0); // 막 시작했으면 앞 문장
  assert.equal(prevStart(s, 0.5), 0);
  assert.equal(nextStart(s, 7), 12);
  assert.equal(nextStart(s, 19), null);
});
