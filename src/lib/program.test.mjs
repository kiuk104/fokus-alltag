// npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { programState, templateFor, mixFor, streak, addDays, weekday, daysBetween } from "./program.js";

const START = "2026-10-01"; // 목요일

test("시작 전: D-day 와 1개월차 표시", () => {
  const s = programState(START, "2026-09-23");
  assert.equal(s.status, "before");
  assert.equal(s.daysLeft, 8);
});

test("시작일 당일 = 1일째, 1개월차", () => {
  const s = programState(START, START);
  assert.equal(s.status, "running");
  assert.equal(s.dayNo, 1);
  assert.equal(s.month, 1);
  assert.equal(s.phase.no, 1);
});

test("30일 단위로 개월이 넘어간다", () => {
  assert.equal(programState(START, addDays(START, 29)).month, 1);
  assert.equal(programState(START, addDays(START, 30)).month, 2);
  assert.equal(programState(START, addDays(START, 60)).month, 3);
  assert.equal(programState(START, addDays(START, 179)).month, 6);
  assert.equal(programState(START, addDays(START, 180)).status, "done");
});

test("서머타임 끝나는 날(10/25)을 지나도 하루가 어긋나지 않는다", () => {
  assert.equal(daysBetween("2026-10-24", "2026-10-26"), 2);
  assert.equal(addDays("2026-10-24", 2), "2026-10-26");
});

test("요일", () => {
  assert.equal(weekday("2026-10-01"), 4); // 목
  assert.equal(weekday("2026-10-04"), 0); // 일
});

// 섞는 날이 아닌 날짜로 기본 형식을 본다
const plain = (offset) => {
  let d = addDays(START, offset);
  while (mixFor(START, d)) d = addDays(d, 1);
  return d;
};

test("템플릿: 개월별 + 수동 지정", () => {
  assert.equal(templateFor(START, START), "expand3");
  assert.equal(templateFor(START, plain(65)), "why");
  assert.equal(templateFor(START, plain(125)), "problem4");
  assert.equal(templateFor(START, addDays(START, 155)), "weekday");
  assert.equal(templateFor(START, START, "problem4"), "problem4");
  assert.equal(templateFor(START, START, "없는값"), "expand3");
});

const done = (day) => ({ day, speak: true, repeat: true });

test("연속: 일요일은 건너뛰고, 오늘 안 했으면 어제까지", () => {
  // 10/1(목) 10/2(금) 10/3(토) · 10/4(일 쉼) · 10/5(월)
  const rows = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-05"].map(done);
  assert.equal(streak(rows, START, "2026-10-05"), 4);
  assert.equal(streak(rows, START, "2026-10-06"), 4); // 화요일 저녁, 아직 안 함
  assert.equal(streak(rows, START, "2026-10-07"), 0); // 화요일을 빼먹음
});

test("연속: 말하기만 하고 소리 내기를 안 하면 안 센다", () => {
  const rows = [{ day: START, speak: true, repeat: false }];
  assert.equal(streak(rows, START, START), 0);
});

test("연속: 시작 전 날짜는 세지 않는다", () => {
  const rows = [done("2026-09-30"), done(START)];
  assert.equal(streak(rows, START, START), 1);
});

test("교차: 1~2개월은 섞지 않는다", () => {
  for (let i = 0; i < 60; i++) assert.equal(mixFor(START, addDays(START, i)), null);
});

test("교차: 3~4개월은 월·목만 3단계 확장", () => {
  for (let i = 60; i < 120; i++) {
    const d = addDays(START, i);
    const wd = weekday(d);
    assert.equal(mixFor(START, d), wd === 1 || wd === 4 ? "expand3" : null, d);
    assert.equal(templateFor(START, d), wd === 1 || wd === 4 ? "expand3" : "why", d);
  }
});

test("교차: 5개월은 화·금에 지난 형식, 같은 날은 늘 같은 형식", () => {
  const seen = new Set();
  for (let i = 120; i < 150; i++) {
    const d = addDays(START, i);
    const wd = weekday(d);
    const m = mixFor(START, d);
    if (wd === 2 || wd === 5) { assert.ok(m === "expand3" || m === "why", d); seen.add(m); }
    else assert.equal(m, null, d);
    assert.equal(mixFor(START, d), m);
  }
  assert.equal(seen.size, 2); // 한 달 안에 두 형식이 다 나온다
});

test("교차: 6개월은 요일 루틴 그대로, 시작 전은 없음", () => {
  for (let i = 150; i < 180; i++) assert.equal(mixFor(START, addDays(START, i)), null);
  assert.equal(mixFor(START, "2026-09-28"), null);
});

test("교차: 수동 지정이 섞는 날보다 이긴다", () => {
  let d = addDays(START, 60);
  while (!mixFor(START, d)) d = addDays(d, 1);
  assert.equal(templateFor(START, d, "problem4"), "problem4");
});
