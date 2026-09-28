// 원어민 발음 만들기 — 서버 쪽 창구 하나.
//
// ※ fokus-karten/api/tts.js 와 **같은 파일**이다. 두 앱이 같은 Storage 버킷(card-audio)과
//    card_meta.meta.audio 를 나눠 쓰므로, 고칠 일이 있으면 양쪽을 같이 고친다.
//    Vercel 환경변수도 같은 이름이다: TTS_PROVIDER / GOOGLE_TTS_API_KEY (/ GOOGLE_TTS_VOICE)
//    또는 ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID. SUPABASE_URL 은 VITE_ 이름으로도 읽는다.
//
// 왜 서버가 필요한가: TTS 업체의 API 키는 브라우저에 둘 수 없다. Vite 의 VITE_ 변수는
// 빌드 결과물에 그대로 박혀 누구나 읽을 수 있고, 그 키로 남이 내 요금을 쓴다.
// 그래서 키는 여기(서버 환경변수)에만 두고, 브라우저는 "이 문장 읽어줘"만 부탁한다.
//
// 어디서 도는가:
//   배포 → Vercel 서버리스 함수 (/api/tts). 별도 설정 없이 api/ 폴더가 그대로 함수가 된다.
//   개발 → vite.config.js 의 미들웨어가 이 파일을 그대로 불러 쓴다. 코드가 한 벌이다.
//
// 주고받는 것 (전부 JSON — 소리는 base64 로 싣는다):
//   POST /api/tts   { text, voice? }    → { audio, mime, provider, voice }
//   GET  /api/tts                       → { provider, voices: [{ id, label, short, group, lang, langLabel }] }
//   헤더 Authorization: Bearer <Supabase 액세스 토큰>
//
// voice 를 안 보내면 서버가 알아서 고른다. 보내면 그 목소리로 만든다 —
// 카드마다 목소리를 바꿔 가며 만들어 보고 마음에 드는 걸 고르는 흐름 때문이다.
//
// 왜 mp3 를 바이너리로 안 보내고 base64 로 싣는가:
// 개발용 미들웨어와 Vercel 이 바이너리 응답을 다루는 방식이 서로 다르다. 소리 한 조각은
// 커야 100KB 라, 33% 커지는 걸 감수하고 양쪽에서 똑같이 도는 코드 한 벌을 택했다.

import { createClient } from "@supabase/supabase-js";

// 한 번에 만들 수 있는 길이. 카드 한 장은 낱말이거나 한두 문장이다.
// 상한이 없으면 실수로 붙여넣은 긴 글 하나가 그대로 요금이 된다.
const MAX_CHARS = 300;

// 목소리 이름에 허용하는 글자. ElevenLabs 는 이 값이 **URL 경로**에 들어가므로
// 검사를 빼면 `../` 같은 걸 넣어 다른 곳을 부르게 만들 수 있다. 실제 이름은
// `de-DE-Chirp3-HD-Kore` 나 22자리 영숫자 id 라 이 범위를 벗어나지 않는다.
const VOICE_OK = /^[A-Za-z0-9._-]{1,64}$/;

const env = (...names) => {
  for (const n of names) if (process.env[n]) return process.env[n];
  return "";
};

// ── 제공자 ──────────────────────────────────────────────────────────────────
// 둘 다 독일어를 잘 읽지만 성격이 다르다.
//   google      — de-DE 전용으로 학습된 목소리라 고르는 수고가 없다. 무료 한도가 있다.
//   elevenlabs  — 억양이 가장 사람 같다. 대신 Voice Library 에서 **독일 사람 목소리**를
//                 골라 ELEVENLABS_VOICE_ID 에 넣어야 한다. 기본 목소리는 영어 화자라
//                 독일어를 읽으면 영어 억양이 남는다.
const PROVIDER = (env("TTS_PROVIDER") || "google").toLowerCase();

// ── Google Cloud Text-to-Speech ─────────────────────────────────────────────
const G_URL = "https://texttospeech.googleapis.com/v1";

const GENDER = { FEMALE: "여성", MALE: "남성", NEUTRAL: "중성" };

// 목소리가 **어느 언어인지**는 고르는 화면에서 제일 먼저 보여야 한다.
// 이름만 늘어놓으면 "Kore" 가 독일어인지 영어인지 알 수 없고, ElevenLabs 는 계정에 있는
// 목소리를 언어와 무관하게 전부 준다 — 영어 화자를 골라 놓고 독일어를 읽히기 십상이다.
const LANG_KO = {
  de: "독일어", en: "영어", ko: "한국어", ja: "일본어", zh: "중국어",
  fr: "프랑스어", es: "스페인어", it: "이탈리아어", nl: "네덜란드어", pt: "포르투갈어",
  pl: "폴란드어", ru: "러시아어", tr: "튀르키예어", sv: "스웨덴어", da: "덴마크어",
};
const langKo = (code) => LANG_KO[String(code || "").slice(0, 2).toLowerCase()] || "";

const UNKNOWN_LANG = "언어 표시 없음";

