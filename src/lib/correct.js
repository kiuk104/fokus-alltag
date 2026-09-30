// 교정 요청문 만들기 · AI 응답 해석 — 순수 함수만 (테스트: correct.test.mjs).
//
// 응답은 JSON 하나로 받아 두고, 화면이 단계별로 나눠 연다(기획서 0-2절 · 3절):
//   1 스스로 고치기  fixes 의 from · type · hint 만 보인다 (정답 to 는 아직)
//   2 B1 공개       b1.text + fixes 의 to · why
//   3 B2 · 원어민
//   4 자기 설명      grammar[0] 을 내 말로 설명 → explainPrompt 로 확인(Haiku)
//   5 외울 3문장     keep → Fokus DE user_sentences
// 한국어로 쓴 날(korean)은 1단계 대신 keywords(독일어 핵심 단어 5개)를 먼저 보여 주고, 내가 독일어로 말해 본다.

import { GRAMMAR } from "./program.js";

const GRAMMAR_KEYS = GRAMMAR.map((g) => g.key);
const DEFAULT_CATEGORY = "Berufs- und Arbeitsleben";

// DE 문장 카테고리(34 챕터) 중 이 앱에서 나올 법한 것만 AI 에게 보여 준다 — 전부 주면 엉뚱한 데 넣는다.
export const CATEGORIES = [
  "Berufs- und Arbeitsleben", "Verkehr", "Einkaufen", "Essen", "Wohnen", "Soziale Beziehungen",
  "Gespräche I", "Charakter und Gefühle", "Alltägliche Tätigkeiten", "Zeit", "Orientierung im Raum",
  "Staat und Politik", "Wirtschaft und Finanzen", "Medien und Kommunikationsmittel", "Klima",
  "Krankheit und medizinische Versorgung", "Freizeit",
];

export const SYSTEM =
  "Du bist ein geduldiger Deutschlehrer für einen koreanischen Erwachsenen (Niveau B1, Ziel B2), " +
  "der als Lieferfahrer bei REWE in Deutschland arbeitet. Erklärungen schreibst du auf Koreanisch, " +
  "Beispiele und Korrekturen auf Deutsch. Antworte ausschließlich mit einem JSON-Objekt, ohne Markdown.";

/** 교정 요청문 */
export function correctionPrompt({ text, month, tplTitle, korean }) {
  const grammarList = GRAMMAR.map((g) => `${g.key} (${g.label})`).join(", ");
  const common = `
- "grammar": 이 글에서 연습하기 좋은 B2 문법 1~2개. key 는 반드시 다음 중 하나: ${grammarList}. note 는 한국어 한 줄.
- "keep": 오늘 외울 문장 정확히 3개. 학습자의 실제 상황에서 나온 자연스러운 B2 문장. 각각
  { "de": 독일어 문장, "ko": 자연스러운 한국어 뜻, "grammar": 위 key 중 하나 또는 "", "topic": 독일어 주제 명사 한 단어(예: Parkplatz, Lieferung, Kunde),
    "category": 다음 중 하나 — ${CATEGORIES.join(" | ")} }
- "words": b1·b2·keep 에 나온 단어 중 B1 학습자가 **새로 배울 만한** 단어 최대 5개 (기본 단어·고유명사 제외). 각각
  { "de": 관사 없는 기본형(명사는 단수 1격, 동사는 부정형), "article": 명사면 "der"|"die"|"das", 아니면 "",
    "ko": 한국어 뜻, "en": 영어 뜻 한두 단어, "level": "B1"|"B2" }. 없으면 [].
- "errorTypes": 틀린 유형 이름 (독일어 한두 단어: Artikel, Verbstellung, Präposition, Kasus, Wortwahl, Rechtschreibung, Zeitform …). 없으면 [].`;

  if (korean) {
    return `학습자가 오늘 REWE 배송 중 있었던 일을 **한국어로** 적었다 (지친 날). ${month}개월차 · 형식: ${tplTitle}.
학습자는 이것을 먼저 스스로 독일어로 말해 볼 것이다. 아래 JSON 으로 답하라:
- "keywords": 이 내용을 독일어로 말할 때 필요한 핵심 단어 5개 [{ "de": 관사 포함 독일어, "ko": 뜻 }]. 문장은 쓰지 말 것.
- "b1": { "text": 이 내용을 자연스러운 B1 독일어로, "fixes": [] }
- "b2": 같은 내용을 B2 수준으로 (weil/obwohl/Passiv/Konjunktiv II 등을 자연스럽게) — **문자열 하나**
- "native": 독일 동료가 실제로 말할 법한 구어체 버전 — **문자열 하나**${common}

학습자의 글:
${text}`;
  }

  return `학습자가 오늘 REWE 배송 중 있었던 일을 독일어로 썼다. ${month}개월차 · 형식: ${tplTitle}.
학습자는 틀린 곳을 **먼저 스스로 고쳐 볼 것**이다. 아래 JSON 으로 답하라:
- "b1": { "text": 학습자의 글을 뜻은 그대로 두고 자연스러운 B1 독일어로 고친 글 (칸 이름 [ … ] 은 빼고 이어서),
          "fixes": 틀린 곳마다 { "from": 학습자 글에 **그대로 있는** 틀린 부분(1~4단어), "to": 고친 표현,
                    "type": 틀린 유형(독일어 한두 단어), "hint": 한국어 힌트 — **정답 단어를 절대 쓰지 말 것** (예: "명사의 성을 다시 봐요", "종속절 동사 위치"),
                    "why": 한국어로 이유 한 줄 } — 최대 6개, 중요한 것부터. 틀린 곳이 없으면 [] }
- "b2": 같은 내용을 B2 수준으로 한 단계 올린 글 — **문자열 하나** (b1 처럼 객체로 감싸지 말 것)
- "native": 독일 동료가 실제로 말할 법한 자연스러운 구어체 버전 — **문자열 하나**${common}

학습자의 글:
${text}`;
}

