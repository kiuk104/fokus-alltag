// 지난 기록 한 개의 교정 다시 보기 (읽기만) — components/PastEntries.jsx 에서 연다.
// 그날 받은 교정은 alltag_entries.correction 에 다 있다 — AI 를 다시 부르지 않는다(비용 0).
// 지난 기록은 고치지 않는다: 저장·교정은 그날의 🟡🔵 칸과 묶여 있어서, 오늘 화면에서 고치면 날짜가 섞인다.

import { sentIds } from "../lib/entryRepo";
import { selfFixed } from "../lib/correct";
import { GRAMMAR } from "../lib/program";
import "../styles/review.css";

const gLabel = (key) => GRAMMAR.find((g) => g.key === key)?.label || key;
const HANGUL = /[\uAC00-\uD7A3]/;

export default function EntryReview({ entry }) {
  const c = entry.correction;
  const d = c?.data;
  const prog = c?.progress || {};
  const lines = String(entry.raw_text || "").split("\n");

  return (
    <div className="rv-wrap">
      <Block label="내가 쓴 글">
        <div className="rv-mine" lang="de">
          {lines.map((l, i) => {
            const m = l.match(/^\[([^\]]+)\]\s*(.*)$/);
            const body = m ? m[2] : l;
            return (
              <p key={i} className={HANGUL.test(body) ? "intent" : ""}>
                {m && <span className="rv-lbl">{m[1]}</span>}
                {body}
              </p>
            );
          })}
        </div>
      </Block>

      {!d && <p className="muted tiny">이 기록은 교정을 받지 않았어요.</p>}

      {d && (
        <>
          {prog.mine && entry.input_mode !== "ko" && (
            <Block label="내가 스스로 고친 글">
              <p className="rv-text dashed" lang="de">{prog.mine}</p>
            </Block>
          )}
          {entry.input_mode === "ko" && d.keywords?.length > 0 && (
            <Block label="핵심 단어">
              <div className="rv-kw">{d.keywords.map((w) => <span key={w.de}><b lang="de">{w.de}</b> {w.ko}</span>)}</div>
            </Block>
          )}

          <Block label="B1 교정">
            <p className="rv-text" lang="de">{d.b1.text}</p>
            {d.b1.fixes.length > 0 && (
              <ul className="rv-fixes">
                {d.b1.fixes.map((f, i) => {
                  const ok = prog.mine && selfFixed(prog.mine, f);
                  return (
                    <li key={i} className={ok ? "ok" : ""}>
                      <span lang="de"><s>{f.from}</s> → <b>{f.to}</b></span>
                      {f.type && <span className="rv-type">{f.type}</span>}
                      {ok && <span className="rv-ok">✓ 직접 고침</span>}
                      {f.why && <div className="muted tiny">{f.why}</div>}
                    </li>
                  );
                })}
              </ul>
            )}
          </Block>

          {(d.b2 || d.native || prog.myB2) && (
            <Block label="B2 · 원어민">
              {prog.myB2 && <p className="rv-text dashed" lang="de"><span className="rv-lbl">내 B2</span>{prog.myB2}</p>}
              {d.b2 && <p className="rv-text" lang="de">{d.b2}</p>}
              {d.native && <p className="rv-text native" lang="de">{d.native}</p>}
            </Block>
          )}

          {d.grammar?.length > 0 && (
            <Block label="문법">
              {d.grammar.map((g) => (
                <p key={g.key} className="rv-gram"><b>{gLabel(g.key)}</b> {g.note}</p>
              ))}
              {prog.explain?.mine && (
                <div className="rv-explain">
                  <div><span className="rv-lbl">내 설명</span>{prog.explain.mine}</div>
                  {prog.explain.res && (
                    <div className={prog.explain.res.ok ? "ok" : ""}>
                      <span className="rv-lbl">{prog.explain.res.ok ? "✓ 맞음" : "보충"}</span>
                      {prog.explain.res.add}
                    </div>
                  )}
                </div>
              )}
            </Block>
          )}

          {(prog.keepEdited || d.keep)?.length > 0 && (
            <Block label={sentIds(entry).length ? "외울 문장 · Fokus DE 로 보냄" : "외울 문장 (보내지 않음)"}>
              <ul className="rv-keep">
                {(prog.keepEdited || d.keep).filter((k) => k.on ?? true).map((k, i) => (
                  <li key={i}><b lang="de">{k.de}</b><span>{k.ko}</span></li>
                ))}
              </ul>
            </Block>
          )}

          {d.words?.length > 0 && (
            <Block label="새 단어">
              <div className="rv-kw">
                {d.words.map((w) => (
                  <span key={w.de}>
                    <b lang="de">{w.article ? `${w.article} ` : ""}{w.de}</b> {w.ko}
                    {(prog.wordsSaved || []).includes(w.de) && " ✓"}
                  </span>
                ))}
              </div>
            </Block>
          )}

          {d.errorTypes?.length > 0 && <p className="muted tiny">틀린 유형: {d.errorTypes.join(" · ")}</p>}
          {c.recall?.length > 0 && <RecallLine recall={c.recall[c.recall.length - 1]} />}
        </>
      )}
    </div>
  );
}

function RecallLine({ recall }) {
  const items = recall.items || [];
  const first = items.filter((x) => x.first >= 0.8).length;
  return <p className="muted tiny">🔴 꺼내기 ({recall.day}): 바로 꺼냄 {first}/{items.length}</p>;
}

function Block({ label, children }) {
  return (
    <div className="rv-block">
      <div className="cr-label">{label}</div>
      {children}
    </div>
  );
}
