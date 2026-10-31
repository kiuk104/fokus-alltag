// 🎙 실시간 대화 — 순수 함수만 (테스트: talk.test.mjs). 화면은 screens/Talk.jsx, 연결은 lib/realtime.js.
//
// 기획: 「Fokus Alltag 실시간 말하기 교정 기능 기획」(2026-10-31) · 기획서 0-7절.
//   대화 중에는 흐름을 끊지 않는다 → 대화가 끝나면 Claude 가 대화록을 훑어
//   (1) 틀린 문장 + 교정 + 한국어 설명 (2) 한국어로 막힌 곳 + 독일어 표현 (3) 새로 배운 표현 만 추린다.
//   고른 것만 저장 — 틀린 곳은 오답 노트로, 문장은 Fokus DE(→ Karten)로.
//
// 음성은 OpenAI Realtime(WebRTC). 내 말은 따로 받아쓰기(transcription) 해서 화면에 그대로 보여 준다 —
// 대화 모델이 알아서 고쳐 들은 문장이 아니라 "인식된 그대로"를 봐야 틀린 곳을 알 수 있다.

// ── 대화 주제 ────────────────────────────────────────────────────────────────
// scene: AI 에게 줄 상황 (독일어). first: AI 가 먼저 꺼낼 말의 방향.
export const TOPICS = [
  {
    key: "tag", icon: "☀", label: "오늘 하루",
    scene: "Ihr unterhaltet euch locker über den Tag des Lernenden (Arbeit, Familie, Pläne).",
    first: "Frag freundlich, wie sein Tag heute war.",
  },
  {
    key: "kunde", icon: "📦", label: "배송 · 손님",
    scene:
      "Rollenspiel: Du bist eine Kundin / ein Kunde, der Lernende liefert dir als REWE-Fahrer Lebensmittel. " +
      "Es gibt kleine Probleme (fehlender Artikel, falsches Stockwerk, Pfand, Nachbar soll das Paket annehmen …).",
    first: "Öffne die Tür als Kundin und sag etwas, worauf er reagieren muss.",
  },
  {
    key: "kollege", icon: "🚚", label: "동료 · 상사",
    scene:
      "Rollenspiel: Du bist Schichtleiter/in im REWE-Lieferlager. Ihr sprecht über Touren, Verspätungen, " +
      "Probleme mit dem Fahrzeug, Urlaub und Schichtplan.",
    first: "Sprich ihn am Anfang der Schicht an.",
  },
  {
    key: "termin", icon: "📞", label: "전화 · 예약",
    scene:
      "Rollenspiel am Telefon: Du arbeitest in einer Arztpraxis, Werkstatt oder bei einer Behörde. " +
      "Der Lernende will einen Termin machen, etwas verschieben oder etwas klären.",
    first: "Meld dich am Telefon mit dem Namen der Praxis/Werkstatt.",
  },
  {
    key: "frei", icon: "💬", label: "자유 주제",
    scene: "Freies Gespräch. Der Lernende bestimmt das Thema.",
    first: "Frag ihn, worüber er heute sprechen möchte.",
  },
  {
    // 🗣 발음 연습 (2026-10-31) — 대화가 아니라 코칭. 지시문은 coachRules 가 통째로 바꾼다
    key: "aussprache", icon: "🗣", label: "발음 연습", coach: true,
    scene: "Aussprachetraining. Du bist ein geduldiger Aussprache-Coach.",
    first: "Begrüße ihn ganz kurz und sprich den ersten Übungssatz vor.",
  },
];
export const topicOf = (key) => TOPICS.find((t) => t.key === key) || TOPICS[0];

/** 한 번 대화의 길이 상한(분) — 넘으면 저절로 끝낸다. 돈이 새지 않게 + 하루 20분 프로그램 */
export const TALK_MAX_MIN = 10;
/** 끝내기 1분 전에 알린다 */
export const TALK_WARN_MIN = TALK_MAX_MIN - 1;

/** 교정 방식 — 대화 중에 끊고 고쳐 줄까 */
export const STYLES = [
  { key: "flow", label: "흐름 유지", desc: "끝나고 한꺼번에 정리" },
  { key: "teacher", label: "선생님", desc: "틀리면 바로 끊고 확인" },
];

