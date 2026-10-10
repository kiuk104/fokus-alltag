// node --test src/profiles/profiles.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { PROFILES, DEFAULT_PROFILE, profileKey, profileFor, profileList, defaultProfile } from "./index.js";
import { correctionPrompt, levelUpPrompt, systemFor, SYSTEM } from "../lib/correct.js";
import { GRAMMAR, baseTemplate } from "../lib/program.js";

test("값이 없거나 모르는 프로필이면 기본 프로필", () => {
  assert.equal(profileKey(undefined), DEFAULT_PROFILE);
  assert.equal(profileKey({}), DEFAULT_PROFILE);
  assert.equal(profileKey({ profile: "없는것" }), DEFAULT_PROFILE);
  assert.equal(profileFor(null), defaultProfile);
  assert.equal(profileFor({ listen: {} }).key, "b2-arbeit");
});

test("화면 언어 · 단서 언어는 설정이 프로필 기본값을 이긴다", () => {
  assert.equal(profileFor({}).uiLang, "ko");
  const p = profileFor({ uiLang: "de", cueLang: "de" });
  assert.equal(p.uiLang, "de");
  assert.equal(p.cueLang, "de");
  assert.equal(p.key, "b2-arbeit");
  assert.equal(defaultProfile.uiLang, "ko", "원본 프로필은 바뀌지 않는다");
  assert.equal(profileFor({ uiLang: "fr" }).uiLang, "ko", "모르는 언어는 무시");
});

test("모든 프로필이 같은 칸을 갖는다", () => {
  for (const p of Object.values(PROFILES)) {
    assert.equal(PROFILES[p.key], p);
    for (const k of ["name", "about", "uiLang", "explainLang", "cueLang"]) assert.equal(typeof p[k], "string", `${p.key}.${k}`);
    for (const k of ["b1", "b2", "native"]) assert.ok(p.levels[k], `${p.key}.levels.${k}`);
    assert.ok(p.prompt.system && p.prompt.scene);
    assert.ok(p.grammar.length > 0 && p.grammar.every((g) => g.key && g.label));
    assert.ok(p.categories.length > 0);
    assert.ok(p.templates.switchable.length > 0);
    for (const s of p.templates.switchable) assert.ok(p.templates.form(s.key, 1).fields.length > 0, `${p.key} 형식 ${s.key}`);
    assert.equal(typeof p.de.send, "boolean");
  }
  assert.deepEqual(profileList().map((x) => x.key), Object.keys(PROFILES));
});

test("b2-arbeit 는 기존 표를 그대로 가리킨다", () => {
  assert.equal(defaultProfile.grammar, GRAMMAR);
  assert.equal(defaultProfile.templates.base, baseTemplate);
  assert.equal(systemFor(), SYSTEM);
  assert.match(SYSTEM, /REWE/);
});

test("요청문은 프로필의 맥락 · 문법 · 카테고리를 쓴다", () => {
  const other = {
    ...defaultProfile,
    prompt: { system: "S", scene: "수업에서 읽은 글" },
    grammar: [{ key: "konj1", label: "Konjunktiv I" }],
    categories: ["Schule"],
  };
  const a = correctionPrompt({ text: "Heute war gut.", month: 1, tplTitle: "3단계 확장" });
  const b = correctionPrompt({ text: "Heute war gut.", month: 1, tplTitle: "3단계 확장", profile: other });
  assert.match(a, /REWE 배송 중 있었던 일을 독일어로/);
  assert.match(b, /수업에서 읽은 글을 독일어로/);
  assert.match(b, /konj1 \(Konjunktiv I\)/);
  assert.doesNotMatch(b, /REWE|nebensatz|Berufs- und Arbeitsleben/);
  assert.match(levelUpPrompt({ b1: "x", profile: other }), /수업에서 읽은 글을 쓴/);
  assert.equal(systemFor(other), "S");
});
