// 유튜브 자막 파서 — 순수 함수만 (네트워크 없음). api/listen-captions.js 가 받아 온 글을 여기서 해석한다.
// 파일 이름이 _ 로 시작하면 Vercel 이 이 파일을 API 경로로 만들지 않는다.
//
// 흐름: 자막 원문(json3 · XML · SRT · 붙여넣은 스크립트) → cues [{ start, end, text }] (초 단위)
//       → sentencesFromCues → 문장 [{ i, start, end, text }]  (듣기 화면의 "문장 반복·이동"이 쓰는 구간)
// 실패해도 예외를 던지지 않고 빈 배열을 돌려준다.

import { decode } from "./_listen-parse.js";

const clean = (s) =>
  decode(String(s || ""))
    .replace(/\[[^\]]*\]/g, " ") // [Musik] [Applaus] 같은 소리 표시
    .replace(/\s+/g, " ")
    .trim();

const sec = (ms) => Math.round(ms) / 1000;

// ── 자막 원문 → cues ────────────────────────────────────────────────────────

/** timedtext fmt=json3 → cues. events[].segs[].utf8 를 이어 붙인다. */
export function parseJson3(raw) {
  let j;
  try {
    j = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return [];
  }
  const out = [];
  for (const e of j?.events || []) {
    if (!Array.isArray(e.segs)) continue;
    const text = clean(e.segs.map((s) => s.utf8 || "").join(""));
    if (!text) continue;
    const start = sec(e.tStartMs || 0);
    out.push({ start, end: sec((e.tStartMs || 0) + (e.dDurationMs || 0)), text });
  }
  return out;
}

/** timedtext XML → cues. 예전 모양 <text start dur> 와 srv3 모양 <p t d> 를 모두 읽는다. */
export function parseTimedTextXml(xml) {
  const s = String(xml || "");
  const attr = (a, k) => (a.match(new RegExp(`\\b${k}="([\\d.]+)"`)) || [])[1];
  const out = [];
  for (const m of s.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
    const text = clean(m[2].replace(/<[^>]+>/g, ""));
    const start = attr(m[1], "start");
    if (text && start != null) out.push({ start: +start, end: +start + (+attr(m[1], "dur") || 0), text });
  }
  if (out.length) return out;
  for (const m of s.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)) {
    const text = clean(m[2].replace(/<[^>]+>/g, ""));
    const t = attr(m[1], "t");
    if (text && t != null) out.push({ start: sec(+t), end: sec(+t + (+attr(m[1], "d") || 0)), text });
  }
  return out;
}

const toSec = (t) => {
  const p = String(t).replace(",", ".").split(":").map(Number);
  return p.reduce((a, x) => a * 60 + x, 0);
};

/** SRT / WebVTT → cues */
export function parseSrt(text) {
  const out = [];
  const re = /((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})[^\n]*\n([\s\S]*?)(?=\n\s*\n|$)/g;
  for (const m of String(text || "").replace(/\r/g, "").matchAll(re)) {
    const t = clean(m[3].replace(/<[^>]+>/g, " "));
    if (t) out.push({ start: toSec(m[1]), end: toSec(m[2]), text: t });
  }
  return out;
}

/**
 * 유튜브 "스크립트 열기"를 복사해 붙인 글 → cues.
 * 시각 줄("0:05" 또는 "1:02:03")과 글 줄이 번갈아 나온다. 끝 시각이 없어서 다음 시각을 끝으로 쓴다.
 * SRT/VTT 모양이면 그쪽으로 읽는다.
 */
// 크롬은 시각 옆에 스크린리더용 라벨을 같이 복사한다: "0:07" + "7초", "1:02" + "1분 2초", "1:02:03" + "1시간 2분 3초"
const LABEL = "(?:\\d+\\s*(?:시간|분|초|hours?|minutes?|seconds?|Std\\.?|Min\\.?|Sek\\.?)[,\\s]*)+";
const JUNK = /^(동영상 시간 동기화|Sync to video time|Mit Videozeit synchronisieren)$/i;

export function parseTranscriptPaste(text) {
  const s = String(text || "");
  if (/-->/.test(s)) return parseSrt(s);
  const out = [];
  let cur = null;
  for (const line of s.replace(/\r/g, "").split("\n")) {
    const l = line.trim();
    if (!l) continue;
    if (JUNK.test(l)) continue;
    const t = l.match(/^(\d{1,2}(?::\d{2}){1,2})$/); // 시각만 있는 줄
    // "0:05 글" 또는 크롬 복사 "0:077초글"(시각 + 읽어 주는 라벨 "7초" 가 붙어 나온다) 한 줄 모양
    const inline = !t && l.match(new RegExp(`^(\\d{1,2}(?::\\d{2}){1,2})(?:\\s+|${LABEL}(?=\\S))(\\S.*)$`));
    if (t || inline) {
      if (cur?.text) out.push(cur);
      cur = { start: toSec((t || inline)[1]), end: 0, text: inline ? clean(inline[2]) : "" };
    } else if (cur) {
      cur.text = clean(`${cur.text} ${l}`);
    }
  }
  if (cur?.text) out.push(cur);
  for (let i = 0; i < out.length; i++) out[i].end = out[i + 1] ? out[i + 1].start : out[i].start + 4;
  return out;
}

