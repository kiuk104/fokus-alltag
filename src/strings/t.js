// 화면 문구 찾기 — 순수 함수만 (테스트: strings.test.mjs). 기획서 0-6절 "화면 언어".
//
// 문구는 화면 코드에 직접 쓰지 않고 strings/<언어>/*.js 에 모은다. 화면은 t("today.routine") 처럼 키로 읽는다.
//   - 고른 언어에 키가 없으면 한국어로 보여 준다 → 독일어 문구를 한 번에 다 옮기지 않아도 된다.
//   - 한국어에도 없으면 키 그대로 보인다(빠뜨린 것이 화면에서 바로 눈에 띄게).
//   - "{n}일째" 의 {n} 자리에는 t("…", { n: 9 }) 로 값을 넣는다.
//
// 여기 모으는 것은 **버튼 · 안내 · 제목** 같은 화면 문구다.
// 형식 이름 · 문법 목록 · 듣기 출처처럼 "무엇을 가르치는가"는 프로필(src/profiles/) 몫이라 여기 두지 않는다.

import ko from "./ko/index.js";
import de from "./de/index.js";

export const DICT = { ko, de };
export const LANGS = [
  { key: "ko", label: "한국어" },
  { key: "de", label: "Deutsch" },
];
export const DEFAULT_LANG = "ko";

const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s);

/** 언어 · 키 → 문구 */
export function translate(lang, key, vars) {
  const s = DICT[lang]?.[key] ?? DICT[DEFAULT_LANG][key];
  return s == null ? key : fill(s, vars);
}

/** 언어 → t(키, 값) */
const cache = new Map();
export function makeT(lang) {
  const l = DICT[lang] ? lang : DEFAULT_LANG;
  if (!cache.has(l)) {
    const t = (key, vars) => translate(l, key, vars);
    t.lang = l;
    cache.set(l, t);
  }
  return cache.get(l);
}
