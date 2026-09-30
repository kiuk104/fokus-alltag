// GET  /api/listen-captions?v=<유튜브 영상 ID>   → 그 영상의 독일어 자막을 문장 구간으로
// POST /api/listen-captions  { text }            → 붙여넣은 스크립트/SRT 를 문장 구간으로 (자막을 못 받을 때의 안전한 길)
//
// 응답: { videoId?, source: "youtube"|"paste", lang?, auto?, count, sentences: [{ i, start, end, text }] }
// 실패: 502 { error, tried: [{ step, ok, note }] } — 어느 단계에서 막혔는지 그대로 보여 준다.
//
// 자막을 받는 길은 공식이 아니다(공식 captions API 는 영상 주인만 쓴다). 유튜브가 데이터센터 주소를 막으면 실패한다.
// 그래서 (1) 영상 페이지 → (2) 플레이어 API 순서로 시도하고, 다 막히면 앱이 붙여넣기로 넘어간다.
// 로그인 확인은 하지 않는다: 공개 영상의 공개 자막만 다루고 키·개인 데이터가 오가지 않는다.

import { parseCaptionTracks, tracksFromPlayer, pickGermanTrack, parseJson3, parseTimedTextXml, parseTranscriptPaste, sentencesFromCues } from "./_captions-parse.js";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";
const VIDEO_ID = /^[\w-]{11}$/;

async function getText(url, init = {}) {
  const r = await fetch(url, { redirect: "follow", ...init, headers: { "User-Agent": UA, "Accept-Language": "de-DE,de;q=0.9", ...init.headers } });
  if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`);
  return r.text();
}

// 응답이 왜 자막을 안 주는지 알 수 있게, 재생 상태를 짧게 적어 둔다 (예: LOGIN_REQUIRED · "Sign in to confirm you're not a bot")
const statusNote = (j) => {
  const p = j?.playabilityStatus;
  const why = String(p?.reason || p?.messages?.[0] || "").slice(0, 80);
  return `${p?.status || "상태 없음"}${why ? ` · ${why}` : ""}${j?.captions ? "" : " · captions 없음"}`;
};

// 1) 영상 페이지의 captionTracks
async function fromWatchPage(id) {
  const html = await getText(`https://www.youtube.com/watch?v=${id}&hl=de`, { headers: { Cookie: "CONSENT=YES+1; SOCS=CAI" } });
  const tracks = parseCaptionTracks(html);
  let note = "";
  if (!tracks.length) {
    const m = html.match(/"playabilityStatus":(\{[\s\S]{0,400}?\})\s*,\s*"/);
    note = /consent\.youtube|Bevor Sie zu YouTube/i.test(html) ? "동의 화면이 나옴" : m ? statusNote({ playabilityStatus: safeJson(m[1]) }) : "플레이어 응답 없음";
  }
  return { tracks, note };
}

const safeJson = (s) => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

// 2) 플레이어 API — 클라이언트 종류마다 유튜브의 대접이 달라서 여러 개를 차례로 본다
const CLIENTS = {
  ANDROID: {
    ua: "com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip",
    client: { clientName: "ANDROID", clientVersion: "20.10.38", androidSdkVersion: 34 },
  },
  IOS: {
    ua: "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)",
    client: { clientName: "IOS", clientVersion: "20.10.4", deviceModel: "iPhone16,2", osVersion: "18.3.2.22D82" },
  },
  WEB_EMBEDDED: {
    ua: UA,
    client: { clientName: "WEB_EMBEDDED_PLAYER", clientVersion: "1.20250310.01.00" },
    extra: (id) => ({ thirdParty: { embedUrl: `https://www.youtube.com/watch?v=${id}` } }),
  },
};

const fromPlayerApi = (name) => async (id) => {
  const c = CLIENTS[name];
  const body = { context: { client: { ...c.client, hl: "de", gl: "DE" }, ...(c.extra ? c.extra(id) : {}) }, videoId: id };
  const j = safeJson(
    await getText("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": c.ua },
      body: JSON.stringify(body),
    }),
  );
  const tracks = tracksFromPlayer(j);
  return { tracks, note: tracks.length ? "" : statusNote(j) };
};

async function cuesOf(track) {
  const base = track.url.replace(/&fmt=[^&]*/, "");
  const j = parseJson3(await getText(`${base}&fmt=json3`).catch(() => ""));
  if (j.length) return j;
  return parseTimedTextXml(await getText(base)); // json3 가 안 될 때 기본 XML
}

async function fromYoutube(id) {
  const tried = [];
  const steps = [
    ["영상 페이지", fromWatchPage],
    ["플레이어 API(ANDROID)", fromPlayerApi("ANDROID")],
    ["플레이어 API(IOS)", fromPlayerApi("IOS")],
    ["플레이어 API(임베드)", fromPlayerApi("WEB_EMBEDDED")],
  ];
  for (const [step, fn] of steps) {
    try {
      const { tracks, note } = await fn(id);
      const track = pickGermanTrack(tracks);
      if (!track) {
        tried.push({ step, ok: false, note: tracks.length ? `독일어 자막 없음 (${tracks.map((t) => t.lang).join(",")})` : note || "자막 트랙 없음" });
        continue;
      }
      const cues = await cuesOf(track);
      if (!cues.length) {
        tried.push({ step, ok: false, note: "자막 트랙은 찾았지만 내용을 못 받음" });
        continue;
      }
      const sentences = sentencesFromCues(cues);
      return { ok: true, data: { videoId: id, source: "youtube", via: step, lang: track.lang, auto: track.auto, count: sentences.length, sentences } };
    } catch (e) {
      tried.push({ step, ok: false, note: e?.message || String(e) });
    }
  }
  return { ok: false, tried };
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let s = "";
  for await (const c of req) s += c;
  try {
    return JSON.parse(s || "{}");
  } catch {
    return {};
  }
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  const send = (code, obj) => {
    res.statusCode = code;
    res.end(JSON.stringify(obj));
  };

  if (req.method === "POST") {
    const { text } = await readBody(req);
    const sentences = sentencesFromCues(parseTranscriptPaste(String(text || "").slice(0, 200000)));
    if (!sentences.length) return send(400, { error: "시각이 들어 있는 스크립트나 SRT 를 붙여 넣어 주세요" });
    return send(200, { source: "paste", count: sentences.length, sentences });
  }

  const id = new URL(req.url, "http://x").searchParams.get("v") || "";
  if (!VIDEO_ID.test(id)) return send(400, { error: "v 는 11자리 유튜브 영상 ID" });

  const r = await fromYoutube(id);
  if (!r.ok) return send(502, { error: "자막을 받지 못했어요 — 붙여넣기로 대신할 수 있어요", tried: r.tried });
  // 같은 영상의 자막은 잘 안 바뀐다 — 가장자리에서 하루
  res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
  send(200, r.data);
}
