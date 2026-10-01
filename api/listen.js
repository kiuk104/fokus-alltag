// GET /api/listen?src=leicht|dw|tagesschau|easy[&item=<Nachrichtenleicht 기사 경로>]
//
// 듣기 출처의 최신 편을 받아 앱이 바로 틀 수 있는 모양으로 돌려준다.
// 브라우저가 이 사이트들을 직접 읽으면 CORS 에 막혀서, 서버에서 대신 받아 온다.
// 소리 파일(mp3)과 영상은 브라우저가 원래 주소에서 직접 튼다 — 여기서는 주소와 원고만 넘긴다.
//
// 응답: { src, kind: "audio"|"video", title, date, audio?, videoId?, link, script: [{h,p}], words: [{term,expl}], list? }
// 로그인 확인은 하지 않는다: 공개 방송의 최신 편 주소를 알려 줄 뿐이고, 키·개인 데이터가 오가지 않는다.

import { parseRss, parseYoutube, parseYoutubePage, parseLeichtHome, parseLeichtArticle, parseDwText } from "./_listen-parse.js";

const FEEDS = {
  dw: "https://rss.dw.com/xml/DKpodcast_lgn_de",
  tagesschau: "https://www.tagesschau.de/multimedia/sendung/tagesschau_in_100_sekunden/podcast-ts100-audio-100~podcast.xml",
  easy: "https://www.youtube.com/feeds/videos.xml?channel_id=UCbxb2fqe9oNgglAoYqsYOtQ",
  // 채널 RSS 는 데이터센터(Vercel)에서 부르면 가끔 404 를 준다(2026-09-30 배포본에서 확인).
  // 같은 목록을 얻는 다른 길 둘: 업로드 재생목록 RSS(UC → UU), 채널 영상 페이지.
  easyPlaylist: "https://www.youtube.com/feeds/videos.xml?playlist_id=UUbxb2fqe9oNgglAoYqsYOtQ",
  easyPage: "https://www.youtube.com/@EasyGerman/videos",
  leicht: "https://www.nachrichtenleicht.de",
};

async function get(url) {
  const r = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (FokusAlltag personal learning app)", "Accept-Language": "de-DE,de;q=0.9" },
    redirect: "follow",
  });
  if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`);
  return r.text();
}

// 새 기사는 글이 먼저 올라오고 소리 파일이 몇 시간 늦게 붙는다(2026-09-30 확인: 맨 위 기사만 소리 없음).
// 기사를 따로 고르지 않았으면 위에서부터 소리가 있는 첫 기사를 고른다. 고른 기사에 소리가 없으면 noAudio 로 알린다.
const LEICHT_TRIES = 4;

async function leicht(itemPath) {
  const list = parseLeichtHome(await get(FEEDS.leicht + "/"));
  const chosen = itemPath && /^\/[a-z0-9-]+-100\.html$/.test(itemPath) ? itemPath : null;
  const order = chosen ? [chosen] : list.slice(0, LEICHT_TRIES).map((x) => x.path);
  if (!order.length) throw new Error("오늘 기사를 찾지 못했어요");
  let path = order[0];
  let a = null;
  for (const p of order) {
    const art = parseLeichtArticle(await get(FEEDS.leicht + p));
    if (!a) {
      a = art;
      path = p; // 소리 있는 기사가 하나도 없으면 맨 위 기사로 간다
    }
    if (art.audio) {
      a = art;
      path = p;
      break;
    }
  }
  return {
    kind: "audio",
    title: a.title || list.find((x) => x.path === path)?.title || "",
    date: "",
    audio: a.audio,
    noAudio: !a.audio,
    link: FEEDS.leicht + path,
    script: a.paras.map((p) => ({ h: "", p })),
    words: a.words,
    list: list.map((x) => ({ item: x.path, title: x.title })),
    item: path,
  };
}

async function dw() {
  const [ep] = parseRss(await get(FEEDS.dw), 1);
  if (!ep) throw new Error("DW 최신 편을 찾지 못했어요");
  let script = [];
  try {
    if (ep.link) script = parseDwText(await get(ep.link.replace(/\?.*$/, "")));
  } catch {
    /* 원고를 못 받아도 소리는 들을 수 있다 */
  }
  return { kind: "audio", title: ep.title, date: ep.date, audio: ep.audio, link: ep.link, script, words: [] };
}

async function tagesschau() {
  const [ep] = parseRss(await get(FEEDS.tagesschau), 1);
  if (!ep) throw new Error("tagesschau 최신 편을 찾지 못했어요");
  // 원고가 없는 출처 — 스크립트는 2단계(AI 받아쓰기)에서
  return { kind: "audio", title: ep.title, date: ep.date, audio: ep.audio, link: "https://www.tagesschau.de/", script: [], words: [] };
}

// 업로드 재생목록 — 서버가 목록을 하나도 못 받으면 앱이 이 재생목록을 통째로 끼워 튼다(최신 영상이 맨 앞)
const EASY_UPLOADS = "UUbxb2fqe9oNgglAoYqsYOtQ";

async function easyList() {
  const tries = [
    () => get(FEEDS.easy).then((x) => parseYoutube(x, 5)),
    () => get(FEEDS.easyPlaylist).then((x) => parseYoutube(x, 5)),
    () => get(FEEDS.easyPage).then((x) => parseYoutubePage(x, 5)),
  ];
  for (const t of tries) {
    try {
      const v = await t();
      if (v.length) return v;
    } catch {
      /* 다음 길로 */
    }
  }
  return [];
}

async function easy() {
  const vids = await easyList();
  if (!vids.length) {
    return {
      kind: "video", title: "Easy German — 최신 영상", date: "", playlist: EASY_UPLOADS,
      link: "https://www.youtube.com/@EasyGerman/videos", script: [], words: [], burnedSubs: true, list: [],
    };
  }
  const v = vids[0];
  return {
    kind: "video",
    title: v.title,
    date: v.date,
    videoId: v.id,
    link: `https://www.youtube.com/watch?v=${v.id}`,
    script: [],
    words: [],
    burnedSubs: true, // 자막이 화면에 박혀 있다 → 앱이 가림 띠로 가린다
    list: vids.map((x) => ({ item: x.id, title: x.title })),
  };
}

const HANDLERS = { leicht, dw, tagesschau, easy };

export default async function handler(req, res) {
  const url = new URL(req.url, "http://x");
  const src = url.searchParams.get("src");
  const item = url.searchParams.get("item");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  const fn = HANDLERS[src];
  if (!fn) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: "src 는 leicht · dw · tagesschau · easy 중 하나" }));
  }
  try {
    const data = await fn(item);
    // 같은 편을 여러 번 받지 않게 — Vercel 가장자리에서 30분, 그 뒤엔 옛것을 주면서 새로 받는다
    res.setHeader("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=3600");
    res.end(JSON.stringify({ src, ...data }));
  } catch (e) {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: e?.message || String(e) }));
  }
}