/**
 * AI 목소리 — OpenAI Realtime 기본 목소리 중 독일어가 자연스러운 것. 세션을 열 때 정해지고 대화 중에는 못 바꾼다.
 * 서버(api/talk-token.js VOICE_OK)도 같은 목록만 받는다.
 */
export const VOICES = [
  { key: "marin", label: "Marin", desc: "여성 · 차분" },
  { key: "coral", label: "Coral", desc: "여성 · 밝음" },
  { key: "sage", label: "Sage", desc: "여성 · 부드러움" },
  { key: "cedar", label: "Cedar", desc: "남성 · 차분" },
  { key: "ash", label: "Ash", desc: "남성 · 또렷" },
  { key: "verse", label: "Verse", desc: "남성 · 표현 풍부" },
];

/** 말투 — 지시문에 한 줄로 들어간다 */
export const TONES = [
  { key: "freundlich", label: "친근하게", rule: "Sprich warm, locker und freundlich, wie ein netter Bekannter (duzen ist okay, außer im Rollenspiel passt Siezen)." },
  { key: "ruhig", label: "차분하게", rule: "Sprich ruhig, geduldig und etwas langsamer, mit klaren Pausen zwischen den Sätzen." },
  { key: "lebhaft", label: "활기차게", rule: "Sprich lebhaft, fröhlich und energisch, mit viel Ausdruck in der Stimme." },
  { key: "sachlich", label: "사무적으로", rule: "Sprich höflich, sachlich und knapp, wie im Berufsalltag (Siezen), ohne viel Smalltalk." },
];
export const toneOf = (key) => TONES.find((t) => t.key === key) || TONES[0];

/** 말 빠르기 — audio.output.speed */
export const SPEEDS = [
  { key: "slow", label: "천천히", value: 0.85 },
  { key: "normal", label: "보통", value: 1 },
];

/**
 * 🚗 운전 모드 (2026-10-31) — 손대지 않고 쓰는 설정을 한 번에. 저장된 설정(fa-talk-pref)은 건드리지 않고 그 대화에만 덮어쓴다.
 * 자동 차례(누르고 말하기는 화면을 눌러야 해서 안 됨) · 거치대 · 흐름 유지(선생님은 머리를 더 쓴다) · 차분하게 · 천천히.
 * StVO §23(1a): 운전 중 폰을 들거나 만지면 안 된다 — 거치대 + 음성만.
 */
export const DRIVE = { mode: "auto", noise: "far", style: "flow", tone: "ruhig", speed: "slow" };
export const DRIVE_RULE =
  "WICHTIG: Der Lernende fährt gerade Auto (Lieferfahrt). Halte jede Antwort besonders kurz (1–2 einfache Sätze) und stelle einfache Fragen. " +
  "Keine Listen, keine langen Erklärungen, keine Zahlenreihen. Wenn er nicht antwortet, warte still – er muss sich vielleicht auf den Verkehr konzentrieren. " +
  "Frag nicht nach, warum er schweigt.";

/**
 * 10분이 지나 이어서 할 때 — 앞 대화 끝부분을 새 세션 지시문에 붙인다(새 세션은 앞 대화를 모른다).
 * 너무 길면 토큰이 매번 다시 들어가니 마지막 maxLines 줄만.
 */
export function continueRule(lines, maxLines = 12) {
  const tail = cleanLines(lines).slice(-maxLines);
  if (!tail.length) return "";
  return (
    "Das Gespräch läuft schon. Begrüße ihn NICHT neu und stell dich nicht vor – mach genau dort weiter, wo ihr aufgehört habt " +
    "(kurze Brücke wie „Wo waren wir? Ach ja …“ ist okay).\nBisheriges Gespräch (Ende):\n" + linesToText(tail)
  );
}

/** 인식 언어 — 내 말 받아쓰기 */
export const LANGS = [
  { key: "de", label: "독일어로 고정", desc: "인식이 정확" },
  { key: "mix", label: "한국어 섞기", desc: "막힌 단어를 한국어로" },
];

