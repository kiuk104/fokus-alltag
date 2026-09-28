// 듣기 출처 파서 — 순수 함수만 (네트워크 없음). api/listen.js 가 받아 온 글을 여기서 해석한다.
// 파일 이름이 _ 로 시작하면 Vercel 이 이 파일을 API 경로로 만들지 않는다.
//
// 모두 2026-09-28 에 실제 페이지로 확인한 구조다. 사이트가 바뀌면 여기만 고친다.
// 실패해도 예외를 던지지 않고 빈 값을 돌려준다 — 화면은 "원고를 못 가져왔어요 · 사이트에서 보기"로 버틴다.

// 독일어 페이지에 흔한 이름 붙은 문자들. 대소문자가 다른 글자(Auml/auml)가 있어 이름 그대로 찾는다.
const ENT = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß",
  ndash: "–", mdash: "—", bdquo: "„", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’",
  laquo: "«", raquo: "»", hellip: "…", euro: "€", shy: "",
};
export const decode = (s) =>
  String(s || "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, n) => ENT[n] ?? ENT[n.toLowerCase()] ?? m);

/** HTML 조각 → 글자만 (줄바꿈 태그는 띄어쓰기로) */
export const textOf = (html) =>
  decode(String(html || "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();

const pick = (s, re) => (s.match(re) || [])[1];

// ── RSS / Atom ──────────────────────────────────────────────────────────────

/** 팟캐스트 RSS → 최신 편들 [{ title, date, audio, link }] */
export function parseRss(xml, limit = 5) {
  return String(xml || "")
    .split(/<item[\s>]/)
    .slice(1, limit + 1)
    .map((it) => ({
      title: textOf(pick(it, /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)),
      date: pick(it, /<pubDate>([^<]+)<\/pubDate>/) || "",
      audio: decode(pick(it, /<enclosure[^>]*\surl="([^"]+)"/) || ""),
      link: decode((pick(it, /<link>([^<]+)<\/link>/) || "").trim()),
    }))
    .filter((x) => x.audio);
}

/** YouTube 채널 Atom → 최신 영상들 (쇼츠는 뺀다 — 몇십 초짜리라 듣기 연습이 안 된다) */
export function parseYoutube(xml, limit = 5) {
  return String(xml || "")
    .split("<entry>")
    .slice(1)
    .map((e) => ({
      id: pick(e, /<yt:videoId>([^<]+)<\/yt:videoId>/),
      title: textOf(pick(e, /<title>([\s\S]*?)<\/title>/)),
      date: pick(e, /<published>([^<]+)<\/published>/) || "",
      href: pick(e, /<link[^>]*rel="alternate"[^>]*href="([^"]+)"/) || pick(e, /<link[^>]*href="([^"]+)"/) || "",
    }))
    .filter((v) => v.id && !/\/shorts\//.test(v.href) && !/#shorts/i.test(v.title))
    .slice(0, limit);
}

// ── Nachrichtenleicht ───────────────────────────────────────────────────────

const LEICHT_SKIP = /^\/(benutzung|erklaerung|regionale-angebote|nachrichtenleicht-[a-z-]+|impressum|datenschutz|kontakt)-100\.html$/;

/** 첫 화면 → 오늘 기사 목록 [{ path, title }] (화면 위쪽 = 최신) */
export function parseLeichtHome(html, limit = 6) {
  const out = [];
  const seen = new Set();
  for (const chunk of String(html || "").split("<article").slice(1)) {
    const href = pick(chunk, /href="(?:https:\/\/www\.nachrichtenleicht\.de)?(\/[a-z0-9-]+-100\.html)[^"]*"/);
    if (!href || seen.has(href) || LEICHT_SKIP.test(href)) continue;
    seen.add(href);
    const title =
      textOf(pick(chunk, /<span[^>]*class="[^"]*headline-title[^"]*"[^>]*>([\s\S]*?)<\/span>/)) ||
      textOf(pick(chunk, /<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/));
    out.push({ path: href, title });
    if (out.length >= limit) break;
  }
  return out;
}

/** 기사 → { title, audio, paras[], words[{ term, expl }] } */
export function parseLeichtArticle(html) {
  const h = String(html || "");
  const title = textOf(pick(h, /<meta[^>]*property="og:title"[^>]*content="([^"]*)"/)) || textOf(pick(h, /<h1[^>]*>([\s\S]*?)<\/h1>/));
  const audio = decode(pick(h, /data-audio="(https:[^"]+?\.mp3)[^"]*"/) || pick(h, /(https:\/\/ondemand-mp3\.dradio\.de\/[^"'\s&]+?\.mp3)/) || "");

  // 본문: class="article-details-text …" 블록들. 블록 안에 div 가 겹치지 않는 구조라 다음 </div> 까지가 한 블록이다.
  const paras = [];
  const re = /<div[^>]*class="[^"]*\barticle-details-text\b[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
  for (let m; (m = re.exec(h)); ) {
    // 블록 안의 <p> 를 나눠 담는다 (없으면 블록 통째로)
    const ps = [...m[1].matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((x) => textOf(x[1])).filter(Boolean);
    paras.push(...(ps.length ? ps : [textOf(m[1])].filter(Boolean)));
  }

  // 낱말 풀이(Wörterbuch) — 쉬운 독일어 뜻풀이라 그대로 좋은 교재다
  const words = [];
  const wre = /class="[^"]*\bb-teaser-word\b[^"]*"[^>]*>([\s\S]*?)<\/(?:article|section|div)>\s*<\/(?:article|section|div|li)>/g;
  for (let m; (m = wre.exec(h)) && words.length < 12; ) {
    const term = textOf(pick(m[1], /<h[2-5][^>]*>([\s\S]*?)<\/h[2-5]>/) || pick(m[1], /<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/));
    const expl = textOf(pick(m[1], /<p[^>]*>([\s\S]*?)<\/p>/));
    if (term && expl && !words.some((w) => w.term === term)) words.push({ term, expl });
  }
  return { title, audio, paras, words };
}

// ── DW Langsam gesprochene Nachrichten ──────────────────────────────────────

/** DW 기사 페이지 → [{ h, p }] (소제목 + 본문). 원고는 window.__APOLLO_STATE__ 안의 "text" HTML 에 있다. */
export function parseDwText(html) {
  const m = String(html || "").match(/window\.__APOLLO_STATE__\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/);
  if (!m) return [];
  let best = "";
  try {
    const walk = (o) => {
      if (!o || typeof o !== "object") return;
      for (const [k, v] of Object.entries(o)) {
        if (k === "text" && typeof v === "string" && v.includes("<h2>") && v.length > best.length) best = v;
        else if (v && typeof v === "object") walk(v);
      }
    };
    walk(JSON.parse(m[1]));
  } catch {
    return [];
  }
  const blocks = [];
  for (const x of best.matchAll(/<(h2|p)[^>]*>([\s\S]*?)<\/\1>/g)) {
    const t = textOf(x[2]);
    if (!t) continue;
    if (x[1] === "h2") blocks.push({ h: t, p: "" });
    else if (blocks.length && !blocks[blocks.length - 1].p) blocks[blocks.length - 1].p = t;
    else blocks.push({ h: "", p: t });
  }
  return blocks.filter((b) => b.p || b.h);
}
