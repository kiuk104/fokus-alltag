// 오답 노트 — 예전 교정에서 틀린 곳을 다시 고쳐 쓴다 (기획서 0-5절 · 0-2절 인출).
//
//   ① 그때 내 문장 + 틀린 곳 밑줄 + 유형·힌트 → 내가 고쳐 쓴다 (정답은 아직 안 보인다)
//   ② 정답(to)·이유(why) 공개 → 맞았는지 표시
//   ③ (선택) 같은 문법으로 **오늘 상황** 한 문장 — 같은 문장만 반복하면 답을 외워 버리니까
//
// 채점은 교정 1단계와 같은 기준(AI 없음). 결과는 답을 낸 즉시 그 기록의 correction.progress.drill 에 저장한다.
// 같은 문법을 내 DE 문장으로 더 연습하는 건 Fokus DE Dojo 📐 문법 — 끝 화면에서 링크만 건다.

import { useEffect, useState } from "react";
import { patchEntry } from "../lib/entryRepo";
import { judge, nextState, withDrill, GRADUATE } from "../lib/drill";
import { useMic } from "../lib/useMic";
import { speakText, stopSpeaking } from "../lib/audio";
import { deHasGrammar, deGrammarUrl, openApp } from "../lib/links";
import DrillPicker from "../components/DrillPicker";
import "../styles/listen.css";
import "../styles/recall.css";
import "../styles/correct.css";
import "../styles/drill.css";