// 설명은 한국어 (2026-10-31) — 지시문이 독일어라 AI 가 설명까지 독일어로 하던 문제.
// 맨 앞과 맨 끝에 두 번, 한국어로도 적는다(Realtime 모델은 지시문의 언어를 따라가기 쉽다).
const LANG_RULE = [
  "SPRACHREGEL (sehr wichtig): Das Gespräch/Rollenspiel und alle Beispielsätze sind auf DEUTSCH. " +
    "ALLES, was du ERKLÄRST – Korrekturen, Grammatik, Aussprache-Tipps, Wortbedeutungen, Rückfragen wie „Meinst du …?“, Lob für eine Korrektur – sagst du auf KOREANISCH. " +
    "Den richtigen deutschen Satz sagst du dabei auf Deutsch, eingebettet in den koreanischen Satz.",
  "언어 규칙: 대화와 예문은 독일어로. 설명·교정·발음 팁·뜻 설명·“이 말 하려던 거예요?” 같은 확인은 반드시 한국어로 말한다. " +
    "예: „동사는 두 번째 자리에 와요. ‘Heute habe ich viel gearbeitet.’ 이렇게요. 한 번 따라 해 볼래요?“",
].join("\n");

// 흐름 유지 (기본) — 기획 문서 요구사항 5
const FLOW_RULES = [
  "- Unterbrich den Gesprächsfluss nicht mit Grammatikkorrekturen. Korrigiere während des Gesprächs nur, wenn du ihn wirklich nicht verstehst. " +
    "Du darfst einen Fehler höchstens beiläufig richtig wiederholen (Recast), ohne ihn zu erklären. Die Auswertung kommt nach dem Gespräch.",
];

// 선생님 모드 (2026-10-31 추가) — 틀리면 바로 끊고 "이렇게 말하는 게 맞아요? 이걸 말하려던 거예요?" 하고 확인
const TEACHER_RULES = [
  "- LEHRER-MODUS: Wenn er einen wichtigen Fehler macht (Verbstellung, Kasus, Artikel, Zeitform, Konjugation, falsches Wort) " +
    "oder du nicht sicher bist, was er meint, unterbrich freundlich, BEVOR du inhaltlich antwortest:",
  "  1. Frag auf Koreanisch nach, ob du ihn richtig verstanden hast, und sag den korrekten deutschen Satz langsam und deutlich. " +
    "Zum Beispiel: „혹시 이 말 하려던 거예요? — Ich habe die Pakete schon geliefert. 이렇게 말하는 게 맞아요.“",
  "  2. Erkläre in EINEM kurzen koreanischen Satz, was falsch war (z. B. „동사는 두 번째 자리에 와요“).",
  "  3. Bitte ihn, den richtigen Satz einmal laut nachzusprechen. Wenn er es (fast) richtig wiederholt, lobe kurz und mach mit dem Gespräch auf Deutsch weiter. " +
    "Wenn er sagt, dass er etwas anderes meinte, frag nach und gib dann den passenden Satz.",
  "- Pro Antwort höchstens EIN Fehler — der wichtigste. Kleine Fehler (Aussprache, ein Endungsfehler, der das Verständnis nicht stört) ignorierst du.",
  "- Wenn ein Satz richtig war, korrigiere nicht und antworte ganz normal.",
  "- Wenn du ihn nicht verstehst oder es klingt, als hätte er Koreanisch statt Deutsch gesprochen, frag auf Koreanisch nach " +
    "(„잘 못 알아들었어요. 독일어로 한 번 더 말해 줄래요?“) oder rate, was er meinte, und frag, ob das stimmt.",
];

// 한국어 화자가 독일어에서 자주 틀리는 소리 — 코치가 무엇을 들어야 하는지
const KOREAN_PITFALLS =
  "Typische Probleme koreanischer Sprecher, auf die du besonders hörst: " +
  "ü/ö (Lippen runden, nicht „이/에“), ä vs. e, lange vs. kurze Vokale (Staat/Stadt), " +
  "ich-Laut [ç] vs. ach-Laut [x] vs. „sch“, r (Zäpfchen-R) vs. l, vokalisiertes -er am Ende („Fahrer“ → [ˈfaːʁɐ]), " +
  "f vs. p, w [v] vs. b, z [ts] vs. s, Auslautverhärtung (Rad → [t]), " +
  "eingeschobene Vokale in Konsonantengruppen („Strasse“ nicht „스트라세“ mit 으), Wortakzent (meist erste Silbe).";

