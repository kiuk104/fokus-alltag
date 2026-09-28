// 소리에서 문장 경계 찾기 — "문장 사이에는 쉼이 있다"를 이용한다.
//
// 방송사들이 문장별 시간 정보를 주지 않아서, 소리 크기(RMS)가 낮아지는 구간(쉼)을 찾아 자른다.
// 2026-09-28 실제 방송으로 잰 쉼 길이: 문장 사이 0.4~1.5초 · 쉼표 0.1~0.3초 (DW 천천히 뉴스·Nachrichtenleicht).
// tagesschau 는 배경음악이 깔려 있어 "조용함"의 기준을 더 높게 잡아야 쉼이 보인다 → 기준을 몇 단계 시도한다.
//
// 규칙: 긴 쉼부터 고른다 → 평균 6초 조각이 될 만큼 모이거나, 쉼이 0.25초보다 짧아지면 멈춘다.
// 완벽하지 않다(긴 쉼표에서 자를 때가 있다). 그래도 "앞 문장 다시"에는 충분하다.

const FRAME = 0.02; // 20ms 단위로 소리 크기를 잰다
const TARGET = 6; // 조각 평균 길이 목표(초)
const MIN_GAP = 0.25; // 이보다 짧은 쉼은 문장 경계로 보지 않는다
const MIN_SEG = 1.5; // 이보다 짧은 조각은 만들지 않는다
const LEAD = 0.3; // 말이 시작되기 조금 앞에서 틀어야 첫 음절이 안 잘린다

function rmsFrames(data, sampleRate) {
  const n = Math.max(1, Math.floor(FRAME * sampleRate));
  const F = Math.floor(data.length / n);
  const rms = new Float32Array(F);
  for (let i = 0; i < F; i++) {
    let s = 0;
    for (let j = i * n, e = j + n; j < e; j++) s += data[j] * data[j];
    rms[i] = Math.sqrt(s / n);
  }
  return rms;
}

/** 조용한 구간들 [{ start, end, len }] (초) */
function findGaps(rms, th) {
  const gaps = [];
  let run = 0;
  for (let i = 0; i <= rms.length; i++) {
    if (i < rms.length && rms[i] < th) run++;
    else {
      if (run * FRAME >= MIN_GAP) gaps.push({ start: (i - run) * FRAME, end: i * FRAME, len: run * FRAME });
      run = 0;
    }
  }
  return gaps;
}

/**
 * 채널 데이터(Float32Array) → 문장 시작 시각들 [0, t1, t2, …] (초, 오름차순)
 * 쉼을 거의 못 찾으면 [0] 만 돌려준다 — 화면은 문장 이동 버튼을 숨긴다.
 */
export function sentenceStarts(data, sampleRate) {
  const duration = data.length / sampleRate;
  if (duration < MIN_SEG * 2) return [0];
  const rms = rmsFrames(data, sampleRate);
  const sorted = Float32Array.from(rms).sort();
  const floor = sorted[Math.floor(sorted.length * 0.05)];
  const med = sorted[Math.floor(sorted.length * 0.5)];
  const want = Math.max(1, Math.round(duration / TARGET) - 1);

  let best = null;
  for (const f of [0.12, 0.2, 0.3, 0.4]) {
    const gaps = findGaps(rms, floor + (med - floor) * f).sort((a, b) => b.len - a.len);
    const picked = [];
    for (const g of gaps) {
      if (picked.length >= want) break;
      const at = Math.max(g.start, g.end - LEAD);
      if (at < MIN_SEG || duration - at < MIN_SEG) continue;
      if (picked.every((p) => Math.abs(p - at) >= MIN_SEG)) picked.push(at);
    }
    const score = Math.abs(picked.length - want);
    if (!best || score < best.score) best = { score, picked };
    if (score <= want * 0.15) break;
  }
  return [0, ...best.picked.sort((a, b) => a - b)];
}

/** t 가 몇 번째 문장 안에 있는가 */
export function segIndex(starts, t) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= t + 0.05) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** "이전 문장": 문장 안으로 1.2초 넘게 들어가 있으면 그 문장 처음으로, 아니면 앞 문장으로 (음악 앱과 같은 버릇) */
export function prevStart(starts, t) {
  const i = segIndex(starts, t);
  if (t - starts[i] > 1.2 || i === 0) return starts[i];
  return starts[i - 1];
}

export function nextStart(starts, t) {
  const i = segIndex(starts, t);
  return i + 1 < starts.length ? starts[i + 1] : null;
}
