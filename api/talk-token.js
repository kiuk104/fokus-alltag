// POST /api/talk-token — 🎙 실시간 대화용 **임시 열쇠** 만들기 (화면: src/screens/Talk.jsx · 연결: src/lib/realtime.js)
//
// OpenAI API 키는 브라우저에 둘 수 없다(api/tts.js 머리말과 같은 이유). 그래서 서버가 키로
// "1분 안에 세션 하나만 열 수 있는 열쇠(ek_…)"를 받아 브라우저에 준다. 세션 설정(모델·지시문·턴 감지·받아쓰기)은
// 여기서 정해 열쇠에 묶는다 — 브라우저가 마음대로 비싼 모델로 바꾸지 못하게.
//
// 받는 것: { instructions, mode: "auto"|"ptt", noise: "near"|"far" }   헤더 Authorization: Bearer <Supabase 토큰>
// 주는 것: { value, expires_at, model }
//
// Vercel 환경변수:
//   OPENAI_API_KEY            (필수) platform.openai.com → API keys
//   OPENAI_REALTIME_MODEL     기본 gpt-realtime-2.1-mini (싸다). 더 좋은 대화는 gpt-realtime-2.1
//   OPENAI_REALTIME_VOICE     기본 marin
//   OPENAI_TRANSCRIBE_MODEL   기본 gpt-4o-mini-transcribe — "내가 말한 것이 어떻게 인식됐는지" 보여 주는 받아쓰기
//   SUPABASE_URL / SUPABASE_ANON_KEY (VITE_ 이름으로도 읽는다)

import { createClient } from "@supabase/supabase-js";

const env = (...names) => {
  for (const n of names) if (process.env[n]) return process.env[n];
  return "";
};

const MAX_INSTRUCTIONS = 6000; // 지시문 길이 상한 — 긴 글을 실어 보내 토큰을 쓰는 걸 막는다

const TRANSCRIBE_PROMPT =
  "Deutsch eines Lernenden, manchmal mit einzelnen koreanischen Wörtern. " +
  "Schreibe genau auf, was gesagt wurde – auch grammatische Fehler, falsche Artikel und Endungen. " +
  "Nichts korrigieren. Koreanische Wörter in Hangul schreiben.";

// 브라우저(src/lib/realtime.js turnDetection)와 같은 값
const turnDetection = (mode) =>
  mode === "ptt" ? null : { type: "semantic_vad", eagerness: "low", create_response: true, interrupt_response: true };

async function requireUser(req) {
  const url = env("SUPABASE_URL", "VITE_SUPABASE_URL");
  const anon = env("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY");
  if (!url || !anon) throw Object.assign(new Error("서버에 SUPABASE_URL / SUPABASE_ANON_KEY 가 없습니다."), { code: 500 });
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) throw Object.assign(new Error("로그인이 필요합니다."), { code: 401 });
  const { data, error } = await createClient(url, anon).auth.getUser(token);
  if (error || !data?.user) throw Object.assign(new Error("로그인이 만료됐습니다. 다시 로그인해 주세요."), { code: 401 });
  return data.user;
}

/** 세션 설정 — 순수 함수 (테스트: talk-token.test.mjs) */
export function sessionConfig({ instructions, mode, noise }, { model, voice, transcribe }) {
  return {
    type: "realtime",
    model,
    instructions: String(instructions || "").slice(0, MAX_INSTRUCTIONS),
    output_modalities: ["audio"],
    audio: {
      input: {
        noise_reduction: { type: noise === "far" ? "far_field" : "near_field" },
        // language 를 비워 둔다 — 독일어 속에 섞인 한국어도 받아 적게
        transcription: { model: transcribe, prompt: TRANSCRIBE_PROMPT },
        turn_detection: turnDetection(mode),
      },
      output: { voice },
    },
  };
}

export default async function handler(req, res) {
  const send = (code, body) => {
    res.statusCode = code;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify(body));
  };
  try {
    if (req.method !== "POST") return send(405, { error: "POST 로 보내세요." });
    await requireUser(req);

    const key = env("OPENAI_API_KEY");
    if (!key) return send(500, { error: "서버에 OPENAI_API_KEY 가 없어요. Vercel → Settings → Environment Variables 에 넣어 주세요." });

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const model = env("OPENAI_REALTIME_MODEL") || "gpt-realtime-2.1-mini";
    const session = sessionConfig(body, {
      model,
      voice: env("OPENAI_REALTIME_VOICE") || "marin",
      transcribe: env("OPENAI_TRANSCRIBE_MODEL") || "gpt-4o-mini-transcribe",
    });

    const r = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ expires_after: { anchor: "created_at", seconds: 60 }, session }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return send(502, { error: `OpenAI: ${d?.error?.message || r.status}` });
    return send(200, { value: d.value, expires_at: d.expires_at, model: d.session?.model || model });
  } catch (e) {
    return send(e.code || 500, { error: e.message || String(e) });
  }
}
