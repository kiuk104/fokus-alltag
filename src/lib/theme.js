// 테마 — 기기에만 남는다(localStorage "fa-settings").
// 팔레트는 Fokus DE·Karten 과 같다(styles/theme.css 를 그대로 가져왔다) — 세 앱을 오갈 때 인상이 끊기지 않게.
// 색 미세 조정은 Fokus DE 설정에서 한다. 이 앱은 설정 → "🎨 Fokus DE 색 가져오기" 로 복사해 온다(lib/deTheme.js, Lesen 과 같은 방식).
//
// ⚠ index.html 의 인라인 스크립트가 첫 페인트 전에 같은 키를 읽는다. BAR 표를 바꾸면 거기도 같이.

const KEY = "fa-settings";

export const THEMES = [
  { id: "light", name: "Classic Light", bar: "#f3ede2", swatches: ["#f3ede2", "#faf5ec", "#bf8729", "#17110a"] },
  { id: "dark", name: "Classic Dark", bar: "#101214", swatches: ["#101214", "#242424", "#d4a843", "#e8e0d0"] },
  { id: "paper", name: "Paper & Ink", bar: "#F5F5F3", swatches: ["#F5F5F3", "#FFFFFF", "#4A90E2", "#2D2D2D"] },
  { id: "neon", name: "Midnight Neon", bar: "#0B0E14", swatches: ["#0B0E14", "#1A1D23", "#00FFD1", "#E0E0E0"] },
  { id: "forest", name: "Forest & Wood", bar: "#131313", swatches: ["#131313", "#1e2a1e", "#d4a040", "#e0e0d0"] },
  { id: "lavender", name: "Deep Lavender", bar: "#1A1625", swatches: ["#1A1625", "#2D283E", "#FF79C6", "#FFFFFF"] },
  { id: "terminal", name: "Terminal", bar: "#1a1a2e", swatches: ["#1a1a2e", "#16213e", "#e8a855", "#c8d6e5"] },
];

export function getSettings() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

export function saveSettings(next) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* 사생활 보호 모드 등 — 이번 방문에만 적용된다 */
  }
  return next;
}

// 색 미세 조정 — Fokus DE 설정의 themeOverrides 와 같은 모양 { [테마]: { "--gold": "#…", … } }.
// DE 의 EDITABLE_THEME_VARS 와 같은 변수만 받는다 (그 밖의 값은 무시). fokus-lesen/src/lib/theme.js 와 같다.
export const THEME_VARS = ["--cream", "--card", "--border", "--ink", "--muted", "--gold", "--der", "--die", "--das", "--green", "--red", "--blue"];
const COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\))$/i;

/** 받은 조정값에서 쓸 수 있는 것만 */
export function cleanOverrides(o) {
  const out = {};
  if (!o || typeof o !== "object") return out;
  for (const v of THEME_VARS) if (typeof o[v] === "string" && COLOR.test(o[v].trim())) out[v] = o[v].trim();
  return out;
}

// 카드 견본 4칸 = [배경, 카드, 강조, 글자] — 색 조정이 있으면 그 색으로 보여 준다
const SWATCH_VARS = ["--cream", "--card", "--gold", "--ink"];
export function themeSwatches(theme, overrides) {
  const o = cleanOverrides(overrides?.[theme.id]);
  return theme.swatches.map((c, i) => o[SWATCH_VARS[i]] || c);
}

export function applyTheme(settings = getSettings()) {
  const dark = typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
  const id = settings.theme || (dark ? "dark" : "light");
  const root = document.documentElement;
  root.setAttribute("data-theme", id);
  // 조정값: 먼저 다 지우고 이 테마 것만 얹는다
  THEME_VARS.forEach((v) => root.style.removeProperty(v));
  const over = cleanOverrides(settings.themeOverrides?.[id]);
  for (const [k, val] of Object.entries(over)) root.style.setProperty(k, val);
  // 상태바 색 = 배경색 (조정했으면 그 색)
  const bar = over["--cream"] || THEMES.find((t) => t.id === id)?.bar || THEMES[0].bar;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bar);
  return id;
}