// 이 앱은 독일어 카드를 읽는다. 그래서 목록은 독일어 → 그 밖의 언어 → 언어 미상 순이다.
// 미상을 가나다순에 맡기면 안 된다 — "언어 표시 없음" 이 "영어" 보다 앞에 온다.
const langOrder = (v) =>
  String(v.lang || "").toLowerCase().startsWith("de") ? 0 : v.langLabel === UNKNOWN_LANG ? 2 : 1;

// `de-DE-Chirp3-HD-Kore` (FEMALE) → 언어 `de-DE` · 이름 `Kore` · 성별 `여성` · 등급 `Chirp3-HD`
//
// **되풀이되는 것은 전부 묶음 제목으로 올린다** (`독일어 · Chirp3-HD`). 줄에는 `Kore · 여성`
// 만 남는다 — 서른 줄이 같은 언어·같은 등급인데 줄마다 그걸 다시 적으면, 폰에서 목록이
// 화면 밖으로 삐져나가고 정작 다른 부분(누구 목소리인지)이 눈에 안 들어온다.
function googleOne(v) {
  const name = String(v.name || "");
  const lang = Array.isArray(v.languageCodes) && v.languageCodes[0] ? v.languageCodes[0] : "de-DE";
  const rest = name.replace(new RegExp(`^${lang}-`), "");
  const cut = rest.lastIndexOf("-");
  const who = cut > 0 ? rest.slice(cut + 1) : rest;
  const tier = cut > 0 ? rest.slice(0, cut) : "";
  const gender = GENDER[v.ssmlGender] || "";
  const langLabel = langKo(lang) || lang;
  return {
    id: name,
    lang,
    langLabel,
    // 묶음 제목 — 언어와 등급처럼 여러 줄이 공유하는 것
    group: [langLabel, tier].filter(Boolean).join(" · "),
    // 고르는 칸의 한 줄 — 묶음 제목에 없는 것만
    label: [who, gender].filter(Boolean).join(" · "),
    // 카드에 붙은 발음 줄 — 여기엔 묶음 제목이 없으니 언어를 앞에 붙인다
    short: [langLabel, who, gender].filter(Boolean).join(" · "),
  };
}

async function googleVoices(key) {
  const r = await fetch(`${G_URL}/voices?languageCode=de-DE&key=${key}`);
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || `Google ${r.status}`);
  return sortVoices((j.voices || []).map(googleOne));
}

// 독일어 먼저, 그 다음 좋은 등급 순. 고르는 사람이 목록 끝까지 내려가지 않아도 되게.
function sortVoices(list) {
  const rank = (id) => {
    const i = G_RANK.findIndex((t) => id.includes(t));
    return i < 0 ? G_RANK.length : i;
  };
  // 묶음이 쪼개지지 않게 **등급까지 정렬 기준에 넣는다** — 같은 group 끼리 반드시 붙어 있어야
  // 화면에서 optgroup 하나로 묶인다(화면은 이웃끼리만 묶는다).
  return list.sort(
    (a, b) =>
      langOrder(a) - langOrder(b) ||
      a.langLabel.localeCompare(b.langLabel) ||
      rank(a.id) - rank(b.id) ||
      (a.group || "").localeCompare(b.group || "") ||
      a.id.localeCompare(b.id)
  );
}

// 목소리를 안 정해 두면 여기서 고른다. 이름을 코드에 박아 두지 않는 이유는,
// 업체가 목소리를 더하거나 이름을 바꾸면 그 순간 전부 실패하기 때문이다.
// 좋은 순서대로 앞에서부터 찾는다: Chirp3-HD → Neural2 → Wavenet → 아무 de-DE.
const G_RANK = ["Chirp3-HD", "Chirp-HD", "Neural2", "Studio", "Wavenet"];

async function googlePickVoice(key) {
  // googleVoices 가 이미 독일어 · 좋은 등급 순으로 정렬해 준다.
  const list = await googleVoices(key);
  if (list.length === 0) throw new Error("독일어 목소리를 하나도 찾지 못했습니다.");
  return list[0].id;
}

let googleVoiceCache = "";

