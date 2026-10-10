// 프로필 "b2-arbeit" — 독일어를 배우는 성인 · 직장 생활 · B1→B2 6개월 (기획서 0-6절).
// 이 앱이 처음부터 해 온 방식 그대로다. 값이 없는 계정은 모두 이 프로필이다.
//
// 프로필은 **무엇을 가르치는가**만 모은다(형식 · 문법 목록 · AI 에게 줄 맥락 · 듣기 출처 · 보내는 곳).
// 화면 코드와 달력 계산은 여기 두지 않는다 — 표와 함수는 원래 파일(lib/)에 있고, 여기서는 가리키기만 한다.
// 새 프로필을 만들 때는 이 파일과 같은 칸을 채운다.

import { GRAMMAR, ROADMAP, PHASES, TEMPLATES, baseTemplate, mixFor } from "../lib/program.js";
import { formFor, SWITCHABLE } from "../lib/templates.js";
import { SOURCES, defaultRotation } from "../lib/listening.js";
import { NOTEBOOK, PROGRAM_TAG } from "../lib/tags.js";

export default {
  key: "b2-arbeit",
  name: "B1 → B2 · 직장 독일어",
  about: "내 하루를 독일어로 — REWE 배송 일상이 교재",

  // ── 언어 ──────────────────────────────────────────────────────────────────
  uiLang: "ko", // 화면 문구 (settings.uiLang 이 이긴다)
  explainLang: "ko", // 교정 설명(hint · why · note)
  cueLang: "ko", // 꺼내기 단서 — 한국어 뜻을 보고 독일어로 (settings.cueLang 이 이긴다)
  koreanInput: true, // 🇰🇷 한국어로 쓰는 날
  intentFirst: true, // 칸마다 한국어 의도를 먼저 적기

  // ── 교정 3단 — 응답 칸 이름(b1 · b2 · native)은 모든 프로필이 같고, 화면에 보이는 이름만 다르다 ──
  levels: { b1: "B1 교정", b2: "B2", native: "원어민" },

  // ── AI 에게 줄 맥락 (lib/correct.js 가 읽는다) ───────────────────────────────
  prompt: {
    system:
      "Du bist ein geduldiger Deutschlehrer für einen koreanischen Erwachsenen (Niveau B1, Ziel B2), " +
      "der als Lieferfahrer bei REWE in Deutschland arbeitet. Erklärungen schreibst du auf Koreanisch, " +
      "Beispiele und Korrekturen auf Deutsch. Antworte ausschließlich mit einem JSON-Objekt, ohne Markdown.",
    scene: "REWE 배송 중 있었던 일", // "학습자가 오늘 <scene>을 독일어로 썼다"
  },

  // ── 형식(템플릿) ───────────────────────────────────────────────────────────
  templates: {
    auto: true, // 개월 수로 자동 (수동으로 바꿀 수 있다)
    all: TEMPLATES,
    switchable: SWITCHABLE,
    base: baseTemplate, // (month) → 형식 키
    mix: mixFor, // (startDate, day) → 섞는 날의 지난 형식 | null
    form: formFor, // (형식 키, 요일) → { title, hint, fields }
  },

  // ── 진도 ──────────────────────────────────────────────────────────────────
  phases: PHASES,
  roadmap: ROADMAP,
  grammar: GRAMMAR, // "문법 8개"
  // DE 문장 카테고리(34 챕터) 중 이 프로필에서 나올 법한 것만 AI 에게 보여 준다 — 전부 주면 엉뚱한 데 넣는다.
  // 첫 번째가 기본값이다.
  categories: [
    "Berufs- und Arbeitsleben", "Verkehr", "Einkaufen", "Essen", "Wohnen", "Soziale Beziehungen",
    "Gespräche I", "Charakter und Gefühle", "Alltägliche Tätigkeiten", "Zeit", "Orientierung im Raum",
    "Staat und Politik", "Wirtschaft und Finanzen", "Medien und Kommunikationsmittel", "Klima",
    "Krankheit und medizinische Versorgung", "Freizeit",
  ],

  // ── 듣기 ──────────────────────────────────────────────────────────────────
  listening: { sources: SOURCES, rotation: defaultRotation },

  // ── Fokus DE · Karten 으로 보내기 ───────────────────────────────────────────
  de: { send: true, notebook: NOTEBOOK, programTag: PROGRAM_TAG },
};