/** 발음 연습 지시문 — sentences: 연습할 문장(없으면 AI 가 고른다) */
function coachRules(sentences) {
  const list = (sentences || []).map((s) => String(s || "").trim()).filter(Boolean).slice(0, 10);
  return [
    "- Ablauf pro Satz: (1) Sprich den Satz langsam und deutlich vor. (2) Er spricht nach. " +
      "(3) Hör genau auf seine AUSSPRACHE (nicht auf Grammatik). Wenn alles gut verständlich war: kurz loben und zum nächsten Satz. " +
      "(4) Sonst: nenne höchstens ZWEI konkrete Wörter/Laute, die anders klangen. Erkläre auf KOREANISCH in einem Satz, wie man den Laut bildet " +
      "(Mund-, Lippen-, Zungenstellung, z. B. „ü는 입술을 ‘우’처럼 동그랗게 하고 ‘이’ 소리를 내요“), sprich nur das Wort zwei Mal langsam vor und lass ihn das Wort, dann den ganzen Satz wiederholen.",
    "- Pro Satz höchstens drei Versuche, dann weiter – auch wenn es noch nicht perfekt ist. Sei ehrlich: lobe nicht, was falsch klang.",
    `- ${KOREAN_PITFALLS}`,
    "- Bewerte keinen Akzent an sich – Ziel ist, dass ein Deutscher ihn mühelos versteht.",
    "- Wenn er auf Koreanisch fragt, antworte kurz auf Koreanisch.",
    list.length
      ? `- Übe diese Sätze in dieser Reihenfolge (seine eigenen Lernsätze):\n${list.map((s, i) => `  ${i + 1}. ${s}`).join("\n")}\n  Danach eigene kurze Alltagssätze aus der Lieferarbeit mit denselben schwierigen Lauten.`
      : "- Wähle selbst kurze Alltagssätze aus der Lieferarbeit (Klingel, Treppe, Pfand, Unterschrift …), die schwierige Laute enthalten. Steigere langsam die Länge.",
  ];
}

// 일반 대화 중 "발음도 교정" (2026-10-31)
const PRON_RULE =
  "- Achte auch auf die AUSSPRACHE. Wenn ein Wort so ausgesprochen wird, dass man es schwer versteht, oder typisch falsch klingt, " +
  "sprich das Wort kurz richtig und langsam vor, gib einen koreanischen Ein-Satz-Tipp zur Mundstellung und lass ihn es einmal nachsprechen – danach normal weiter. " +
  "Höchstens ein Aussprache-Hinweis pro Antwort. " + KOREAN_PITFALLS;

/**
 * Realtime 모델에게 줄 지시문. 서버(api/talk-token.js)가 그대로 세션에 넣는다.
 * 요구사항 1·3·5: 한국인 학습자 · 한국어 섞어 말해도 됨 · 대화 중엔 흐름 유지(style "flow") 또는 바로 교정(style "teacher").
 */
export function talkInstructions(topicKey, { month = 1, style = "flow", tone = "freundlich", pron = false, sentences = [], extra = "" } = {}) {
  const t = topicOf(topicKey);
  const level = month <= 2 ? "B1" : month <= 4 ? "B1+/B2" : "B2";
  return [
    "Du bist ein freundlicher Gesprächspartner für einen koreanischen Erwachsenen, der Deutsch lernt " +
      `(Niveau ${level}). Er lebt seit Jahren in Deutschland und arbeitet als Lieferfahrer bei REWE.`,
    LANG_RULE,
    `Situation: ${t.scene}`,
    `Beginne das Gespräch selbst: ${t.first}`,
    "",
    "Regeln:",
    `- Sprich Deutsch, natürlich und deutlich, auf Niveau ${level}. Kurze Antworten: 1–3 Sätze, dann eine Rückfrage, damit er viel spricht.`,
    `- Tonfall: ${toneOf(tone).rule}`,
    ...(t.coach ? coachRules(sentences) : [...(style === "teacher" ? TEACHER_RULES : FLOW_RULES), ...(pron ? [PRON_RULE] : [])]),
    "- Wenn er mitten im deutschen Satz ein koreanisches Wort benutzt (z. B. „Ich möchte 소포 abholen“), " +
      "nenne kurz das deutsche Wort mit Artikel („소포 – das Paket.“) und mach dann normal weiter.",
    "- Wenn er auf Koreanisch fragt, wie man etwas sagt, antworte ganz kurz auf Koreanisch mit dem deutschen Ausdruck und kehre dann zum Deutschen zurück.",
    "- Wenn er „ähm“ sagt oder eine Pause macht, warte geduldig. Reagiere nicht auf Hintergrundgeräusche oder Gespräche anderer Leute.",
    "- Reine Füllwörter („ähm“, „hmm“, „mhm“, koreanisch „음“, „으음“, „아“, „어“) sind KEINE Antwort und keine Unterbrechung – ignoriere sie und sprich ggf. einfach weiter. " +
      "Wenn seine Äußerung unvollständig klingt (endet mit einem Füllwort oder mitten im Satz), sag nur ganz kurz „Mhm?“ oder „Ja …?“ und lass ihn weiterreden.",
    "- Sei ermutigend, aber nicht übertrieben.",
    extra ? `\n${extra}` : "",
    "\nNoch einmal: Erklärungen IMMER auf Koreanisch (설명은 항상 한국어로), Gespräch und Beispielsätze auf Deutsch.",
  ].join("\n").trim();
}