// pool: 고를 수 있는 문장 전부 · preset: 추천으로 미리 골라 둘 id — 먼저 고르기 화면, [시작] 하면 문제
export default function Drill({ pool, preset, title, userId, today, entries, onEntry, onClose, onError }) {
  const [items, setItems] = useState(null); // 고른 문장 (null = 아직 고르는 중)
  const [at, setAt] = useState(0);
  const [results, setResults] = useState([]); // [{ id, correct, state }]

  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => { window.removeEventListener("keydown", k); stopSpeaking(); };
  }, [onClose]);

  // 답을 내면 바로 저장 — 중간에 닫아도 한 만큼은 남는다
  const save = async (item, state) => {
    const e = entries.find((x) => x.id === item.entryId);
    if (!e?.correction) return;
    try {
      onEntry(await patchEntry(userId, e.id, { correction: withDrill(e.correction, item.n, state) }));
    } catch (err) {
      onError("오답 노트 저장 실패: " + err.message);
    }
  };

  const answer = (item, correct) => {
    const state = nextState(item.state, correct, today);
    setResults((rs) => [...rs, { id: item.id, correct, state }]);
    save(item, state);
    return state;
  };
  // 오늘 상황 한 문장 — 상태에 덧붙여 한 번 더 저장 (채점하지 않는다)
  const addMade = (item, state, made) => {
    if (made) save(item, { ...state, made: { day: today, text: made } });
    setAt((n) => n + 1);
  };

  const list = items || [];
  const cur = list[at];
  const finished = list.length > 0 && at >= list.length;
  const right = results.filter((r) => r.correct).length;
  const types = [...new Set(list.map((it) => it.type))];

  return (
    <div className="lsn rc dr" role="dialog" aria-label="오답 노트">
      <div className="lsn-inner">
        <header className="lsn-head">
          <div className="lsn-src">
            <b>✏️ 오답 노트{title ? ` · ${title}` : ""}</b>{" "}
            {cur && <span className="muted tiny">{at + 1} / {list.length}</span>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">✕</button>
        </header>

        {!items && <DrillPicker pool={pool} preset={preset} today={today} onStart={setItems} />}

        {cur && <DrillCard key={cur.id} item={cur} onAnswer={answer} onNext={addMade} />}

        {finished && (
          <section className="rc-end">
            <div className="rc-big">오답 노트 끝</div>
            <p>바로 고친 곳 <b>{right} / {list.length}</b></p>
            <ul className="rc-sum">
              {list.map((it) => {
                const r = results.find((x) => x.id === it.id);
                const v = !r ? "" : r.correct ? "ok" : "miss";
                return (
                  <li key={it.id} className={v}>
                    <b lang="de"><s>{it.fix.from}</s> → {it.fix.to}</b>
                    <span className="muted tiny">
                      {it.type} · {!r ? "건너뜀" : r.state.done ? "🎓 졸업 — 이제 저절로는 안 나와요" : r.correct ? `맞힘 · ${GRADUATE - r.state.streak}번 더 맞히면 졸업` : "내일 다시"}
                    </span>
                  </li>
                );
              })}
            </ul>
            {types.some(deHasGrammar) && (
              <>
                <p className="muted tiny">같은 문법을 내 DE 문장으로 더 연습하려면 — Fokus DE Dojo 📐 문법</p>
                <div className="dr-links">
                  {types.filter(deHasGrammar).map((t) => (
                    <button key={t} className="link-btn" onClick={() => openApp(deGrammarUrl(t))}>
                      {t} 더 연습 <b>Fokus DE</b> ↗
                    </button>
                  ))}
                </div>
              </>
            )}
            <div className="cr-actions">
              <button className="btn primary" onClick={onClose}>닫기</button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

// ── 한 문제 ──────────────────────────────────────────────────────────────────
function DrillCard({ item, onAnswer, onNext }) {
  const [mine, setMine] = useState(item.before);
  const [shown, setShown] = useState(null); // { correct, gaveUp, state }
  const [made, setMade] = useState("");
  const [voice, setVoice] = useState("");
  const mic = useMic(made, setMade);
  const play = async (rate) => setVoice(await speakText(item.after, { rate }));
  const { fix } = item;

  const check = (gaveUp) => {
    const correct = !gaveUp && judge(item, mine);
    setShown({ correct, gaveUp, state: onAnswer(item, correct) });
  };

  // 밑줄: 문장 안 첫 번째 from
  const i = item.before.indexOf(fix.from);
  const marked = i < 0 ? item.before : (
    <>
      {item.before.slice(0, i)}
      <u>{fix.from}</u>
      {item.before.slice(i + fix.from.length)}
    </>
  );

  if (!shown) {
    return (
      <section className="rc-card">
        <div className="dr-meta">
          <span className="cr-type">{item.type}</span>
          <span className="muted tiny">{item.day.slice(5).replace("-", "/")} 교정</span>
        </div>
        <p className="dr-orig" lang="de">{marked}</p>
        {fix.hint && <p className="dr-hint">💡 {fix.hint}</p>}
        <p className="muted tiny">밑줄 친 곳을 고쳐서 문장을 다시 써 보세요.</p>
        <textarea
          className="input rc-input" rows={3} lang="de" spellCheck={false} autoCapitalize="off" autoCorrect="off"
          value={mine} onChange={(e) => setMine(e.target.value)} aria-label="고쳐 쓸 문장"
        />
        <div className="cr-actions">
          {mine !== item.before && <button className="btn" onClick={() => setMine(item.before)}>처음 문장으로</button>}
          <button className="btn" onClick={() => check(true)}>모르겠어요</button>
          <button className="btn primary" disabled={mine.trim() === item.before.trim()} onClick={() => check(false)}>고쳤어요 → 정답</button>
        </div>
      </section>
    );
  }

  const v = shown.correct ? "ok" : "miss";
  return (
    <section className="rc-card">
      <div className={`rc-verdict ${v}`}>
        {shown.correct ? (shown.state.done ? "🎓 맞혔어요 — 졸업!" : "맞혔어요") : shown.gaveUp ? "정답을 보고 한 번 소리 내 읽어 보세요" : "아직이에요 — 내일 다시 나와요"}
      </div>
      <p className="dr-fix" lang="de"><s>{fix.from}</s> → <b>{fix.to}</b></p>
      {fix.why && <p className="dr-why">{fix.why}</p>}
      <p className="rc-answer" lang="de">{item.after}</p>
      <div className="rc-play">
        <button className="btn" onClick={() => play(1)}>🔊 발음 듣기</button>
        <button className="btn" onClick={() => play(0.75)}>🐢 천천히</button>
        {voice === "device" && <span className="muted tiny">기기 목소리 (원어민 발음을 만들지 못했어요)</span>}
      </div>
      {!shown.gaveUp && !shown.correct && mine.trim() && (
        <p className="rc-said" lang="de"><span className="muted tiny">내가 쓴 것 </span>{mine}</p>
      )}

      <div className="dr-make">
        <div className="dr-make-title">같은 문법으로 <b>오늘 상황</b> 한 문장 <span className="muted tiny">(선택)</span></div>
        <div className="rc-say">
          {mic.ok && (
            <button className={`rc-mic ${mic.on ? "on" : ""}`} onClick={mic.toggle} aria-pressed={mic.on}>
              {mic.on ? "■ 멈추기" : "🎤 말하기"}
            </button>
          )}
          <textarea
            className="input rc-input" rows={2} lang="de" spellCheck={false} value={made}
            onChange={(e) => setMade(e.target.value)} placeholder={`예: ${fix.to} 를 넣어 오늘 있었던 일로`}
          />
          {mic.interim && <div className="muted tiny" lang="de">{mic.interim}</div>}
          {mic.err && <div className="rc-err">{mic.err}</div>}
        </div>
      </div>

      <div className="cr-actions">
        <button className="btn primary" onClick={() => { mic.stop(); stopSpeaking(); onNext(item, shown.state, made.trim()); }}>
          {made.trim() ? "저장하고 다음" : "다음"}
        </button>
      </div>
    </section>
  );
}
