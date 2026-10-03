// 듣기 갈무리(🔖) — 순수 함수 (테스트: clips.test.mjs). 저장은 clipsRepo.js.

/**
 * 원고 문장 중 이 구간 근처에 있을 법한 것 (위치 비율로 어림) — 고를 때 맨 위에 보여 준다.
 * 소리는 쉼으로 나눴고 원고는 마침표로 나눠서 정확히 맞출 수는 없다. 글자 수 비율 ≈ 시간 비율로 본다.
 * sentences: 원고 문장 배열 → 추천 순서대로 index 배열
 */
export function nearSentences(sentences, clip, n = 4) {
  if (!sentences.length || !clip?.dur_s) return sentences.map((_, i) => i);
  const lens = sentences.map((s) => s.length + 1);
  const total = lens.reduce((a, b) => a + b, 0);
  const mid = ((clip.start_s + clip.end_s) / 2 / clip.dur_s) * total;
  let acc = 0;
  const centers = lens.map((l) => { const c = acc + l / 2; acc += l; return c; });
  const order = sentences.map((_, i) => i).sort((a, b) => Math.abs(centers[a] - mid) - Math.abs(centers[b] - mid));
  const top = order.slice(0, n).sort((a, b) => a - b);
  return [...top, ...sentences.map((_, i) => i).filter((i) => !top.includes(i))];
}

/** 1:42–1:48 */
export function fmtRange(a, b) {
  const f = (x) => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, "0")}`;
  return `${f(a)}–${f(b)}`;
}
