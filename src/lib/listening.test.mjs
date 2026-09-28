// npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { listenFor, defaultRotation, SOURCES, looksLikeUrl } from "./listening.js";

test("기본 순환: 1~2개월은 쉬운 쪽, 3개월부터 원어민 속도 뉴스", () => {
  assert.equal(listenFor(1, 1, {}).id, "leicht");
  assert.equal(listenFor(1, 3, {}).id, "tagesschau");
  assert.equal(listenFor(0, 3, {}), null); // 일요일
});

test("월~토 모두 출처가 있고, 한 주에 적어도 세 곳을 돈다", () => {
  for (const m of [1, 3]) {
    const r = defaultRotation(m);
    for (let wd = 1; wd <= 6; wd++) assert.ok(SOURCES[r[wd]], `${m}월 ${wd}`);
    assert.ok(new Set(Object.values(r)).size >= 3);
  }
});

test("설정한 요일이 기본을 이기고, 내 링크가 없으면 그 요일 기본으로", () => {
  const settings = { listen: { rotation: { 2: "easy", 3: "custom" } } };
  assert.equal(listenFor(2, 1, settings).id, "easy");
  assert.equal(listenFor(3, 1, settings).id, defaultRotation(1)[3]);
  settings.listen.custom = { name: "Nova", url: "https://example.org/x" };
  assert.equal(listenFor(3, 1, settings).name, "Nova");
});

test("주소 모양 검사", () => {
  assert.ok(looksLikeUrl("https://www.nachrichtenleicht.de/"));
  assert.ok(!looksLikeUrl("nachrichtenleicht"));
});
