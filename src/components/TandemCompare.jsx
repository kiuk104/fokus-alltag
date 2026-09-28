// 내가 들은 한 줄 ↔ 원고 — Tandem 교정 말풍선처럼.
//   원고에 있는 단어: 초록 밑줄 · 철자가 조금 다른 단어: ~~내 철자~~ 원고 철자 · 나머지: 그대로
// 아래에 원고에서 가장 가까운 문장을 붙여, 겹친 단어를 같은 초록으로 칠한다.
// 계산은 lib/compare.js (AI 없음). 점수·빨간 X 는 일부러 없다 — 막힘을 실패로 표시하지 않는다(기획서 0-2절).

import { useMemo } from "react";
import { compareLine } from "../lib/compare";

export default function TandemCompare({ line, script, words }) {
  const r = useMemo(() => compareLine(line, script, words), [line, script, words]);
  const { ok, fix, content } = r.stats;

  const verdict =
    content === 0
      ? "내용 단어가 아직 없어요 — 다음엔 들린 명사 하나라도 적어 보세요."
      : ok + fix === 0
        ? "원고와 겹치는 단어는 없어요. 내 말로 요약했다면 괜찮아요 — 아래 원고로 확인."
        : `원고 단어 ${ok + fix}개를 들었어요${fix ? ` · 철자 ${fix}개만 다듬기` : ""}.`;

  return (
    <div className="td">
      <div className="td-bubble">
        <div className="td-label">내가 들은 것</div>
        <p className="td-mine" lang="de">
          {r.mine.map((tk, i) => {
            if (!tk.word || !tk.kind || tk.kind === "fn" || tk.kind === "own") return <span key={i}>{tk.t}</span>;
            if (tk.kind === "ok") return <span key={i} className="td-ok">{tk.t}</span>;
            return (
              <span key={i} className="td-fix">
                <s>{tk.t}</s>
                <ins>{tk.fix}</ins>
              </span>
            );
          })}
        </p>
        <div className="td-verdict">{verdict}</div>
      </div>

      {r.best.length > 0 && (
        <div className="td-orig">
          <div className="td-label">원고에서 가까운 문장</div>
          {r.best.map((s, k) => (
            <p key={k} lang="de">
              {s.parts.map((p, i) => (p.hit ? <mark key={i}>{p.t}</mark> : <span key={i}>{p.t}</span>))}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