async function googleSynth(text, want) {
  const key = env("GOOGLE_TTS_API_KEY");
  if (!key) throw new Error("GOOGLE_TTS_API_KEY 가 없습니다.");

  // 고르라고 보낸 목소리가 있으면 그것. 없으면 환경변수, 그것도 없으면 자동.
  // 자동으로 고른 값은 함수 인스턴스가 사는 동안만 기억한다 — 매 요청마다 목록을
  // 다시 받아 오면 발음 하나 만드는 데 왕복이 두 번이 된다.
  const voice =
    want || env("GOOGLE_TTS_VOICE") || googleVoiceCache || (googleVoiceCache = await googlePickVoice(key));

  const r = await fetch(`${G_URL}/text:synthesize?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: "de-DE", name: voice },
      // 속도는 여기서 건드리지 않는다. 덱 설정의 "읽는 속도"는 재생할 때
      // audio.playbackRate 로 준다 — 그래야 파일 하나로 속도를 바꿔 들을 수 있다.
      audioConfig: { audioEncoding: "MP3" },
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || `Google ${r.status}`);
  return { audio: j.audioContent, mime: "audio/mpeg", voice };
}

// ── ElevenLabs ──────────────────────────────────────────────────────────────
const E_URL = "https://api.elevenlabs.io/v1";

// ElevenLabs 는 계정에 있는 목소리를 **언어와 무관하게 전부** 준다. 언어 표시도 자리가
// 제각각이라 있을 법한 곳을 차례로 본다. 그래도 없으면 "언어 표시 없음" 으로 묶어
// 맨 아래로 내린다 — 모르는 걸 독일어인 척 섞어 두면 영어 화자를 고르게 된다.
function elevenOne(v) {
  const code =
    v.verified_languages?.[0]?.language ||
    v.fine_tuning?.language ||
    v.labels?.language ||
    v.labels?.accent ||
    "";
  const langLabel = langKo(code) || (code ? String(code) : UNKNOWN_LANG);
  const who = v.name || v.voice_id;
  const gender = v.labels?.gender === "female" ? "여성" : v.labels?.gender === "male" ? "남성" : "";
  return {
    id: v.voice_id,
    lang: code || "",
    langLabel,
    group: langLabel,
    label: [who, gender, v.labels?.accent].filter(Boolean).join(" · "),
    short: [langLabel, who, gender].filter(Boolean).join(" · "),
  };
}

async function elevenVoices(key) {
  const r = await fetch(`${E_URL}/voices`, { headers: { "xi-api-key": key } });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.detail?.message || `ElevenLabs ${r.status}`);
  return sortVoices((j.voices || []).map(elevenOne));
}

async function elevenSynth(text, want) {
  const key = env("ELEVENLABS_API_KEY");
  if (!key) throw new Error("ELEVENLABS_API_KEY 가 없습니다.");
  const voice = want || env("ELEVENLABS_VOICE_ID");
  if (!voice) {
    throw new Error(
      "ELEVENLABS_VOICE_ID 가 없습니다. GET /api/tts 로 목소리 목록을 보고 하나를 고르세요."
    );
  }
  const model = env("ELEVENLABS_MODEL") || "eleven_multilingual_v2";

  const r = await fetch(`${E_URL}/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: model }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`ElevenLabs ${r.status}: ${t.slice(0, 200)}`);
  }
  const buf = Buffer.from(await r.arrayBuffer());
  return { audio: buf.toString("base64"), mime: "audio/mpeg", voice };
}

const SYNTH = { google: googleSynth, elevenlabs: elevenSynth };
const VOICES = {
  google: () => googleVoices(env("GOOGLE_TTS_API_KEY")),
  elevenlabs: () => elevenVoices(env("ELEVENLABS_API_KEY")),
};

// ── 누가 부르는지 확인 ──────────────────────────────────────────────────────
// 이 창구가 열려 있으면 주소만 아는 누구나 내 TTS 요금을 쓸 수 있다.
// 그래서 Supabase 로그인 토큰을 받아 실제 사용자인지 확인한다.
async function requireUser(req) {
  const url = env("SUPABASE_URL", "VITE_SUPABASE_URL");
  const anon = env("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY");
  if (!url || !anon) throw new Error("서버에 SUPABASE_URL / SUPABASE_ANON_KEY 가 없습니다.");

  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("로그인이 필요합니다.");

  const sb = createClient(url, anon);
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) throw new Error("로그인이 만료됐습니다. 다시 로그인해 주세요.");
  return data.user;
}

export default async function handler(req, res) {
  const send = (code, body) => {
    res.statusCode = code;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(body));
  };

  if (!SYNTH[PROVIDER]) {
    return send(500, { error: `TTS_PROVIDER 가 잘못됐습니다: ${PROVIDER} (google | elevenlabs)` });
  }

  try {
    await requireUser(req);
  } catch (e) {
    return send(401, { error: e.message });
  }

  try {
    // 목소리 목록 — 어떤 목소리를 쓸 수 있는지 브라우저에서 바로 볼 수 있게.
    if (req.method === "GET") {
      return send(200, { provider: PROVIDER, voices: await VOICES[PROVIDER]() });
    }

    if (req.method !== "POST") return send(405, { error: "POST 로 보내세요." });

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const text = (body.text || "").trim();
    if (!text) return send(400, { error: "읽을 글이 비어 있습니다." });
    if (text.length > MAX_CHARS) {
      return send(400, { error: `너무 깁니다 — ${MAX_CHARS}자까지만 만들 수 있어요.` });
    }

    const want = (body.voice || "").trim();
    if (want && !VOICE_OK.test(want)) return send(400, { error: "목소리 이름이 이상합니다." });

    const out = await SYNTH[PROVIDER](text, want);
    return send(200, { ...out, provider: PROVIDER });
  } catch (e) {
    // 업체 쪽 실패는 그대로 보여준다. "만들지 못했습니다" 만으로는
    // 키가 없는 건지, 한도가 찬 건지, 목소리 이름이 틀린 건지 알 수 없다.
    return send(502, { error: e.message || "발음을 만들지 못했습니다." });
  }
}
