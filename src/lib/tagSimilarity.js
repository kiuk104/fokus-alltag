// SHARED: Basiswortschatz, fokus-alltag — Basiswortschatz/src/lib/tagSimilarity.js 의 복사본. 고치면 양쪽 같이.
// 태그 유사도 — AI 호출 없이 "이름만 다르고 개념은 같은" 태그 후보를 찾는 로컬 휴리스틱.
// AdminPanel > 태그 탭의 "🔎 유사 태그 스캔(무료)" 에서 사용하고,
// 결과를 그대로 AI 검증 단계에 넘겨 오탐만 걸러내는 구조.
//
// 설계 원칙:
//   - 무료·즉시. 수천 개 태그에서도 체감 지연이 없어야 한다.
//   - 재현율보다 정밀도. 억지 병합 제안은 사용자가 매번 해제해야 하므로 비용이 크다.
//   - 판단 근거(reason)를 함께 돌려준다 — 사용자가 왜 묶였는지 알아야 승인/해제가 빠르다.

// 표기 차이를 지운 비교용 키.
// 대소문자·공백·구두점·움라우트 표기(ä↔ae)·전각문자를 모두 흡수한다.
export function normalizeTag(tag) {
  return String(tag || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[\s_\-.·,/\\()[\]{}'"`~!?:;+*&|<>@#$%^=]/g, "");
}

// 표준 편집 거리. 짧은 태그만 다루므로 O(n*m) DP 로 충분하다.
// max 를 넘어서면 조기 종료 — 후보가 아닌 쌍에서 시간을 쓰지 않기 위함.
export function levenshtein(a, b, max = Infinity) {
  if (a === b) return 0;
  const la = a.length, lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;
  if (Math.abs(la - lb) > max) return max + 1;

  let prev = new Array(lb + 1);
  let cur = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;

  for (let i = 1; i <= la; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= lb; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1; // 이 행 전체가 이미 한도 초과 → 더 볼 필요 없음
    const tmp = prev; prev = cur; cur = tmp;
  }
  return prev[lb];
}

// 두 태그가 병합 후보인지 판정.
// 반환: null(후보 아님) | { score: 0~1, reason: string }
export function tagPairScore(tagA, tagB) {
  const a = normalizeTag(tagA);
  const b = normalizeTag(tagB);
  return normalizedPairScore(a, b);
}

// 편집 거리 허용치 — 짧은 태그일수록 한 글자의 의미 비중이 커서 엄격하게.
function allowedDistance(maxLen) {
  return maxLen <= 4 ? 1 : maxLen <= 8 ? 2 : 3;
}

// 문자열에 등장하는 숫자만 순서대로 뽑는다. "kapitel12" → "12"
function digitsOf(s) {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 48 && c <= 57) out += s[i];
  }
  return out;
}

// tagPairScore 의 실제 판정부. 이미 정규화된 문자열을 받는다
// (대량 스캔에서 정규화를 매 쌍마다 반복하지 않기 위해 분리).
function normalizedPairScore(a, b) {
  if (!a || !b) return null;
  if (a === b) return { score: 1, reason: "표기만 다름" };

  // 숫자가 다르면 다른 개념이다 — Kapitel1/Kapitel2, A1/A2, Thema3/Thema4.
  // 이 규칙이 없으면 "1글자 차이" 로 연쇄 병합되어 번호 태그 전체가 한 그룹이 된다.
  if (digitsOf(a) !== digitsOf(b)) return null;

  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;

  // 1) 포함 관계 — "비즈니스회화" ⊃ "비즈니스회" 처럼 한쪽이 다른 쪽의 확장.
  //    너무 짧은 조각(3자 미만)이나 길이 차가 큰 경우는 우연 일치가 많아 제외.
  if (shorter.length >= 3 && shorter.length / longer.length >= 0.6 && longer.includes(shorter)) {
    return { score: 0.85, reason: "포함 관계" };
  }
  if (longer.includes(shorter)) return null; // 포함이지만 비율 미달 → 편집 거리로도 보지 않는다

  // 2) 편집 거리 — 오타·굴절·축약 표기
  const maxLen = longer.length;
  // 3자 이하 태그는 1글자만 달라도 완전히 다른 뜻인 경우가 많다 (예: 명사/동사, A1/A2)
  if (maxLen < 4) return null;
  if (longer.length - shorter.length > 3) return null;
  const allowed = allowedDistance(maxLen);
  const dist = levenshtein(a, b, allowed);
  if (dist > allowed) return null;
  const sim = 1 - dist / maxLen;
  if (sim < 0.7) return null;
  return { score: sim, reason: dist === 1 ? "1글자 차이" : `${dist}글자 차이` };
}

// 문자 집합 비트마스크 — 대량 스캔용 프리필터.
// 편집 거리가 d 이면 두 문자열의 문자 집합 차이는 최대 2d 이므로,
// 마스크 XOR 의 popcount 가 2d 를 넘으면 levenshtein 을 돌릴 필요조차 없다.
// (mod 64 해시 충돌은 popcount 를 줄이기만 하므로 후보를 놓치지 않는다)
function charMask(s) {
  let lo = 0, hi = 0;
  for (let i = 0; i < s.length; i++) {
    const b = s.charCodeAt(i) & 63;
    if (b < 32) lo |= 1 << b; else hi |= 1 << (b - 32);
  }
  return [lo, hi];
}

