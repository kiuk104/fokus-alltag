// 🟢 듣기 — 무엇을 들을지 정해 준다. 콘텐츠는 밖에 있고, 이 앱은 바로가기만 한다.
//
// 고른 기준: 무료 · 매일(또는 자주) 새 편 · 폰 브라우저에서 앱 설치 없이 열림 · 5분 안팎.
// 2026-09-28 에 네 곳 모두 최근 편이 올라오는 것을 확인했다. 주소가 바뀌면 여기만 고친다.
//
// 네 곳 모두 앱 안에서 튼다(api/listen.js · screens/Listen.jsx). 원고: Nachrichtenleicht 기사 글 · DW 원고 ·
// Easy German 화면 자막(가림 띠) — tagesschau 는 원고가 없다(2단계 AI 받아쓰기 예정). "내 링크"만 밖으로 연다.
//
// 요일마다 다른 곳이 열린다 — 같은 목소리·같은 속도만 들으면 금방 익숙해져서 "들리는 것 같은" 착각이 생긴다
// (기획서 0-2절 교차). 1~2개월차는 쉬운 쪽을 더 자주, 3개월차부터 원어민 속도 뉴스를 넣는다.

export const SOURCES = {
  leicht: {
    name: "Nachrichtenleicht",
    by: "Deutschlandfunk · 쉬운 독일어 뉴스",
    level: "쉬움",
    url: "https://www.nachrichtenleicht.de/",
    how: "기사 하나를 원고 없이 듣기 → 한 줄 요약 → 기사 글·낱말 풀이 열기.",
  },
  dw: {
    name: "Langsam gesprochene Nachrichten",
    by: "DW · 천천히 읽는 뉴스",
    level: "보통",
    url: "https://www.radio.de/podcast/dwlangsam",
    how: "짧은 뉴스 여러 개. 원고 없이 듣고 → 주제를 한 줄로 → 원고 열기.",
  },
  easy: {
    name: "Easy German",
    by: "YouTube · 길거리 인터뷰",
    level: "원어민 대화",
    url: "https://www.youtube.com/@EasyGerman",
    how: "자막을 가린 채 한 번 → 가림 띠를 걷고 한 번. 실제 사람들의 말투.",
  },
  tagesschau: {
    name: "tagesschau in 100 Sekunden",
    by: "ARD · 원어민 속도 뉴스",
    level: "빠름",
    url: "https://www.ardsounds.de/sendung/tagesschau-in-100-sekunden/urn:ard:show:57f3739f7a877e6c/",
    how: "100초. 한 번 듣고 뉴스가 몇 개였는지·무엇이었는지 → 다시 듣고 확인.",
  },
};

// 요일(1=월 … 6=토) → 출처. 일요일은 쉬는 날이라 없다(원하면 아무거나).
const EASY_MONTHS = { 1: "leicht", 2: "dw", 3: "easy", 4: "leicht", 5: "dw", 6: "easy" };
const LATER_MONTHS = { 1: "tagesschau", 2: "dw", 3: "easy", 4: "leicht", 5: "tagesschau", 6: "easy" };

export const defaultRotation = (month) => (month <= 2 ? EASY_MONTHS : LATER_MONTHS);

/**
 * 오늘 들을 곳. settings.listen = { custom: { name, url }, rotation: { 요일: 출처id | "custom" } }
 * 사용자가 설정에서 요일별로 바꾼 것이 기본 순환표를 이긴다.
 */
export function listenFor(wd, month, settings) {
  const listen = settings?.listen || {};
  const base = defaultRotation(month)[wd];
  const id = listen.rotation?.[wd] || base;
  if (id === "custom" && listen.custom?.url) {
    return { id, name: listen.custom.name || "내 링크", by: "직접 넣은 곳", url: listen.custom.url, how: "자막 없이 한 번 → 자막 켜고 한 번." };
  }
  // 없는 출처·지워진 내 링크는 그 요일의 기본으로 되돌린다 (일요일은 기본이 없다)
  const pick = SOURCES[id] ? id : base;
  return SOURCES[pick] ? { id: pick, ...SOURCES[pick] } : null;
}

export const DOW_SHORT = ["일", "월", "화", "수", "목", "금", "토"];

/** 주소처럼 보이는지 — 설정에서 "내 링크"를 받을 때 */
export const looksLikeUrl = (s) => /^https?:\/\/\S+\.\S+/.test((s || "").trim());
