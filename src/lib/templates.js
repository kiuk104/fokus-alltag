// 형식별 입력 칸 — 기록 화면이 이 표를 읽어 칸을 그린다(데이터만 두고 화면 코드는 모른다).
//
// 칸 하나 = { key, label, hint, placeholder, rows, carry?, optional? }
//   carry: 앞 칸의 글을 가져와 이어 쓰는 버튼을 단다 (3단계 확장 — 문장을 "늘리는" 연습이라서)
//   optional: [건너뛰기] 를 단다. 건너뛴 칸은 parts.skip[key] = true — 글이 남아 있어도 교정에 안 보낸다
//             (다시 켜면 쓰던 글이 그대로 돌아온다)
// 저장은 alltag_entries.parts 에 { 칸 key: 글 } 로 들어간다. 칸 key 를 바꾸면 옛 기록이 안 보이니
// 이름만 바꾸고 key 는 그대로 둘 것.

import { WEEKDAY_TASKS } from "./program.js";

const EXPAND3 = [
  { key: "l1", label: "Level 1", hint: "있었던 일을 짧게 한 문장.", placeholder: "Heute hatte ich eine schwierige Lieferung.", rows: 2 },
  { key: "l2", label: "Level 2", hint: "이유·조건을 붙인다 — weil · obwohl · dass · wenn", placeholder: "…, weil es keinen Parkplatz gab.", rows: 2, carry: "l1", optional: true },
  { key: "l3", label: "Level 3", hint: "구체화 — 어디서 · 언제 · 어떤 (형용사·장소·시간)", placeholder: "…, weil es vor dem Gebäude keinen geeigneten Parkplatz gab.", rows: 3, carry: "l2", optional: true },
];

const WHY = [
  { key: "q", label: "질문", hint: "누군가 이렇게 물었다. 🎲 로 바꾸거나 오늘 실제로 들은 질문을 쓴다.", rows: 1, question: true },
  { key: "b1", label: "B1 답", hint: "짧게. 핵심만.", placeholder: "Wegen des Verkehrs.", rows: 2 },
  { key: "b2", label: "B2 답", hint: "완전한 문장 + 이유 (weil · da · deshalb)", placeholder: "Ich bin heute etwas später gekommen, weil …", rows: 3, carry: "b1" },
  { key: "b2p", label: "B2+ 답", hint: "하나 더 — Außerdem · Dazu kam, dass · Hinzu kommt …", placeholder: "… Außerdem musste ich länger nach einem Parkplatz suchen.", rows: 3, carry: "b2" },
];

const PROBLEM4 = [
  { key: "passiert", label: "Was ist passiert?", hint: "상황", placeholder: "Die Lieferung hat sich verzögert.", rows: 2 },
  { key: "warum", label: "Warum?", hint: "원인 — weil · da · aufgrund", placeholder: "Vor dem Gebäude gab es keinen geeigneten Parkplatz.", rows: 2 },
  { key: "folge", label: "Folge", hint: "결과 — dadurch · deshalb · sodass", placeholder: "Dadurch hat sich die Lieferzeit verlängert.", rows: 2 },
  { key: "verbesserung", label: "Verbesserung", hint: "해결책 — Man könnte … · Ich würde vorschlagen, …", placeholder: "Vielleicht könnte man die Reihenfolge der Lieferungen optimieren.", rows: 3 },
];

const WEEKDAY_FIELDS = {
  arbeit: [
    { key: "text", label: "업무 상황 설명", hint: "오늘 배송을 순서대로 — zuerst · danach · am Ende", placeholder: "Heute habe ich zuerst …", rows: 6 },
  ],
  news: [
    { key: "quelle", label: "무슨 뉴스?", hint: "제목이나 한 줄 (Tagesschau · Nachrichtenleicht …)", rows: 1 },
    { key: "text", label: "요약", hint: "3~5문장. Es geht um … · Laut … · Das bedeutet, dass …", rows: 5 },
  ],
  meinung: [
    { key: "thema", label: "주제", hint: "무엇에 대한 의견?", rows: 1 },
    { key: "text", label: "내 의견", hint: "Meiner Meinung nach … — 이유 두 개 + Ein möglicher Grund dafür ist …", rows: 5 },
  ],
  email: [
    { key: "betreff", label: "Betreff", hint: "메일 제목", rows: 1 },
    { key: "text", label: "본문", hint: "150~200단어. Sehr geehrte … / ich möchte mich wegen … melden.", rows: 10, words: [150, 200] },
  ],
  problem: PROBLEM4,
  frei: [
    { key: "text", label: "자유 말하기", hint: "주제 없이 5~10분. 🎤 를 켜고 멈추지 않는 것이 목표 — 고치는 건 나중에.", rows: 8 },
  ],
  rest: [
    { key: "text", label: "쉬는 날 (선택)", hint: "하고 싶으면 아무 이야기나.", rows: 4 },
  ],
};

