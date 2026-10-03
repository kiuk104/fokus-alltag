// 🔖 이 편에서 갈무리한 구간에 원고 문장 붙이기 — 원고를 연 뒤에만 보인다(듣기 화면 ④).
// 듣기 전에 글자를 보면 듣기 연습이 안 되므로, 붙이는 일은 원고를 펼친 다음에 한다.
// 소리는 쉼으로, 원고는 마침표로 나눠서 자동으로는 못 맞춘다 — 위치로 어림한 근처 문장을 맨 위에 보여 주고 탭해서 고른다.

import { useMemo, useState } from "react";
import { nearSentences, fmtRange } from "../lib/clips";
import { patchClip, deleteClip } from "../lib/clipsRepo";

export default function ClipAttach({ userId, clips, sentences, onChange, onPlay, onError }) {
  const [open, setOpen] = useState(null); // 문장 고르는 중인 갈무리 id
  if (!clips.length) return null;

  const save = async (c, patch) => {
    onChange(clips.map((x) => (x.id === c.id ? { ...x, ...patch } : x)));
    try {
      await patchClip(userId, c.id, patch);
    } catch (e) {
      onError(e.message);
    }
  };
  const remove = async (c) => {
    onChange(clips.filter((x) => x.id !== c.id));
    try {
      await deleteClip(userId, c.id);
    } catch (e) {
      onError(e.message);
    }
  };

  return (
    <section className="ca">
      <div className="lsn-words-head">🔖 이 편에서 갈무리한 구간 {clips.length}</div>
      {clips.map((c) => (
        <div key={c.id} className="ca-item">
          <div className="ca-head">
            <button className="btn small" onClick={() => onPlay?.(c)} title="이 구간부터 듣기">▶ {fmtRange(c.start_s, c.end_s)}</button>
            {c.text ? <span className="ca-text" lang="de">{c.text}</span> : <span className="muted tiny">문장 아직 없음</span>}
            <button className="chip" onClick={() => setOpen(open === c.id ? null : c.id)}>{open === c.id ? "닫기" : c.text ? "문장 고치기" : "문장 붙이기"}</button>
          </div>
          {open === c.id && (
            <Picker clip={c} sentences={sentences} onSave={(patch) => save(c, patch)} onDelete={() => remove(c)} />
          )}
        </div>
      ))}
    </section>
  );
}

function Picker({ clip, sentences, onSave, onDelete }) {
  const order = useMemo(() => nearSentences(sentences, clip), [sentences, clip]);
  const [text, setText] = useState(clip.text || "");
  const [memo, setMemo] = useState(clip.memo || "");
  const [all, setAll] = useState(false);
  const [armed, setArmed] = useState(false);
  const shown = all ? order : order.slice(0, 4);

  const toggle = (s) => {
    const cur = text.trim();
    setText(cur.includes(s) ? cur.replace(s, "").replace(/\s{2,}/g, " ").trim() : cur ? `${cur} ${s}` : s);
  };

  return (
    <div className="ca-pick">
      {sentences.length > 0 ? (
        <>
          <div className="muted tiny">위치로 어림한 근처 문장이에요. 들은 구간에 맞는 것을 누르세요 (여러 개 가능).</div>
          <div className="ca-sents">
            {shown.map((i) => (
              <button key={i} className={`lsn-sent ${text.includes(sentences[i]) ? "on" : ""}`} lang="de" onClick={() => toggle(sentences[i])}>
                <i>{i + 1}</i>
                {sentences[i]}
              </button>
            ))}
          </div>
          {!all && sentences.length > 4 && <button className="chip" onClick={() => setAll(true)}>원고 전체에서 고르기</button>}
        </>
      ) : (
        <div className="muted tiny">이 편은 원고가 없어요 — 들린 대로 적어 두세요.</div>
      )}
      <textarea className="input" rows={2} lang="de" spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} placeholder="이 구간의 독일어 문장" />
      <input className="input" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="메모 (선택) — 예: 숫자를 빨리 말함" />
      <div className="cr-actions">
        <button className={`btn ${armed ? "danger" : ""}`} onClick={() => (armed ? onDelete() : (setArmed(true), setTimeout(() => setArmed(false), 3000)))}>
          {armed ? "정말 지우기?" : "갈무리 지우기"}
        </button>
        <button className="btn primary" onClick={() => onSave({ text: text.trim(), memo: memo.trim() })}>저장</button>
      </div>
    </div>
  );
}
