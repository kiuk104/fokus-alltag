// 6개월 프로그램의 달력 계산 — 순수 함수만 둔다(테스트: program.test.mjs).
//
// 기준은 시작일 하나다. "오늘이 몇 개월차인가", "어떤 템플릿으로 쓰는가",
// "연속 며칠째인가"는 전부 시작일과 오늘 날짜에서 계산한다 — 저장하지 않는다.
// 저장해 두면 시작일을 고쳤을 때 과거 값과 어긋난다.
//
// 날짜는 전부 기기 현지 날짜의 "YYYY-MM-DD" 문자열로 다룬다.
// Date 객체를 그대로 쓰면 UTC 자정 기준이라 밤 12시~새벽 2시(베를린) 사이에
// 어제 날짜로 기록된다. 배송 끝나고 늦게 쓰는 날이 바로 그 시간이다.

export const MONTH_DAYS = 30;
export const TOTAL_MONTHS = 6;
export const TOTAL_DAYS = MONTH_DAYS * TOTAL_MONTHS; // 180

/** Date → 현지 "YYYY-MM-DD" */
export function ymd(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// "YYYY-MM-DD" → 달력 일수. UTC 로 계산해야 서머타임 전환일(23·25시간)에 하루가 어긋나지 않는다.
const dayNum = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
};
const fromNum = (n) => new Date(n * 86400000).toISOString().slice(0, 10);

export const daysBetween = (a, b) => dayNum(b) - dayNum(a);
export const addDays = (s, n) => fromNum(dayNum(s) + n);
/** 0=일 … 6=토 */
export const weekday = (s) => new Date(dayNum(s) * 86400000).getUTCDay();

// ── 계획서의 6개월 ───────────────────────────────────────────────────────────

export const PHASES = [
  { no: 1, months: [1, 2], title: "B1을 단단하게", note: "처음부터 어려운 B2 문법으로 들어가지 않는다." },
  { no: 2, months: [3, 4], title: "B2 문장 구조", note: "핵심 문법 8개를 실제 문장에 넣는다." },
  { no: 3, months: [5], title: "독일어로 문제 해결", note: "상황 → 원인 → 결과 → 해결책을 1~2분." },
  { no: 4, months: [6], title: "B2 실전", note: "공부보다 실제 사용을 늘린다." },
];

export const ROADMAP = [
  { month: 1, goal: "B1 문장 안정화", focus: "어순 · 동사 · 전치사" },
  { month: 2, goal: "문장 길이 늘리기", focus: "weil · obwohl · dass" },
  { month: 3, goal: "B2 문법 시작", focus: "수동태 · 관계대명사 · Konjunktiv II" },
  { month: 4, goal: "설명 능력", focus: "원인 → 결과 → 해결" },
  { month: 5, goal: "직장 독일어", focus: "보고 · 문의 · 의견" },
  { month: 6, goal: "B2 실전", focus: "말하기 · 쓰기 · 듣기" },
];

// tag: Fokus DE 로 보내는 문장에 붙는 태그 — DE 태그는 독일어라 여기도 독일어로
export const GRAMMAR = [
  { key: "nebensatz", tag: "Nebensatz", label: "Nebensatz", ex: "weil · obwohl · während · nachdem · bevor" },
  { key: "konj2", tag: "Konjunktiv II", label: "Konjunktiv II", ex: "Ich würde vorschlagen, dass …" },
  { key: "passiv", tag: "Passiv", label: "Passiv", ex: "Die Lieferung wurde bereits abgeholt." },
  { key: "relativ", tag: "Relativsatz", label: "Relativsatz", ex: "Der Kunde, der im dritten Stock wohnt …" },
  { key: "zu", tag: "Infinitiv mit zu", label: "Infinitiv mit zu", ex: "Es ist schwierig, einen Parkplatz zu finden." },
  { key: "nominal", tag: "Nominalstil", label: "Partizip · Nominalstil", ex: "Aufgrund des starken Verkehrs …" },
  { key: "kausal", tag: "Kausal", label: "원인 · 결과", ex: "deshalb · dadurch · aufgrund · daher · sodass" },
  { key: "meinung", tag: "Meinung", label: "의견 · 주장", ex: "Meiner Meinung nach … / Ich bin der Ansicht, dass …" },
];

