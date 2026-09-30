// npm test — 자막 파서와 서버 함수. 서버 함수는 fetch 를 가짜로 바꿔 검사한다 (실제 유튜브는 부르지 않는다).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseJson3, parseTimedTextXml, parseSrt, parseTranscriptPaste, parseCaptionTracks, tracksFromPlayer, pickGermanTrack, sentencesFromCues } from "./_captions-parse.js";
import handler from "./listen-captions.js";

const JSON3 = {
  events: [
    { tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: "Hallo und willkommen" }] },
    { tStartMs: 2000, dDurationMs: 2000, segs: [{ utf8: "bei Easy German. Heute" }] },
    { tStartMs: 4000, dDurationMs: 100 }, // segs 없는 이벤트
    { tStartMs: 4100, dDurationMs: 1900, segs: [{ utf8: "sind wir " }, { utf8: "in Wien!" }] },
    { tStartMs: 6000, dDurationMs: 1000, segs: [{ utf8: "[Musik]" }] },
    { tStartMs: 7000, dDurationMs: 2000, segs: [{ utf8: "- Gehen wir\nz.B. ins Café?" }] },
  ],
};

test("json3: 조각 이어 붙이기, 빈 이벤트·[Musik] 빼기", () => {
  const c = parseJson3(JSON.stringify(JSON3));
  assert.equal(c.length, 4);
  assert.deepEqual(c[2], { start: 4.1, end: 6, text: "sind wir in Wien!" });
  assert.equal(parseJson3("not json").length, 0);
});

test("XML: 예전 <text> 모양과 srv3 <p> 모양", () => {
  const a = parseTimedTextXml(`<transcript><text start="1.5" dur="2">Guten &amp; Tag</text><text start="4" dur="1">Ja</text></transcript>`);
  assert.deepEqual(a, [{ start: 1.5, end: 3.5, text: "Guten & Tag" }, { start: 4, end: 5, text: "Ja" }]);
  const b = parseTimedTextXml(`<timedtext><body><p t="1500" d="2000">Hallo</p></body></timedtext>`);
  assert.deepEqual(b, [{ start: 1.5, end: 3.5, text: "Hallo" }]);
});

test("SRT / VTT", () => {
  const srt = "1\n00:00:01,500 --> 00:00:03,000\nHallo\nWelt\n\n2\n00:01:02,000 --> 00:01:04,250\nTschüss.\n";
  assert.deepEqual(parseSrt(srt), [{ start: 1.5, end: 3, text: "Hallo Welt" }, { start: 62, end: 64.25, text: "Tschüss." }]);
  assert.equal(parseSrt("WEBVTT\n\n00:01.000 --> 00:02.000\nHi\n")[0].start, 1);
});

test("붙여넣은 스크립트: 시각 줄 / 한 줄 모양 / 끝 시각은 다음 시작", () => {
  const a = parseTranscriptPaste("0:05\nHallo zusammen\n0:09\nheute geht es\num Wien.\n1:02:03\nEnde.");
  assert.equal(a.length, 3);
  assert.deepEqual(a[0], { start: 5, end: 9, text: "Hallo zusammen" });
  assert.equal(a[1].text, "heute geht es um Wien.");
  assert.equal(a[2].start, 3723);
  const b = parseTranscriptPaste("0:05 Hallo\n0:08 Welt.");
  assert.deepEqual(b.map((x) => x.text), ["Hallo", "Welt."]);
  assert.equal(parseTranscriptPaste("그냥 글").length, 0);
});

test("자막 트랙: 영상 페이지 조각 · 플레이어 응답 · 독일어 우선 · 엉뚱한 주소 거르기", () => {
  const page = `x"captionTracks":[{"baseUrl":"https://www.youtube.com/api/timedtext?v=A\\u0026lang=en","languageCode":"en"},{"baseUrl":"https://www.youtube.com/api/timedtext?v=A\\u0026lang=de\\u0026kind=asr","languageCode":"de","kind":"asr"},{"baseUrl":"https://www.youtube.com/api/timedtext?v=A\\u0026lang=de","languageCode":"de"},{"baseUrl":"https://evil.example/x","languageCode":"de"}],"audioTracks":[]`;
  const t = parseCaptionTracks(page);
  assert.equal(t.length, 3);
  assert.equal(t[0].url, "https://www.youtube.com/api/timedtext?v=A&lang=en");
  const de = pickGermanTrack(t);
  assert.equal(de.auto, false);
  assert.equal(pickGermanTrack(t.filter((x) => x.lang === "en")), null);
  assert.equal(pickGermanTrack(t.filter((x) => x.auto)).auto, true);
  assert.equal(tracksFromPlayer({ captions: { playerCaptionsTracklistRenderer: { captionTracks: [{ baseUrl: "https://www.youtube.com/api/timedtext?v=B", languageCode: "de-DE" }] } } }).length, 1);
  assert.deepEqual(parseCaptionTracks("<html></html>"), []);
});

test("문장 만들기: 줄 경계와 문장 경계가 다를 때", () => {
  const s = sentencesFromCues(parseJson3(JSON3), { pad: 0 });
  assert.deepEqual(s.map((x) => x.text), [
    "Hallo und willkommen bei Easy German.",
    "Heute sind wir in Wien!",
    "Gehen wir z.B. ins Café?", // z.B. 에서는 안 끊고, 앞의 "- " 는 뺀다
  ]);
  assert.equal(s[0].start, 0);
  assert.ok(s[0].end > 2 && s[0].end < 4, "첫 문장은 둘째 줄 안에서 끝난다");
  assert.ok(Math.abs(s[1].start - s[0].end) < 0.001, "다음 문장은 앞 문장이 끝난 자리에서 시작");
  assert.deepEqual(s.map((x) => x.i), [0, 1, 2]);
});