// 받아쓰기 힌트(고쳐 적지 말 것 — 요구사항 4)는 서버 api/talk-token.js 의 TRANSCRIBE_PROMPT 에 있다.

// ── 대화록 (Realtime 이벤트 → 줄 목록) ───────────────────────────────────────
// 줄: { id, who: "me"|"ai", text, done }
//  · 내 말은 input_audio_buffer.committed 에서 자리를 먼저 만든다 — 받아쓰기는 AI 대답보다 늦게 올 때가 많아서,
//    자리를 안 잡아 두면 순서가 뒤집힌다.
//  · AI 말은 response.output_item.added 에서 자리를 만들고 transcript delta 로 채운다.

const put = (lines, id, who, patch) => {
  const i = lines.findIndex((l) => l.id === id);
  if (i < 0) return [...lines, { id, who, text: "", done: false, ...patch }];
  const next = lines.slice();
  next[i] = { ...next[i], ...patch };
  return next;
};

/** 대화록에 이벤트 하나를 반영한 새 배열 (모르는 이벤트면 그대로) */
export function applyEvent(lines, ev) {
  if (!ev || typeof ev.type !== "string") return lines;
  switch (ev.type) {
    case "input_audio_buffer.committed":
      return ev.item_id ? put(lines, ev.item_id, "me", {}) : lines;
    case "conversation.item.input_audio_transcription.delta": {
      const cur = lines.find((l) => l.id === ev.item_id);
      return put(lines, ev.item_id, "me", { text: (cur?.text || "") + (ev.delta || "") });
    }
    case "conversation.item.input_audio_transcription.completed":
      return put(lines, ev.item_id, "me", { text: String(ev.transcript || "").trim(), done: true });
    case "conversation.item.deleted": // 추임새만 있던 내 말 — realtime.js 가 지웠다
      return lines.filter((l) => l.id !== ev.item_id);
    case "conversation.item.input_audio_transcription.failed":
      return put(lines, ev.item_id, "me", { done: true, failed: true });
    case "response.output_item.added":
      return ev.item?.role === "assistant" && ev.item?.id ? put(lines, ev.item.id, "ai", {}) : lines;
    case "response.output_audio_transcript.delta": {
      const cur = lines.find((l) => l.id === ev.item_id);
      return put(lines, ev.item_id, "ai", { text: (cur?.text || "") + (ev.delta || "") });
    }
    case "response.output_audio_transcript.done":
      return put(lines, ev.item_id, "ai", { text: String(ev.transcript || "").trim(), done: true });
    default:
      return lines;
  }
}

/**
 * 추임새만 있는 말인가 — "음…", "으음", "아~", "ähm", "hmm", "Mhm" …  (2026-10-31: 추임새에 AI 가 끼어들어 대화가 끊겼다)
 * 맞장구로 대답이 되는 말("ja", "응", "okay")은 추임새가 아니다 — 그건 대답이다.
 * 소리만 있고 글자가 없는 것(빈 받아쓰기, "…")도 추임새로 친다.
 */
