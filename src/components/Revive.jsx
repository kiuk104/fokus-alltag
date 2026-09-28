// 되살리기 워밍업 (1분) — 기록 칸 위 카드 하나. 기획서 2절 · 0-2절 "간격 두기 + 인출".
//
//   1·3·7·14일 전에 DE 로 보낸 문장 하나의 **한국어 뜻**만 → 독일어로 말해 본다 → 정답
//   → "오늘 상황으로 바꿔 한 문장" (알아보기가 아니라 다시 만들기)
// 하루 1개, 건너뛸 수 있다. 결과는 기록의 parts.revive 에 담겨 기록과 함께 저장된다.
// 오늘 이미 했는지(또는 건너뛰었는지)는 기기에 적어 둔다 — 새 기록을 열 때마다 또 나오면 귀찮다.

import { useEffect, useState } from "react";
import { loadEntriesRange } from "../lib/entryRepo";
import { keptSentences, reviveFor, scoreRecall, verdict } from "../lib/recall";
import { speak, stopSpeaking } from "../lib/audio";
import { useMic } from "../lib/useMic";
import { addDays } from "../lib/program";
import "../styles/recall.css";

const key = (day) => `fa-revive-${day}`;
const doneToday = (day) => {
  try { return localStorage.getItem(key(day)) || ""; } catch { return ""; }
};
const markDone = (day, v) => {
  try { localStorage.setItem(key(day), v); } catch { /* 기억 못 할 뿐 */ }
};

export default function Revive({ userId, today, onResult }) {
  const [state, setState] = useState(() => doneToday(today)); // "" | "done" | "skip"
  const [s, setS] = useState(null);
  const [said, setSaid] = useState("");
  const [shown, setShown] = useState(null);
  const [twist, setTwist] = useState("");
  const mic = useMic(said, setSaid);
  const mic2 = useMic(twist, setTwist);

  useEffect(() => {
    if (state) return;
    let alive = true;
    loadEntriesRange(userId, addDays(today, -14), addDays(today, -1))
      .then((rows) => alive && setS(reviveFor(keptSentences(rows), (g) => addDays(today, -g), today)))
      .catch(() => { /* 워밍업은 없어도 된다 */ });
    return () => { alive = false; stopSpeaking(); };
  }, [userId, today, state]);

  if (state === "done") return <p className="rv-done">✓ 오늘 되살리기 끝</p>;
  if (state || !s) return null;

  const skip = () => { markDone(today, "skip"); setState("skip"); };
  const reveal = () => {
    mic.stop();
    setShown(scoreRecall(said, s.de));
    speak(s.id, s.de);
  };
  const finish = () => {
    mic2.stop();
    const score = shown ? Math.round(shown.score * 100) / 100 : 0;
    onResult({ id: s.id, from: s.day, gap: s.gap, score, ok: verdict(score) === "ok", twist: twist.trim() });
    markDone(today, "done");
    setState("done");
  };

  return (
    <section className="rv">
      <div className="rv-head">
        되살리기 <span className="muted">· {s.gap}일 전 문장 · 1분</span>
        <button className="btn small" onClick={skip}>건너뛰기</button>
      </div>
      <div className="rc-ko">{s.ko}</div>

      {!shown ? (
        <>
          <div className="rc-say">
            {mic.ok && (
              <button className={`rc-mic ${mic.on ? "on" : ""}`} onClick={mic.toggle}>{mic.on ? "■ 멈추기" : "🎤 독일어로 말하기"}</button>
            )}
            <textarea className="input rc-input" rows={2} lang="de" spellCheck={false} value={said} onChange={(e) => setSaid(e.target.value)} placeholder="독일어로 꺼내 보세요" />
            {mic.interim && <div className="muted tiny" lang="de">{mic.interim}</div>}
            {mic.err && <div className="rc-err">{mic.err}</div>}
          </div>
          <div className="cr-actions">
            <button className="btn" onClick={() => { setSaid(""); reveal(); }}>모르겠어요</button>
            <button className="btn primary" disabled={!said.trim()} onClick={reveal}>정답 보기</button>
          </div>
        </>
      ) : (
        <>
          <p className="rc-answer" lang="de">
            {shown.parts.map((p, i) => (p.word ? <span key={i} className={p.hit ? "hit" : "miss"}>{p.t}</span> : <span key={i}>{p.t}</span>))}
          </p>
          <div className="rc-play">
            <button className="btn small" onClick={() => speak(s.id, s.de)}>🔊 듣기</button>
            <span className="muted tiny">{said.trim() ? `${Math.round(shown.score * 100)}% 꺼냄` : ""}</span>
          </div>
          <p className="tiny"><b>오늘 상황으로 바꿔 한 문장</b> — 같은 틀에 오늘 있었던 일을 넣어 보세요.</p>
          <div className="rc-say">
            {mic2.ok && (
              <button className={`rc-mic ${mic2.on ? "on" : ""}`} onClick={mic2.toggle}>{mic2.on ? "■ 멈추기" : "🎤 말하기"}</button>
            )}
            <textarea className="input rc-input" rows={2} lang="de" spellCheck={false} value={twist} onChange={(e) => setTwist(e.target.value)} placeholder="Heute …" />
            {mic2.interim && <div className="muted tiny" lang="de">{mic2.interim}</div>}
          </div>
          <div className="cr-actions">
            <button className="btn primary" onClick={finish}>{twist.trim() ? "완료" : "바꿔 말하기 없이 완료"}</button>
          </div>
        </>
      )}
    </section>
  );
}
