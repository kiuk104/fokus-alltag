// 다른 Fokus 앱으로 건너가는 통로 — 여기서 만들지 않고 **가기**만 한다.
//
// 세 앱이 같은 Supabase 를 보므로 넘길 것은 주소뿐이다. 받는 쪽 파라미터:
//   Fokus DE  ?fill=<문장 id> · ?note=<문장 id> · ?edit=<문장 id>  (Basiswortschatz App.jsx 딥링크 처리부)
// 반드시 새 탭 — 같은 탭에서 떠나면 쓰던 기록이 사라진다.

const trim = (s) => (s || "").replace(/\/+$/, "");

export const DE_URL = trim(import.meta.env.VITE_FOKUS_DE_URL) || "https://basiswortschatz.vercel.app";
export const KARTEN_URL = trim(import.meta.env.VITE_KARTEN_URL) || "https://fokus-karten.vercel.app";
// 이 앱 주소 (2026-09-30 첫 배포)
export const ALLTAG_URL = "https://fokus-alltag.vercel.app";

export const openApp = (url) => window.open(url, "_blank", "noopener");
