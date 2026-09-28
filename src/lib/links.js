// 다른 Fokus 앱으로 건너가는 통로 — 여기서 만들지 않고 **가기**만 한다.
//
// 세 앱이 같은 Supabase 를 보므로 넘길 것은 주소뿐이다. 받는 쪽 파라미터:
//   Fokus DE  ?fill=<문장 id> · ?note=<문장 id> · ?edit=<문장 id>  (Basiswortschatz App.jsx 딥링크 처리부)
// 반드시 새 탭 — 같은 탭에서 떠나면 쓰던 기록이 사라진다.

const trim = (s) => (s || "").replace(/\/+$/, "");

export const DE_URL = trim(import.meta.env.VITE_FOKUS_DE_URL) || "https://basiswortschatz.vercel.app";
// Karten 배포 주소는 .env 에 넣어야 버튼이 생긴다(모르는 주소로 보내지 않는다).
export const KARTEN_URL = trim(import.meta.env.VITE_KARTEN_URL);

export const openApp = (url) => window.open(url, "_blank", "noopener");
