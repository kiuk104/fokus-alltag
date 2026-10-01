// npm test — 파서는 2026-09-28 실제 페이지 구조를 줄여 옮긴 조각으로, 서버 함수는 fetch 를 가짜로 바꿔 검사한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRss, parseYoutube, parseLeichtHome, parseLeichtArticle, parseDwText, textOf } from "./_listen-parse.js";
import handler from "./listen.js";

const RSS = `<rss><channel><title>DW</title>
<item><guid>1</guid><pubDate>Sat, 26 Sep 2026 09:26:00 GMT</pubDate><title>26.09.2026 – Langsam Gesprochene Nachrichten</title>
<link>https://learngerman.dw.com/de/26-09-2026-lgn/a-1?maca=x</link><description>&lt;p&gt;…&lt;/p&gt;</description>
<enclosure url="https://radiodownloader.dw.com/mp3/x.mp3?a=1&amp;b=2" type="audio/mpeg" length="1"/></item>
<item><title>ohne Audio</title></item></channel></rss>`;

const YT = `<feed><title>Easy German</title>
<entry><yt:videoId>AAAAAAAAAAA</yt:videoId><title>Pipi #easygermanpodcast</title><link rel="alternate" href="https://www.youtube.com/shorts/AAAAAAAAAAA"/><published>2026-09-28T10:00:00+00:00</published></entry>
<entry><yt:videoId>BBBBBBBBBBB</yt:videoId><title>Learn German in Linz &amp; Local Life</title><link rel="alternate" href="https://www.youtube.com/watch?v=BBBBBBBBBBB"/><published>2026-09-27T10:00:00+00:00</published></entry>
</feed>`;

const LEICHT_HOME = `<header><a href="/benutzung-100.html">Hilfe</a></header>
<article class="b-teaser-large"><a href="https://www.nachrichtenleicht.de/papst-leo-100.html?x=1"><span class="headline-title">Papst Leo feiert Messe</span></a></article>
<article class="b-teaser-column"><a href="/wadephul-100.html"><h3>Wadephul trifft Lawrow</h3></a></article>
<article class="b-teaser-column"><a href="/papst-leo-100.html">doppelt</a></article>
<article class="x"><a href="/erklaerung-100.html">Erklärung</a></article>`;

const LEICHT_ART = `<meta property="og:title" content="Papst Leo feiert Messe mit 800.000 Menschen">
<button class="b-button" data-audio="https://ondemand-mp3.dradio.de/file/dradio/2026/09/28/papst_dlf.mp3?x=1">Hören</button>
<section class="b-article-details">
<div class="article-details-text u-text">Mit seinem Papamobil ist der Papst gefahren. Eine gro&szlig;e Menge.</div>
<div class="article-details-text"><p>Der Papst hat auch gesprochen.</p><p>Zweiter Absatz.</p></div>
</section>
<div class="b-teaser-word is-x"><article><h4>Papst</h4><p>Der Papst leitet die Kirche.</p></article></div>
<div class="b-teaser-word"><article><h4>Messe</h4><p>Ein Gottesdienst.</p></article></div>`;

const DW_PAGE = `<html><script>window.__APOLLO_STATE__=${JSON.stringify({
  ROOT_QUERY: { a: { text: "<p>kurz</p>" } },
  "Article:1": { text: "<h2>Trump lehnt Vorschlag ab</h2>\n<p>Der Iran hat &quot;etwas&quot; vorgeschlagen.<br>Ende.</p><h2>USA und China</h2><p>Kanal für KI.</p>" },
})};</script></html>`;

test("RSS: 최신 편, 오디오 없는 편은 뺀다, &amp; 풀기", () => {
  const [ep, ...rest] = parseRss(RSS);
  assert.equal(rest.length, 0);
  assert.equal(ep.title, "26.09.2026 – Langsam Gesprochene Nachrichten");
  assert.equal(ep.audio, "https://radiodownloader.dw.com/mp3/x.mp3?a=1&b=2");
  assert.ok(ep.link.startsWith("https://learngerman.dw.com/"));
});

test("YouTube: 쇼츠는 뺀다", () => {
  const v = parseYoutube(YT);
  assert.deepEqual(v.map((x) => x.id), ["BBBBBBBBBBB"]);
  assert.equal(v[0].title, "Learn German in Linz & Local Life");
});

test("Nachrichtenleicht 첫 화면: 기사만, 중복·안내 페이지 제외, 순서 유지", () => {
  assert.deepEqual(parseLeichtHome(LEICHT_HOME), [
    { path: "/papst-leo-100.html", title: "Papst Leo feiert Messe" },
    { path: "/wadephul-100.html", title: "Wadephul trifft Lawrow" },
  ]);
});

test("Nachrichtenleicht 기사: 제목·mp3·본문 단락·낱말 풀이", () => {
  const a = parseLeichtArticle(LEICHT_ART);
  assert.equal(a.title, "Papst Leo feiert Messe mit 800.000 Menschen");
  assert.equal(a.audio, "https://ondemand-mp3.dradio.de/file/dradio/2026/09/28/papst_dlf.mp3");
  assert.deepEqual(a.paras, ["Mit seinem Papamobil ist der Papst gefahren. Eine große Menge.", "Der Papst hat auch gesprochen.", "Zweiter Absatz."]);
  assert.deepEqual(a.words.map((w) => w.term), ["Papst", "Messe"]);
});

test("DW: 가장 긴 원고를 소제목+본문으로", () => {
  assert.deepEqual(parseDwText(DW_PAGE), [
    { h: "Trump lehnt Vorschlag ab", p: 'Der Iran hat "etwas" vorgeschlagen. Ende.' },
    { h: "USA und China", p: "Kanal für KI." },
  ]);
  assert.deepEqual(parseDwText("<html>nothing</html>"), []);
});