const FILLER = /^(ä+h*m*|e+h*m+|ö+h*m*|u+h*m+|h+m+|m+h*m+|a+h+|o+h+|음+|으+음*|으+|아+|어+|에+|흠+|음음+|그+|저+|ehm|ähm|äh|hm+|mm+|uh+|um+|er+m*)$/i;
export function isFiller(text) {
  const words = String(text || "")
    .toLowerCase()
    .replace(/[.,!?…~\-–—"'„“”()]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  return words.every((w) => FILLER.test(w));
}

/** 빈 줄(소리만 들어오고 말이 없던 것)은 뺀 대화록 */
export const cleanLines = (lines) => (lines || []).filter((l) => String(l.text || "").trim());

/** 대화록 → 글 (AI 에게 보내거나 저장할 때). ICH / KI 로 나눈다 */
export const linesToText = (lines) =>
  cleanLines(lines).map((l) => `${l.who === "me" ? "ICH" : "KI"}: ${l.text.trim()}`).join("\n");

/** 내가 말한 줄만 */
export const myLines = (lines) => cleanLines(lines).filter((l) => l.who === "me").map((l) => l.text.trim());

// ── 비용 ─────────────────────────────────────────────────────────────────────
// USD / 1M 토큰 — 2026-10 OpenAI 요금표 (developers.openai.com/api/docs/pricing). 바뀌면 여기만 고친다.
export const RT_PRICING = {
  "gpt-realtime-2.1-mini": { audioIn: 10, audioCached: 0.3, audioOut: 20, textIn: 0.6, textCached: 0.06, textOut: 2.4 },
  "gpt-realtime-2.1": { audioIn: 32, audioCached: 0.4, audioOut: 64, textIn: 4, textCached: 0.4, textOut: 24 },
};
/** 받아쓰기 — 분당 (gpt-4o-transcribe 기준 — mini 를 써도 이 값으로 센다: 적게 세면 상한이 뚫린다) */
export const TRANSCRIBE_PER_MIN = 0.006;

const n = (v) => Number(v) || 0;

/** 받아쓰기 사용량(transcription.completed 의 usage) → 달러. 초 단위로 올 때와 토큰으로 올 때가 있다 */
export function transcribeCost(usage) {
  if (!usage) return 0;
  if (usage.type === "duration") return (n(usage.seconds) / 60) * TRANSCRIBE_PER_MIN;
  // gpt-4o-transcribe 토큰 요금: 오디오 입력 $6 · 글 출력 $10 / 1M
  return (n(usage.input_tokens) * 6 + n(usage.output_tokens) * 10) / 1_000_000;
}

/**
 * response.done 의 usage 하나 → 달러. 모르는 모델이면 비싼 쪽(2.1) 값으로 — 적게 세면 상한이 뚫린다.
 * usage: { input_token_details: { text_tokens, audio_tokens, cached_tokens_details: { text_tokens, audio_tokens } }, output_token_details: { text_tokens, audio_tokens } }
 */
export function rtCost(model, usage) {
  if (!usage) return 0;
  const p = RT_PRICING[model] || RT_PRICING["gpt-realtime-2.1"];
  const inp = usage.input_token_details || {};
  const out = usage.output_token_details || {};
  const cached = inp.cached_tokens_details || {};
  const audioCached = n(cached.audio_tokens);
  const textCached = n(cached.text_tokens);
  const audioIn = Math.max(0, n(inp.audio_tokens) - audioCached);
  const textIn = Math.max(0, n(inp.text_tokens) - textCached);
  return (
    audioIn * p.audioIn + audioCached * p.audioCached + textIn * p.textIn + textCached * p.textCached +
    n(out.audio_tokens) * p.audioOut + n(out.text_tokens) * p.textOut
  ) / 1_000_000;
}

/** 여러 usage 를 한 줄로 합친다 (기록은 대화 한 번에 한 줄 — 하루 호출 수 20회를 갉아먹지 않게) */
export function sumUsage(list) {
  const s = { input_tokens: 0, output_tokens: 0 };
  for (const u of list || []) {
    s.input_tokens += n(u?.input_tokens);
    s.output_tokens += n(u?.output_tokens);
  }
  return s;
}

// ── 대화 후 정리 (Claude) ────────────────────────────────────────────────────

export const REVIEW_SYSTEM =
  "Du bist ein geduldiger Deutschlehrer für einen koreanischen Erwachsenen (Niveau B1, Ziel B2), " +
  "der als Lieferfahrer bei REWE in Deutschland arbeitet. Erklärungen schreibst du auf Koreanisch, " +
  "Beispiele und Korrekturen auf Deutsch. Antworte ausschließlich mit einem JSON-Objekt, ohne Markdown.";

/** 대화록 → 정리 요청 글 */
export function reviewPrompt(lines, { topicLabel = "" } = {}) {
  return `학습자가 AI 와 독일어로 말하기 연습을 했다${topicLabel ? ` (주제: ${topicLabel})` : ""}.
아래는 대화록이다. ICH = 학습자(음성 인식으로 받아 적음 — 인식 오류가 있을 수 있다), KI = AI.

${linesToText(lines)}

복습할 만한 것만 골라 JSON 하나로 답하라. ICH 의 말만 교정한다. 사소한 것·인식 오류로 보이는 것은 빼고, 학습에 도움이 되는 것만.
{
  "summary": 한국어 한두 문장 — 무엇을 이야기했고, 잘한 점 하나와 다음에 신경 쓸 점 하나,
  "fixes": [  // 틀린 문장, 최대 8개
    { "said": ICH 가 한 문장 **그대로** (받아 적힌 글자 그대로 복사),
      "from": said 안의 틀린 부분 — said 에 **정확히 들어 있는** 연속된 글자,
      "to": from 을 바꿀 말,
      "better": 고친 문장 전체 (자연스러운 독일어),
      "ko": better 의 한국어 뜻,
      "type": 틀린 유형 (독일어 한두 단어: Artikel, Kasus, Verbstellung, Präposition, Zeitform, Wortwahl, Konjugation …),
      "hint": 한국어 힌트 — 정답 단어를 쓰지 말 것 (예: "명사의 성을 다시 봐요"),
      "why": 한국어 설명 한두 문장 }
  ],
  "korean": [  // ICH 가 한국어로 말한 단어·구, 최대 6개
    { "said": 그 문장 그대로, "ko": 한국어 부분, "de": 독일어 표현 (명사는 관사 포함),
      "better": 한국어 부분을 독일어로 바꾼 문장 전체, "koSentence": better 의 한국어 뜻 }
  ],
  "phrases": [  // 대화에서 나온 표현 중 B1→B2 학습자가 외워 두면 좋은 것, 최대 5개
    { "de": 독일어 문장 (짧게, 그대로 쓸 수 있게), "ko": 한국어 뜻, "note": 언제 쓰는지 한국어 한 줄 }
  ],
  "pron": [  // 발음 — KI 가 발음을 지적한 단어, 또는 ICH 의 인식된 말이 KI 가 내준 문장과 달라 발음이 다르게 들린 것으로 보이는 단어. 최대 6개
    { "word": 독일어 단어, "heard": 인식된 모양(있으면), "issue": 어떤 소리가 문제였는지 한국어 한 줄, "tip": 입 모양·혀 위치 팁 한국어 한 줄 }
  ]
}${topicLabel === "발음 연습" ? "\n이번은 발음 연습이었다 — fixes·korean 은 비워도 되고, pron 을 중심으로." : ""}
없으면 빈 배열. ICH 가 거의 말하지 않았으면 summary 에 그렇게 쓰고 나머지는 빈 배열.`;
}

const str = (v) => (typeof v === "string" ? v.trim() : "");

/** Claude 답 → { summary, fixes, korean, phrases }. JSON 이 아니면 throw */
export function parseReview(text) {
  const s = String(text || "");
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("정리 결과를 읽지 못했어요 (JSON 아님)");
  let raw;
  try {
    raw = JSON.parse(s.slice(a, b + 1));
  } catch {
    throw new Error("정리 결과를 읽지 못했어요 (JSON 깨짐 — 응답이 잘렸을 수 있어요)");
  }
  const arr = (v) => (Array.isArray(v) ? v : []);
  const fixes = arr(raw.fixes)
    .map((f) => ({
      said: str(f?.said), from: str(f?.from), to: str(f?.to), better: str(f?.better), ko: str(f?.ko),
      type: str(f?.type), hint: str(f?.hint), why: str(f?.why),
    }))
    .filter((f) => f.said && f.better && f.better !== f.said)
    // from 이 said 안에 없으면 오답 노트에서 밑줄을 못 긋는다 — 문장은 살리고 from/to 만 비운다
    .map((f) => (f.from && f.said.includes(f.from) && f.to !== f.from ? f : { ...f, from: "", to: "" }));
  const korean = arr(raw.korean)
    .map((k) => ({ said: str(k?.said), ko: str(k?.ko), de: str(k?.de), better: str(k?.better), koSentence: str(k?.koSentence) }))
    .filter((k) => k.ko && k.de);
  const phrases = arr(raw.phrases)
    .map((p) => ({ de: str(p?.de), ko: str(p?.ko), note: str(p?.note) }))
    .filter((p) => p.de);
  const pron = arr(raw.pron)
    .map((p) => ({ word: str(p?.word), heard: str(p?.heard), issue: str(p?.issue), tip: str(p?.tip) }))
    .filter((p) => p.word);
  return { summary: str(raw.summary), fixes, korean, phrases, pron };
}

// ── 저장 ─────────────────────────────────────────────────────────────────────
// 대화 한 번 = alltag_entries 한 줄 (template "talk", input_mode "talk").
//  · 고른 틀린 곳은 correction.data.b1.fixes 에 { from, to, type, hint, why } 로 — 오답 노트(drill.js collectItems)가
//    교정 기록과 똑같이 읽는다. 그래서 forText 에는 그 문장들만 한 줄씩 둔다.
//  · DE 로 보낸 문장은 progress.keepEdited + progress.sentIds — 🔴 3문장 꺼내기(recall.js)가 그대로 쓴다.
//  · 대화록 전체는 correction.talk 에 (나중에 다시 보기).

export const TALK_TEMPLATE = "talk";

/** 고른 항목 → DE 로 보낼 문장 [{ de, ko, note, kind }] */
export function keepRows(review, picked) {
  const rows = [];
  review.fixes.forEach((f, i) => picked.fixes?.[i] && rows.push({ de: f.better, ko: f.ko, kind: "fix", type: f.type }));
  review.korean.forEach((k, i) => picked.korean?.[i] && rows.push({ de: k.better || k.de, ko: k.koSentence || k.ko, kind: "korean" }));
  review.phrases.forEach((p, i) => picked.phrases?.[i] && rows.push({ de: p.de, ko: p.ko, note: p.note, kind: "phrase" }));
  // 같은 독일어 문장이 두 번 가지 않게
  const seen = new Set();
  return rows.filter((r) => r.de && !seen.has(r.de) && seen.add(r.de));
}

/** 저장할 기록 한 줄 (id 없이). month: 몇 개월차 */
export function talkEntry({ day, month, topic, lines, review, picked, seconds, cost, model }) {
  const fixes = review.fixes.filter((f, i) => picked.fixes?.[i]);
  const drillable = fixes.filter((f) => f.from);
  const forText = [...new Set(drillable.map((f) => f.said))].join("\n");
  return {
    day,
    month_no: month,
    template: TALK_TEMPLATE,
    input_mode: "talk",
    raw_text: myLines(lines).join("\n"),
    parts: { topic },
    correction: {
      kind: "talk",
      forText,
      data: {
        b1: { text: drillable.map((f) => f.better).join("\n"), fixes: drillable.map(({ from, to, type, hint, why }) => ({ from, to, type, hint, why })) },
      },
      talk: {
        topic, seconds, cost, model,
        lines: cleanLines(lines).map(({ who, text }) => ({ who, text })),
        summary: review.summary,
        fixes, korean: review.korean.filter((k, i) => picked.korean?.[i]), phrases: review.phrases.filter((p, i) => picked.phrases?.[i]),
        pron: review.pron || [],
      },
      progress: {},
    },
  };
}

/** 처음 고르기 상태 — 틀린 문장·한국어는 다 켜고, 새 표현은 앞 3개만 */
export function defaultPicked(review) {
  return {
    fixes: review.fixes.map(() => true),
    korean: review.korean.map(() => true),
    phrases: review.phrases.map((_, i) => i < 3),
  };
}

/** mm:ss */
export const clock = (sec) => {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