// 6개월차 요일 루틴. 일요일(0)은 매달 공통으로 휴식이다.
export const WEEKDAY_TASKS = {
  1: { key: "arbeit", title: "업무 상황 설명", hint: "오늘 배송에서 있었던 일을 순서대로." },
  2: { key: "news", title: "독일 뉴스 요약", hint: "뉴스 하나를 3~5문장으로." },
  3: { key: "meinung", title: "내 의견 말하기", hint: "Meiner Meinung nach … 로 시작해 이유 두 개." },
  4: { key: "email", title: "독일어 이메일", hint: "문의·보고 메일 150~200단어." },
  5: { key: "problem", title: "직장 문제 설명", hint: "상황 → 원인 → 결과 → 해결책." },
  6: { key: "frei", title: "자유 말하기 5~10분", hint: "주제 없이 길게 — 멈추지 않는 게 목표." },
};

export const TEMPLATES = {
  expand3: { title: "3단계 확장", hint: "한 문장을 Level 1 → 2(weil/obwohl…) → 3(구체화)로 늘린다." },
  why: { title: "\"왜?\"에 답하기", hint: "질문 하나에 B1 → B2 → B2+ 답을 차례로." },
  problem4: { title: "문제 해결 4칸", hint: "Was ist passiert? · Warum? · Folge · Verbesserung" },
  weekday: { title: "요일 루틴", hint: "" },
};

/**
 * 오늘이 프로그램의 어디쯤인지.
 * status: "before"(시작 전) | "running" | "done"(180일 지남)
 * dayNo: 1부터 시작하는 진행 일수(시작 전이면 0 이하), month: 1~6
 */
export function programState(startDate, today = ymd()) {
  const diff = daysBetween(startDate, today); // 시작일 당일 = 0
  if (diff < 0) {
    return { status: "before", dayNo: diff + 1, daysLeft: -diff, month: 1, phase: PHASES[0], sunday: weekday(today) === 0 };
  }
  const done = diff >= TOTAL_DAYS;
  const month = done ? TOTAL_MONTHS : Math.floor(diff / MONTH_DAYS) + 1;
  return {
    status: done ? "done" : "running",
    dayNo: diff + 1,
    month,
    dayInMonth: done ? MONTH_DAYS : (diff % MONTH_DAYS) + 1,
    phase: PHASES.find((p) => p.months.includes(month)),
    sunday: weekday(today) === 0,
  };
}

/** 그 달의 기본 형식 (섞기 전) */
export function baseTemplate(month) {
  if (month <= 2) return "expand3";
  if (month <= 4) return "why";
  if (month === 5) return "problem4";
  return "weekday";
}

/**
 * 섞는 날(교차 연습, 기획서 0-2절)이면 그날 쓸 지난 형식, 아니면 null.
 *   1~2개월 — 기초라 섞지 않는다
 *   3~4개월 — 월·목에 3단계 확장
 *   5개월   — 화·금에 3단계 확장 / "왜?" 중 하나 (날짜로 정해서 다시 열어도 같은 형식)
 *   6개월   — 요일 루틴 자체가 교차라 따로 섞지 않는다
 */
export function mixFor(startDate, day) {
  const { month, status } = programState(startDate, day);
  if (status === "before") return null;
  const wd = weekday(day);
  if (month === 3 || month === 4) return wd === 1 || wd === 4 ? "expand3" : null;
  if (month === 5) return wd === 2 || wd === 5 ? (dayNum(day) % 2 ? "why" : "expand3") : null;
  return null;
}

/** 그 날짜에 쓸 템플릿 키. 수동 지정(override)이 있으면 그것이 이긴다. */
export function templateFor(startDate, day, override) {
  if (override && TEMPLATES[override]) return override;
  const { month } = programState(startDate, day);
  return mixFor(startDate, day) || baseTemplate(month);
}

/** 하루가 "했다"로 치는가 — 말하기와 소리 내기, 둘이 핵심이다 (10분 모드와 같은 기준). */
export const dayCounts = (row) => !!(row && row.speak && row.repeat);
/** 네 칸을 다 채웠는가 */
export const dayFull = (row) => !!(row && row.listen && row.speak && row.correct && row.repeat);

/**
 * 연속 일수. 일요일과 시작일 이전은 건너뛴다(끊지도 세지도 않는다).
 * 오늘을 아직 안 했으면 어제까지로 센다 — 저녁에 열었는데 0일로 보이면 맥이 빠진다.
 * rows: alltag_days 행 배열 또는 Map(day → row)
 */
export function streak(rows, startDate, today = ymd()) {
  const map = rows instanceof Map ? rows : new Map((rows || []).map((r) => [r.day, r]));
  let d = today;
  if (!dayCounts(map.get(d))) d = addDays(d, -1);
  let n = 0;
  for (let guard = 0; guard < 400; guard++) {
    if (daysBetween(startDate, d) < 0) break;
    if (weekday(d) === 0 && !dayCounts(map.get(d))) { d = addDays(d, -1); continue; }
    if (!dayCounts(map.get(d))) break;
    n++;
    d = addDays(d, -1);
  }
  return n;
}