/** 자기 설명 확인 요청문 (짧게 — Haiku) */
export function explainPrompt({ grammarLabel, sentence, mine }) {
  return `학습자가 아래 독일어 문장의 문법을 자기 말로 설명했다. 맞는지 확인하라.
문법: ${grammarLabel}
문장: ${sentence}
학습자의 설명: ${mine}

JSON 으로만: { "ok": 설명의 핵심이 맞으면 true, "add": 한국어 한두 문장 — 맞으면 짧게 칭찬 + 덧붙일 점, 틀리면 부드럽게 바로잡기 }`;
}

/** B2 · 원어민 글만 따로 받기 — 교정 응답에서 이 둘이 비어 왔을 때 (짧게) */
export function levelUpPrompt({ b1 }) {
  return `아래는 학습자가 REWE 배송 중 있었던 일을 쓴 B1 독일어 글이다.
${b1}

JSON 으로만: { "b2": 같은 내용을 B2 수준으로 한 단계 올린 글(weil/obwohl/Passiv/Konjunktiv II 등을 자연스럽게) — 문자열,
              "native": 독일 동료가 실제로 말할 법한 자연스러운 구어체 버전 — 문자열 }`;
}

// ── 응답 해석 ───────────────────────────────────────────────────────────────

/** 글 속 첫 JSON 객체를 꺼낸다 (```json 울타리 · 앞뒤 말이 붙어 와도) */
export function extractJson(text) {
  const s = String(text || "");
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  // 울타리가 닫히지 않았으면(응답이 잘림) 여는 울타리만 떼고 본다
  const body = fenced ? fenced[1] : s.replace(/^[\s\S]*?```(?:json)?\s*/, "");
  const i = body.indexOf("{");
  const j = body.lastIndexOf("}");
  if (i < 0 || j <= i) throw new Error("AI 응답에서 JSON 을 찾지 못했어요");
  return JSON.parse(body.slice(i, j + 1));
}

const str = (v) => (typeof v === "string" ? v.trim() : "");
const arr = (v) => (Array.isArray(v) ? v : []);
// 글 칸은 AI 가 가끔 { text } 객체나 배열로 감싸 보낸다 — 어떤 모양이든 글만 꺼낸다
export const textOf = (v) => {
  if (typeof v === "string") return v.trim();
  if (Array.isArray(v)) return v.map(textOf).filter(Boolean).join(" ");
  if (v && typeof v === "object") return textOf(v.text ?? v.de ?? v.satz ?? v.german ?? "");
  return "";
};
const pick = (raw, ...keys) => {
  for (const k of keys) {
    const t = textOf(raw?.[k]);
    if (t) return t;
  }
  return "";
};

/** B2 · 원어민 응답 */
export function normalizeLevelUp(raw) {
  return { b2: pick(raw, "b2", "B2", "b2Text", "b2_text"), native: pick(raw, "native", "Native", "nativ", "colloquial") };
}

/** 교정 응답 → 화면이 믿고 쓸 수 있는 모양. 빠진 칸은 빈 값으로 채운다. */
export function normalizeCorrection(raw, { text = "" } = {}) {
  const b1 = raw?.b1 || {};
  const fixes = arr(b1.fixes)
    .map((f) => ({ from: str(f?.from), to: str(f?.to), type: str(f?.type), hint: str(f?.hint), why: str(f?.why) }))
    .filter((f) => f.from && f.to && f.from !== f.to)
    // hint 에 정답이 새어 들어왔으면 hint 를 유형만으로 줄인다 (스스로 고치기가 의미 없어지므로)
    .map((f) => (f.hint && f.to.length > 2 && f.hint.toLowerCase().includes(f.to.toLowerCase()) ? { ...f, hint: "" } : f))
    .slice(0, 6);
  const grammar = arr(raw?.grammar)
    .map((g) => ({ key: GRAMMAR_KEYS.includes(str(g?.key)) ? str(g.key) : "", note: str(g?.note) }))
    .filter((g) => g.key)
    .slice(0, 2);
  const keep = arr(raw?.keep)
    .map((k) => ({
      de: str(k?.de),
      ko: str(k?.ko),
      grammar: GRAMMAR_KEYS.includes(str(k?.grammar)) ? str(k.grammar) : "",
      topic: str(k?.topic).replace(/\s+/g, "").slice(0, 30),
      category: CATEGORIES.includes(str(k?.category)) ? str(k.category) : DEFAULT_CATEGORY,
    }))
    .filter((k) => k.de)
    .slice(0, 3);
  return {
    b1: { text: textOf(b1.text ?? (typeof raw?.b1 === "string" ? raw.b1 : "")), fixes: fixes.map((f) => ({ ...f, found: !!text && text.includes(f.from) })) },
    ...normalizeLevelUp(raw),
    grammar,
    keep,
    keywords: arr(raw?.keywords).map((w) => ({ de: str(w?.de), ko: str(w?.ko) })).filter((w) => w.de).slice(0, 6),
    words: normalizeWords(raw?.words),
    errorTypes: arr(raw?.errorTypes).map(str).filter(Boolean).slice(0, 6),
  };
}

/**
 * 원문 → 조각들. 고칠 곳(fix.from)이 나오는 자리를 표시한다(처음 나온 곳 하나씩).
 * [{ t, fix: 번호 | undefined }]
 */
export function markFixes(text, fixes) {
  const s = String(text || "");
  const spots = [];
  fixes.forEach((f, n) => {
    if (!f.from) return;
    let from = 0;
    for (;;) {
      const i = s.indexOf(f.from, from);
      if (i < 0) return;
      const j = i + f.from.length;
      if (!spots.some((p) => i < p.j && j > p.i)) return spots.push({ i, j, n });
      from = i + 1;
    }
  });
  spots.sort((a, b) => a.i - b.i);
  const out = [];
  let at = 0;
  for (const p of spots) {
    if (p.i > at) out.push({ t: s.slice(at, p.i) });
    out.push({ t: s.slice(p.i, p.j), fix: p.n });
    at = p.j;
  }
  if (at < s.length) out.push({ t: s.slice(at) });
  return out;
}

/** 내가 고친 글에 정답(to)이 들어가고 틀린 부분(from)이 사라졌으면 "스스로 고침" */
export function selfFixed(mine, fix) {
  const m = String(mine || "").toLowerCase();
  const to = fix.to.toLowerCase();
  const from = fix.from.toLowerCase();
  if (!m) return false;
  return m.includes(to) && (to.includes(from) || !m.includes(from));
}

/** 새 단어 — 관사가 de 에 붙어 와도 떼어 article 로 옮긴다 */
export function normalizeWords(list) {
  const seen = new Set();
  return arr(list)
    .map((w) => {
      let de = str(w?.de).replace(/[.,;:!?]+$/, "");
      let article = ["der", "die", "das"].includes(str(w?.article).toLowerCase()) ? str(w.article).toLowerCase() : "";
      const m = /^(der|die|das)\s+(.+)$/i.exec(de);
      if (m) { article = article || m[1].toLowerCase(); de = m[2]; }
      return { de, article, ko: str(w?.ko), en: str(w?.en), level: ["A1", "A2", "B1", "B2", "C1"].includes(str(w?.level)) ? str(w.level) : "B2" };
    })
    .filter((w) => w.de && !w.de.includes(" ") && (w.ko || w.en) && !seen.has(w.de.toLowerCase()) && seen.add(w.de.toLowerCase()))
    .slice(0, 5);
}

/** 단어 비교 열쇠 — 소문자 · ß=ss · 관사 뗌 */
export const wordKey = (de) => String(de || "").toLowerCase().replace(/^(der|die|das)\s+/, "").replace(/ß/g, "ss").trim();

/** 자기 설명 응답 */
export function normalizeExplain(raw) {
  return { ok: raw?.ok === true, add: str(raw?.add) };
}