test("문장 만들기: 앞뒤 여유는 이웃과 겹치면 가운데에서 나눈다", () => {
  const s = sentencesFromCues([{ start: 1, end: 2, text: "Eins." }, { start: 2.1, end: 3, text: "Zwei." }], { pad: 0.3 });
  assert.equal(s[0].start, 0.7);
  assert.equal(s[0].end, s[1].start);
  assert.equal(s[1].end, 3.3);
});

test("문장 만들기: 문장부호 없는 자동 자막은 빈 틈·길이로 끊는다", () => {
  const cues = [
    { start: 0, end: 2, text: "das ist ein test" },
    { start: 2, end: 4, text: "ohne satzzeichen" },
    { start: 8, end: 10, text: "und hier geht es weiter" },
  ];
  assert.equal(sentencesFromCues(cues, { pad: 0 }).length, 2);
  const long = [{ start: 0, end: 10, text: "wort ".repeat(60).trim() }];
  assert.ok(sentencesFromCues(long, { maxChars: 100 }).length >= 3);
  assert.deepEqual(sentencesFromCues([]), []);
});

// ── 서버 함수 (fetch 를 가짜로) ──────────────────────────────────────────────

const run = async (url, { method = "GET", body } = {}) => {
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = JSON.parse(b); } };
  await handler({ url, method, body }, res);
  return res;
};

const withFetch = async (fake, fn) => {
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const body = await fake(String(url), init);
    if (body === null) return new Response("no", { status: 404 });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status: 200 });
  };
  try {
    return await fn();
  } finally {
    globalThis.fetch = orig;
  }
};

const TRACK = "https://www.youtube.com/api/timedtext?v=AAAAAAAAAAA&lang=de";
const PAGE = `"captionTracks":[{"baseUrl":"${TRACK.replace(/&/g, "\\u0026")}","languageCode":"de"}],"audioTracks":[]`;

test("서버: 영상 페이지 → 자막 → 문장", async () => {
  const r = await withFetch(
    (u) => (u.includes("/watch?") ? PAGE : u.includes("timedtext") && u.includes("fmt=json3") ? JSON3 : null),
    () => run("/api/listen-captions?v=AAAAAAAAAAA"),
  );
  assert.notEqual(r.statusCode, 502);
  assert.equal(r.body.source, "youtube");
  assert.equal(r.body.lang, "de");
  assert.equal(r.body.auto, false);
  assert.equal(r.body.count, 3);
  assert.match(r.headers["Cache-Control"], /s-maxage=86400/);
});

test("서버: 영상 페이지가 막히면 플레이어 API 로", async () => {
  const seen = [];
  const r = await withFetch(
    (u) => {
      seen.push(u);
      if (u.includes("/watch?")) return null;
      if (u.includes("youtubei")) return { captions: { playerCaptionsTracklistRenderer: { captionTracks: [{ baseUrl: TRACK, languageCode: "de" }] } } };
      return u.includes("fmt=json3") ? JSON3 : null;
    },
    () => run("/api/listen-captions?v=AAAAAAAAAAA"),
  );
  assert.equal(r.body.count, 3);
  assert.ok(seen.some((u) => u.includes("youtubei")));
});

test("서버: 둘 다 막히면 502 와 어느 단계에서 막혔는지", async () => {
  const r = await withFetch(() => null, () => run("/api/listen-captions?v=AAAAAAAAAAA"));
  assert.equal(r.statusCode, 502);
  assert.equal(r.body.tried.length, 4);
  assert.match(r.body.tried[0].note, /404/);
});

test("서버: 트랙이 비어 오면 재생 상태를 이유로 적는다", async () => {
  const r = await withFetch(
    (u) => (u.includes("youtubei") ? { playabilityStatus: { status: "LOGIN_REQUIRED", reason: "Sign in to confirm you're not a bot" } } : "<html></html>"),
    () => run("/api/listen-captions?v=AAAAAAAAAAA"),
  );
  assert.equal(r.statusCode, 502);
  assert.equal(r.body.tried[0].note, "플레이어 응답 없음");
  assert.match(r.body.tried[1].note, /LOGIN_REQUIRED · Sign in to confirm/);
});

test("서버: 앞 방식이 비어도 다음 클라이언트에서 받으면 성공", async () => {
  const r = await withFetch(
    (u, init) => {
      if (u.includes("/watch?")) return "<html></html>";
      if (u.includes("youtubei")) {
        const ok = JSON.parse(init.body).context.client.clientName === "IOS";
        return { captions: ok ? { playerCaptionsTracklistRenderer: { captionTracks: [{ baseUrl: TRACK, languageCode: "de" }] } } : undefined };
      }
      return u.includes("fmt=json3") ? JSON3 : null;
    },
    () => run("/api/listen-captions?v=AAAAAAAAAAA"),
  );
  assert.equal(r.body.count, 3);
  assert.equal(r.body.via, "플레이어 API(IOS)");
});

test("서버: 영상 ID 검사 · 붙여넣기(POST)", async () => {
  const bad = await run("/api/listen-captions?v=../etc");
  assert.equal(bad.statusCode, 400);
  const ok = await run("/api/listen-captions", { method: "POST", body: { text: "0:01\nHallo Welt.\n0:04\nTschüss." } });
  assert.equal(ok.body.source, "paste");
  assert.equal(ok.body.count, 2);
  const empty = await run("/api/listen-captions", { method: "POST", body: { text: "글만 있어요" } });
  assert.equal(empty.statusCode, 400);
});