// "왜?" 형식의 질문 — REWE 배송 일상에서 실제로 들을 법한 것들
export const WHY_QUESTIONS = [
  "Warum bist du heute später gekommen?",
  "Warum hat die Lieferung so lange gedauert?",
  "Warum konntest du den Kunden nicht erreichen?",
  "Warum ist die Kiste beschädigt?",
  "Warum fehlt ein Artikel in der Bestellung?",
  "Warum hast du nicht vor dem Haus geparkt?",
  "Warum musstest du zweimal zum Kunden fahren?",
  "Warum war die Tour heute so anstrengend?",
  "Warum hast du die Zentrale angerufen?",
  "Warum ist die Kühlware zu warm angekommen?",
  "Warum hast du die Reihenfolge der Stopps geändert?",
  "Warum war der Kunde unzufrieden?",
  "Warum hast du heute eine Pause ausgelassen?",
  "Warum bist du mit dem Scanner nicht klargekommen?",
  "Warum brauchst du mehr Zeit für diese Tour?",
  "Warum sollte man die Touren anders planen?",
  "Warum lernst du eigentlich Deutsch so intensiv?",
  "Warum magst du deine Arbeit (oder nicht)?",
];

export const randomQuestion = (except) => {
  const pool = WHY_QUESTIONS.filter((q) => q !== except);
  return pool[Math.floor(Math.random() * pool.length)];
};

/** 형식(+요일) → { title, hint, fields } */
export function formFor(tplKey, wd) {
  if (tplKey === "expand3") return { title: "3단계 확장", hint: "한 문장을 세 번 늘린다.", fields: EXPAND3 };
  if (tplKey === "why") return { title: "\"왜?\"에 답하기", hint: "B1 → B2 → B2+ 로 답을 키운다.", fields: WHY };
  if (tplKey === "problem4") return { title: "문제 해결 4칸", hint: "상황 → 원인 → 결과 → 해결책.", fields: PROBLEM4 };
  const task = WEEKDAY_TASKS[wd];
  if (!task) return { title: "휴식", hint: "일요일은 쉬어도 연속이 끊기지 않아요.", fields: WEEKDAY_FIELDS.rest, sub: "rest" };
  return { title: task.title, hint: task.hint, fields: WEEKDAY_FIELDS[task.key], sub: task.key };
}

/** 기록 화면 위 형식 바꾸기 칩 */
export const SWITCHABLE = [
  { key: "expand3", label: "3단계 확장" },
  { key: "why", label: "왜?" },
  { key: "problem4", label: "문제 4칸" },
  { key: "weekday", label: "요일 루틴" },
];

/** 칸 → 교정에 보낼 글 한 편. 칸 이름을 붙여야 AI가 "Level 2 가 Level 1 을 늘린 것"임을 안다. */
export const isSkipped = (parts, key) => !!parts?.skip?.[key];

/** 이어 쓸 앞 칸의 글 — 앞 칸을 건너뛰었으면 그 앞 칸으로 (Level 2 를 건너뛰면 Level 3 은 Level 1 을 가져온다) */
export function carryText(form, parts, field) {
  let key = field.carry;
  while (key && isSkipped(parts, key)) key = form.fields.find((f) => f.key === key)?.carry;
  return key ? parts[key] || "" : "";
}

export function composeText(form, parts) {
  return form.fields
    .filter((f) => !isSkipped(parts, f.key))
    .map((f) => [f.label, (parts[f.key] || "").trim()])
    .filter(([, t]) => t)
    .map(([label, t]) => `[${label}] ${t}`)
    .join("\n");
}

export const hasContent = (form, parts) =>
  form.fields.some((f) => !f.question && !isSkipped(parts, f.key) && (parts[f.key] || "").trim());

export const wordCount = (t) => (t || "").trim().split(/\s+/).filter(Boolean).length;
