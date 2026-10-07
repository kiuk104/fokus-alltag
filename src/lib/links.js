// 다른 Fokus 앱으로 건너가는 통로 — 여기서 만들지 않고 **가기**만 한다.
//
// 세 앱이 같은 Supabase 를 보므로 넘길 것은 주소뿐이다. 받는 쪽 파라미터:
//   Fokus DE  ?fill=<문장 id> · ?note=<문장 id> · ?edit=<문장 id>  (Basiswortschatz App.jsx 딥링크 처리부)
//             ?grammar=<오류 유형> — Dojo 📐 문법 라운드 (2026-10-07)
// 반드시 새 탭 — 같은 탭에서 떠나면 쓰던 기록이 사라진다.

const trim = (s) => (s || "").replace(/\/+$/, "");

export const DE_URL = trim(import.meta.env.VITE_FOKUS_DE_URL) || "https://basiswortschatz.vercel.app";
export const KARTEN_URL = trim(import.meta.env.VITE_KARTEN_URL) || "https://fokus-karten.vercel.app";
// 이 앱 주소 (2026-09-30 첫 배포)
export const ALLTAG_URL = "https://fokus-alltag.vercel.app";

export const openApp = (url) => window.open(url, "_blank", "noopener");

// DE Dojo 📐 문법이 문제를 만들 수 있는 유형 — DE src/lib/grammarDrill.js FOCUS_ALIASES 와 같게 유지한다.
// 여기 없는 유형(Verbform · Wortwahl …)은 링크를 숨긴다 (눌러도 "아직 못 만든다"만 나오므로).
const DE_GRAMMAR = new Set([
  "artikel", "kasus", "deklination", "adjektivendung",
  "präposition", "praeposition",
  "verbstellung", "wortstellung", "satzbau", "nebensatz",
]);
export const deHasGrammar = (type) => DE_GRAMMAR.has(String(type || "").trim().toLowerCase());
export const deGrammarUrl = (type) => `${DE_URL}/?grammar=${encodeURIComponent(String(type).trim())}`;
