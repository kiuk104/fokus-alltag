// 프로필 — 같은 앱을 다른 학습 기준으로 쓴다 (기획서 0-6절).
//
// 틀(🟢듣기 → 🟡쓰기 → 🔵단계별 공개 교정 → 🔴꺼내기)은 모두 같고, 프로필은 내용만 바꾼다.
// 고른 프로필은 alltag_program.settings.profile 에 둔다(jsonb — 마이그레이션 없음).
// 값이 없거나 모르는 값이면 기본 프로필이다 → 프로필이 생기기 전의 계정은 그대로 동작한다.

import b2Arbeit from "./b2-arbeit.js";

export const DEFAULT_PROFILE = "b2-arbeit";

export const PROFILES = {
  [b2Arbeit.key]: b2Arbeit,
};

/** 설정에서 고를 수 있는 목록 [{ key, name, about }] */
export const profileList = () => Object.values(PROFILES).map(({ key, name, about }) => ({ key, name, about }));

/** settings → 프로필 키 */
export const profileKey = (settings) => (PROFILES[settings?.profile] ? settings.profile : DEFAULT_PROFILE);

/**
 * settings → 프로필.
 * 언어 두 가지(화면 · 꺼내기 단서)는 프로필과 따로 저장해서 설정이 프로필 기본값을 이긴다.
 */
export function profileFor(settings) {
  const p = PROFILES[profileKey(settings)];
  const lang = (v, fallback) => (v === "ko" || v === "de" ? v : fallback);
  const uiLang = lang(settings?.uiLang, p.uiLang);
  const cueLang = lang(settings?.cueLang, p.cueLang);
  return uiLang === p.uiLang && cueLang === p.cueLang ? p : { ...p, uiLang, cueLang };
}

export const defaultProfile = PROFILES[DEFAULT_PROFILE];