// ── 영상 페이지 / 플레이어 응답 → 자막 트랙 ─────────────────────────────────

/** 영상 페이지 HTML 안의 "captionTracks":[…] → [{ url, lang, auto }] */
export function parseCaptionTracks(html) {
  const m = String(html || "").match(/"captionTracks":(\[[\s\S]*?\])\s*,\s*"(?:audioTracks|translationLanguages|defaultAudioTrackIndex)"/);
  if (!m) return [];
  try {
    return tracksOf(JSON.parse(m[1]));
  } catch {
    return [];
  }
}

/** 플레이어 응답 JSON(youtubei) → 자막 트랙 */
export function tracksFromPlayer(json) {
  return tracksOf(json?.captions?.playerCaptionsTracklistRenderer?.captionTracks || []);
}

const tracksOf = (arr) =>
  (Array.isArray(arr) ? arr : [])
    .map((t) => ({ url: String(t.baseUrl || ""), lang: String(t.languageCode || ""), auto: t.kind === "asr" }))
    .filter((t) => /^https:\/\/(www\.)?youtube\.com\/api\/timedtext/.test(t.url)); // 엉뚱한 주소로 나가지 않게

/** 독일어 트랙 고르기 — 사람이 만든 자막(de) > 자동 자막(de). 독일어가 없으면 null */
export function pickGermanTrack(tracks) {
  const de = (tracks || []).filter((t) => /^de(-|$)/i.test(t.lang));
  return de.find((t) => !t.auto) || de[0] || null;
}

// ── cues → 문장 ─────────────────────────────────────────────────────────────

// 마침표가 있어도 문장이 끝난 게 아닌 말
const ABBR = /^(z\.?\s?b|d\.?\s?h|u\.?\s?a|o\.?\s?ä|bzw|ca|usw|etc|vgl|Dr|Prof|Nr|St|Hr|Fr|Str|Tel)\.$/i;
const ENDS = /[.!?…]["“”„»«')\]]*$/;

const endsSentence = (w) => ENDS.test(w) && !ABBR.test(w) && !/^\d+\.$/.test(w) && !/^[A-ZÄÖÜ]\.$/.test(w);

/**
 * cues → 문장 구간. 자막 줄은 화면 길이로 끊겨 있어서 문장과 안 맞는다 —
 * 글자 수에 비례해 낱말마다 시각을 나눈 뒤, 마침표·물음표·느낌표로 문장을 잘라 시작~끝을 다시 정한다.
 *  - 문장 앞의 "- " (말하는 사람 바뀜 표시)는 뺀다
 *  - 자동 자막처럼 문장부호가 없으면, 줄 사이가 gap 초 넘게 비거나 maxChars 를 넘을 때 끊는다
 *  - 앞뒤로 pad 초 여유를 주되 이웃 문장과 겹치면 그 사이 가운데에서 나눈다
 */
export function sentencesFromCues(cues, { pad = 0.3, gap = 1.2, maxChars = 200 } = {}) {
  const words = [];
  let prevEnd = -1;
  for (const c of cues || []) {
    const ws = String(c.text || "")
      .split(/\s+/)
      .filter((w) => w && w !== "-" && w !== "–");
    if (!ws.length) continue;
    const dur = Math.max(0, (c.end || c.start) - c.start);
    const total = ws.reduce((a, w) => a + w.length + 1, 0);
    let acc = 0;
    ws.forEach((w, k) => {
      words.push({
        w: k === 0 ? w.replace(/^[-–]\s*/, "") : w,
        s: c.start + (dur * acc) / total,
        e: c.start + (dur * (acc + w.length + 1)) / total,
        // 이 낱말이 새 줄의 첫 낱말이고 앞 줄과 오래 떨어져 있으면 여기서 끊는다
        brk: k === 0 && prevEnd >= 0 && c.start - prevEnd > gap,
      });
      acc += w.length + 1;
    });
    prevEnd = c.end || c.start + dur;
  }

  const raw = [];
  let buf = [];
  const flush = () => {
    if (!buf.length) return;
    raw.push({ start: buf[0].s, end: buf[buf.length - 1].e, text: buf.map((x) => x.w).join(" ") });
    buf = [];
  };
  for (const x of words) {
    if (x.brk) flush();
    buf.push(x);
    const len = buf.reduce((a, y) => a + y.w.length + 1, 0);
    if (endsSentence(x.w) || len >= maxChars) flush();
  }
  flush();

  const out = raw.map((r) => ({ ...r, start: Math.max(0, r.start - pad), end: r.end + pad }));
  for (let i = 0; i + 1 < out.length; i++) {
    if (out[i].end > out[i + 1].start) {
      const mid = (raw[i].end + raw[i + 1].start) / 2;
      out[i].end = mid;
      out[i + 1].start = mid;
    }
  }
  return out.map((s, i) => ({ i, start: Math.round(s.start * 100) / 100, end: Math.round(s.end * 100) / 100, text: s.text }));
}
