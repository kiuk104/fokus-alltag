// 영상 자막(붙여넣은 것) → 문장 구간 · 영상별 저장.
//
// 서버가 유튜브 자막을 직접 받는 길은 막혀 있다(2026-10-01 확인: 데이터센터 주소에는 봇 확인을 요구한다).
// 그래서 사용자가 유튜브의 "스크립트 표시"를 복사해 붙여넣고, 여기서 문장으로 나눈다.
// 나누는 규칙은 api/_captions-parse.js 에 한 벌만 둔다 — 서버(POST /api/listen-captions)와 같은 코드를 쓴다.
//
// 저장은 이 기기의 localStorage (fa- 접두사). 영상마다 한 번만 붙이면 된다. 다른 기기에서는 다시 붙여야 한다.

import { parseTranscriptPaste, sentencesFromCues } from "../../api/_captions-parse.js";

const key = (id) => `fa-caps-${id}`;

/** 붙여넣은 글 → 문장 [{ i, start, end, text }]. 시각이 없으면 빈 배열 */
export function parseCaptionText(text) {
  return sentencesFromCues(parseTranscriptPaste(String(text || "").slice(0, 200000)));
}

export function loadCaptions(videoId) {
  if (!videoId) return [];
  try {
    const j = JSON.parse(localStorage.getItem(key(videoId)));
    return Array.isArray(j?.sentences) ? j.sentences : [];
  } catch {
    return [];
  }
}

export function saveCaptions(videoId, sentences) {
  try {
    localStorage.setItem(key(videoId), JSON.stringify({ v: 1, at: new Date().toISOString(), sentences }));
    return true;
  } catch {
    return false;
  }
}

export function clearCaptions(videoId) {
  try {
    localStorage.removeItem(key(videoId));
  } catch {
    /* 무시 */
  }
}