function popcount32(v) {
  v = v - ((v >> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >> 2) & 0x33333333);
  return (((v + (v >> 4)) & 0x0f0f0f0f) * 0x01010101) >> 24;
}

// 대표(canonical) 선정 — 사용 빈도 우선, 같으면 짧은 쪽, 그래도 같으면 사전순.
// 새 이름을 만들지 않는 이유: 태그 풀은 AI 추천의 후보 집합이기도 해서,
// 실제로 쓰인 적 없는 이름이 풀에 들어가면 추천 품질이 흔들린다.
function pickCanonical(members, countOf) {
  return [...members].sort((x, y) => {
    const cx = countOf.get(x) || 0;
    const cy = countOf.get(y) || 0;
    if (cy !== cx) return cy - cx;
    if (x.length !== y.length) return x.length - y.length;
    return x.localeCompare(y);
  })[0];
}

// 전체 태그 풀에서 병합 후보 그룹을 찾는다.
// tagStats: [{ tag, count }]
// 반환: [{ canonical, members: string[], approved: true, source: "local", reason, score }]
//   members 에는 canonical 이 포함되지 않는다 (AI 클러스터링 제안과 같은 형태).
export function findSimilarTagGroups(tagStats, { minScore = 0.7 } = {}) {
  const tags = tagStats.map(t => t.tag).filter(Boolean);
  const n = tags.length;
  if (n < 2) return [];

  const countOf = new Map(tagStats.map(t => [t.tag, t.count || 0]));

  // 길이 오름차순으로 정렬해두면 안쪽 루프를 length 창에서 break 로 끊을 수 있다.
  // 태그가 수천 개여도 O(n²) 전수 비교를 실제로 돌지 않게 하는 핵심.
  const order = tags
    .map((tag, idx) => ({ idx, norm: normalizeTag(tag) }))
    .sort((a, b) => a.norm.length - b.norm.length);
  const masks = order.map(o => charMask(o.norm));

  // union-find — "A≈B, B≈C" 를 한 그룹으로 모으기 위해
  const parent = new Array(n).fill(0).map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (i, j) => { const ri = find(i), rj = find(j); if (ri !== rj) parent[rj] = ri; };

  const pairs = []; // [idx, score, reason] — 사유·점수는 union 이 끝난 뒤 최종 루트에 붙인다

  for (let a = 0; a < n; a++) {
    const na = order[a].norm;
    const la = na.length;
    if (!la) continue;
    // 포함 관계는 길이 비 0.6 까지 허용 → 창 크기도 거기에 맞춘다 (편집 거리는 최대 3)
    const window = Math.max(3, Math.ceil(la / 0.6) - la);
    for (let b = a + 1; b < n; b++) {
      const nb = order[b].norm;
      const lb = nb.length;
      if (lb - la > window) break; // 정렬되어 있으므로 뒤는 볼 필요 없음

      // 프리필터 — 문자 집합이 너무 다르면 편집 거리를 계산할 가치가 없다.
      // 포함 관계 후보는 집합 차이가 커도 성립하므로 예외로 두되,
      // "na 의 문자 집합 ⊆ nb 의 문자 집합" 비트 검사로 먼저 걸러 indexOf 호출을 아낀다.
      if (na !== nb) {
        const allowed = allowedDistance(lb);
        const diffBits =
          popcount32(masks[a][0] ^ masks[b][0]) + popcount32(masks[a][1] ^ masks[b][1]);
        if (diffBits > 2 * allowed) {
          const canContain = la >= 3 && la / lb >= 0.6
            && (masks[a][0] & ~masks[b][0]) === 0
            && (masks[a][1] & ~masks[b][1]) === 0;
          if (!canContain || !nb.includes(na)) continue;
        }
      }

      const res = normalizedPairScore(na, nb);
      if (!res || res.score < minScore) continue;
      union(order[a].idx, order[b].idx);
      pairs.push([order[a].idx, res.score, res.reason]);
    }
  }

  const reasons = new Map();   // rootIdx → 대표 사유
  const bestScore = new Map(); // rootIdx → 최고 점수
  for (const [i, score, reason] of pairs) {
    const root = find(i);
    if (!reasons.has(root)) reasons.set(root, reason);
    if ((bestScore.get(root) || 0) < score) bestScore.set(root, score);
  }

  // 루트별로 묶기
  const buckets = new Map();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!buckets.has(root)) buckets.set(root, []);
    buckets.get(root).push(tags[i]);
  }

  const groups = [];
  for (const [root, members] of buckets) {
    if (members.length < 2) continue;
    const canonical = pickCanonical(members, countOf);
    groups.push({
      canonical,
      members: members.filter(m => m !== canonical),
      approved: true,
      source: "local",
      reason: reasons.get(root) || "유사",
      score: bestScore.get(root) || 0,
    });
  }

  // 큰 그룹 → 확신 높은 순
  groups.sort((a, b) =>
    b.members.length - a.members.length ||
    b.score - a.score ||
    a.canonical.localeCompare(b.canonical)
  );
  return groups;
}

// 특정 태그 하나와 비슷한 태그들을 찾는다 (선택 확장용).
export function findSimilarTo(tag, tagStats, { minScore = 0.7 } = {}) {
  const out = [];
  for (const { tag: other } of tagStats) {
    if (other === tag) continue;
    const res = tagPairScore(tag, other);
    if (res && res.score >= minScore) out.push({ tag: other, ...res });
  }
  return out.sort((a, b) => b.score - a.score);
}
