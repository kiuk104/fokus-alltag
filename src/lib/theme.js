// 테마 — 기기에만 남는다(localStorage "fa-settings").
// 팔레트는 Fokus DE·Karten 과 같다(styles/theme.css 를 그대로 가져왔다) — 세 앱을 오갈 때 인상이 끊기지 않게.
// 글꼴·색 미세 조정은 Karten 에만 있다. 이 앱은 글을 쓰는 곳이라 테마 하나로 충분하다.
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

export function applyTheme(settings = getSettings()) {
  const dark = typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
  const id = settings.theme || (dark ? "dark" : "light");
  document.documentElement.setAttribute("data-theme", id);
  const bar = THEMES.find((t) => t.id === id)?.bar || THEMES[0].bar;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bar);
  return id;
}
