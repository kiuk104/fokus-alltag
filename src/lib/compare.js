// "내가 들은 한 줄" ↔ 원고 비교 — Tandem 교정 화면처럼 보여 주기 위한 계산 (AI 없이, 비용 0).
//
// 한 줄은 받아쓰기가 아니라 요약이라, 글자 단위 diff 는 의미가 없다. 대신 단어 단위로 본다:
//   ok   원고에 그대로 있는 단어 → 초록 ✓ (맞게 들었다)
//   fix  원고의 어떤 단어와 철자가 조금 다르다 → ~~내 철자~~ + 원고 철자 (예: Pabst → Papst)
//   own  원고에 없는 내 단어 → 표시 없음 (요약에 쓰는 내 말일 수 있다)
//   fn   es · der · und 같은 기능어 → 표시 없음 (어디에나 있어서 "맞게 들었다"는 증거가 안 된다)
// 그리고 원고에서 내 한 줄과 가장 많이 겹치는 문장을 골라, 겹친 단어를 강조한다.

// 흔한 기능어 — 이 단어들은 맞아도 틀려도 표시하지 않는다
const FUNCTION_WORDS = new Set(
  (
    "der die das den dem des ein eine einen einem einer eines und oder aber auch nicht kein keine " +
    "ich du er sie es wir ihr man mich mir dich dir sich uns euch ihm ihn ihnen " +
    "ist sind war waren hat haben hatte hatten wird werden wurde wurden kann können soll sollen muss müssen " +
    "in im an am auf aus bei mit nach von vom zu zum zur für über unter vor um durch gegen ohne " +
    "da dass wenn weil als wie so noch schon nur sehr mehr viel viele es geht gibt " +
    "dieser diese dieses jetzt heute hier dort was wer wo"
  ).split(" ")
);

/** 비교용으로 단어를 고른다: 소문자 · ß=ss · 앞뒤 문장부호 제거 */
export const norm = (w) =>
  String(w || "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

/** 글을 [단어, 사이 글자] 조각으로 — 화면에 원래 모양 그대로 다시 그리기 위해 */
export function tokens(text) {
  const out = [];
  const re = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
  let last = 0;
  for (let m; (m = re.exec(text)); ) {
    if (m.index > last) out.push({ t: text.slice(last, m.index), word: false });
    out.push({ t: m[0], word: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: text.slice(last), word: false });
  return out;
}

export function lev(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 3) return 99;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** 원고 → 문장들 (소제목·단락을 넘어 마침표 기준으로 자른다) */
export function scriptSentences(script) {
  const out = [];
  for (const b of script || []) {
    if (b.h) out.push(b.h);
    for (const s of String(b.p || "").split(/(?<=[.!?])\s+(?=[\p{Lu}„"])/u)) if (s.trim()) out.push(s.trim());
  }
  return out;
}

/**
 * 비교 결과
 * mine: [{ t, word, kind: "ok"|"fix"|"own"|"fn"|undefined, fix?: 원고 철자 }]
 * best: [{ text, parts: [{ t, word, hit }] }] — 가장 가까운 원고 문장(최대 2개, 겹침이 있을 때만)
 * stats: { ok, fix, content } — 내용어 중 맞은 수 · 고칠 수 · 전체
 */
export function compareLine(line, script, words = []) {
  // 원고의 단어장: 정규형 → 원래 철자(처음 나온 것)
  const vocab = new Map();
  const addWords = (text) => {
    for (const tk of tokens(text)) if (tk.word) {
      const n = norm(tk.t);
      if (n && !vocab.has(n)) vocab.set(n, tk.t);
    }
  };
  const sentences = scriptSentences(script);
  sentences.forEach(addWords);
  (words || []).forEach((w) => addWords(`${w.term} ${w.expl}`));
  const vocabList = [...vocab.keys()];

  const matched = new Set(); // 원고 쪽에서 맞은 단어(정규형)
  const stats = { ok: 0, fix: 0, content: 0 };
  const mine = tokens(line).map((tk) => {
    if (!tk.word) return tk;
    const n = norm(tk.t);
    if (!n) return tk;
    if (FUNCTION_WORDS.has(n)) return { ...tk, kind: "fn" };
    stats.content++;
    if (vocab.has(n)) {
      matched.add(n);
      stats.ok++;
      return { ...tk, kind: "ok" };
    }
    // 철자 가까운 원고 단어 — 짧은 단어는 잘못 붙기 쉬워서 4글자부터, 차이는 길이의 1/3 까지
    if (n.length >= 4) {
      let best = null;
      for (const v of vocabList) {
        if (FUNCTION_WORDS.has(v)) continue;
        const d = lev(n, v);
        if (d <= Math.max(1, Math.floor(n.length / 3)) && (!best || d < best.d)) best = { v, d };
      }
      if (best) {
        matched.add(best.v);
        stats.fix++;
        return { ...tk, kind: "fix", fix: vocab.get(best.v) };
      }
    }
    return { ...tk, kind: "own" };
  });

  // 겹치는 내용어가 가장 많은 원고 문장
  const scored = sentences
    .map((text, i) => {
      const parts = tokens(text).map((tk) => (tk.word && matched.has(norm(tk.t)) && !FUNCTION_WORDS.has(norm(tk.t)) ? { ...tk, hit: true } : tk));
      return { i, text, parts, score: parts.filter((p) => p.hit).length };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, 2)
    .sort((a, b) => a.i - b.i);

  return { mine, best: scored.map(({ text, parts }) => ({ text, parts })), stats };
}
