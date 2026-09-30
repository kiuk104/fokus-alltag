// 🎨 Fokus DE 의 테마·색 조정 가져오기 — fokus-lesen/src/lib/deTheme.js 와 같은 방식 (2026-09-30).
//
// DE 는 설정을 기기(localStorage "bw-settings")와 Supabase profiles.settings(jsonb) 두 곳에 둔다.
// 앱마다 주소가 달라 localStorage 는 나눠 쓸 수 없으니 profiles.settings 를 **읽기만** 한다.
//   colorTheme      — 테마 id (이 앱과 같은 7가지)
//   darkMode        — colorTheme 이 없을 때의 옛 방식
//   themeOverrides  — { [테마]: { "--gold": "#…" … } }  DE 설정 → 테마 → 색상 미세 조정
// 가드레일: profiles 는 이 파일에서만, 읽기만 (scripts/check-guardrails.mjs).

import { supabase } from "./supabase";
import { THEMES, cleanOverrides } from "./theme";

/** → { theme, overrides: { [테마]: {...} }, count } | null (DE 설정이 없음)
 *  overrides 에는 지금 켜진 테마만이 아니라 DE 에서 조정해 둔 모든 테마가 들어간다. */
export async function loadDeTheme(userId) {
  const { data, error } = await supabase.from("profiles").select("settings").eq("id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  const s = data?.settings;
  if (!s || typeof s !== "object") return null;
  const theme = THEMES.some((t) => t.id === s.colorTheme) ? s.colorTheme : s.darkMode ? "dark" : "light";
  const overrides = {};
  for (const [id, o] of Object.entries(s.themeOverrides || {})) {
    if (!THEMES.some((t) => t.id === id)) continue;
    const c = cleanOverrides(o);
    if (Object.keys(c).length) overrides[id] = c;
  }
  return { theme, overrides, count: Object.keys(overrides[theme] || {}).length };
}

/** 지금 설정에 DE 값을 덮어쓴 새 설정 */
export const withDeTheme = (settings, de) => ({ ...settings, theme: de.theme, themeOverrides: de.overrides });