test("textOf: 태그·공백 정리", () => {
  assert.equal(textOf(" <b>a</b>\n <i>b</i>&nbsp;c "), "a b c");
});

// ── 서버 함수 ──────────────────────────────────────────────
function fakeRes() {
  return {
    statusCode: 200, headers: {}, body: "",
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(b) { this.body = b; },
  };
}
async function call(url, pages) {
  const orig = globalThis.fetch;
  globalThis.fetch = async (u) => {
    const key = Object.keys(pages).find((k) => String(u).startsWith(k));
    return key ? { ok: true, status: 200, text: async () => pages[key] } : { ok: false, status: 404, text: async () => "" };
  };
  try {
    const res = fakeRes();
    await handler({ url }, res);
    return { status: res.statusCode, json: JSON.parse(res.body), headers: res.headers };
  } finally {
    globalThis.fetch = orig;
  }
}

test("GET /api/listen?src=dw → 오디오 + 원고", async () => {
  const r = await call("/api/listen?src=dw", { "https://rss.dw.com": RSS, "https://learngerman.dw.com": DW_PAGE });
  assert.equal(r.status, 200);
  assert.equal(r.json.kind, "audio");
  assert.equal(r.json.script.length, 2);
  assert.match(r.headers["cache-control"], /s-maxage/);
});

test("GET /api/listen?src=leicht&item=… → 고른 기사, 목록 함께", async () => {
  const r = await call("/api/listen?src=leicht&item=/wadephul-100.html", {
    "https://www.nachrichtenleicht.de/wadephul": LEICHT_ART,
    "https://www.nachrichtenleicht.de/": LEICHT_HOME,
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.item, "/wadephul-100.html");
  assert.equal(r.json.list.length, 2);
  assert.equal(r.json.script.length, 3);
});

test("GET /api/listen?src=easy → 영상 id, 자막 가림 표시", async () => {
  const r = await call("/api/listen?src=easy", { "https://www.youtube.com": YT });
  assert.equal(r.json.kind, "video");
  assert.equal(r.json.videoId, "BBBBBBBBBBB");
  assert.equal(r.json.burnedSubs, true);
});

test("잘못된 src → 400, 사이트 오류 → 502", async () => {
  assert.equal((await call("/api/listen?src=nope", {})).status, 400);
  assert.equal((await call("/api/listen?src=tagesschau", {})).status, 502);
});

test("item 에 이상한 경로를 넣어도 첫 기사로", async () => {
  const r = await call("/api/listen?src=leicht&item=../../etc", {
    "https://www.nachrichtenleicht.de/papst": LEICHT_ART,
    "https://www.nachrichtenleicht.de/": LEICHT_HOME,
  });
  assert.equal(r.json.item, "/papst-leo-100.html");
});

test("YouTube 채널 페이지 → 영상 목록 (RSS 가 막힐 때)", async () => {
  const { parseYoutubePage } = await import("./_listen-parse.js");
  const html = 'x"videoRenderer":{"videoId":"abcdefghijk","thumbnail":{},"title":{"runs":[{"text":"Wie sagt man \\"Tschüss\\"? | Easy German 500"}]}}' +
    '"videoRenderer":{"videoId":"abcdefghijk","title":{"runs":[{"text":"dup"}]}}' +
    '"videoRenderer":{"videoId":"ZZZZZZZZZZZ","title":{"runs":[{"text":"Kurz #shorts"}]}}' +
    '"videoRenderer":{"videoId":"B1b2B3b4B5b","x":1,"title":{"runs":[{"text":"Berlin"}]}}';
  const v = parseYoutubePage(html);
  assert.deepEqual(v.map((x) => [x.id, x.title]), [["abcdefghijk", 'Wie sagt man "Tschüss"? | Easy German 500'], ["B1b2B3b4B5b", "Berlin"]]);
});

test("Nachrichtenleicht: 맨 위 기사에 소리가 없으면 소리 있는 다음 기사를 고른다", async () => {
  const noAudio = LEICHT_ART.replace(/data-audio="[^"]+"/, "");
  const pages = {
    "https://www.nachrichtenleicht.de/papst": noAudio, // 맨 위: 글만 있음
    "https://www.nachrichtenleicht.de/wadephul": LEICHT_ART,
    "https://www.nachrichtenleicht.de/": LEICHT_HOME,
  };
  const r = await call("/api/listen?src=leicht", pages);
  assert.equal(r.json.item, "/wadephul-100.html");
  assert.match(r.json.audio, /papst_dlf\.mp3/);
  assert.equal(r.json.noAudio, false);
  assert.equal(r.json.list.length, 2); // 목록에는 둘 다 남아 있어 직접 고를 수 있다

  // 직접 고른 기사에 소리가 없으면 그대로 두고 noAudio 로 알린다
  const picked = await call("/api/listen?src=leicht&item=/papst-leo-100.html", pages);
  assert.equal(picked.json.item, "/papst-leo-100.html");
  assert.equal(picked.json.audio, "");
  assert.equal(picked.json.noAudio, true);
  assert.equal(picked.json.script.length, 3);

  // 소리 있는 기사가 하나도 없으면 맨 위 기사 + noAudio
  const none = await call("/api/listen?src=leicht", { "https://www.nachrichtenleicht.de/": LEICHT_HOME, "https://www.nachrichtenleicht.de/papst": noAudio, "https://www.nachrichtenleicht.de/wadephul": noAudio });
  assert.equal(none.json.item, "/papst-leo-100.html");
  assert.equal(none.json.noAudio, true);
});
