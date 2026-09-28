// 🔴 3문장 꺼내기 — 따라 말하기가 아니라 꺼내기 (기획서 2절 인출 화면, 0-2절 인출 연습).
//
//   한국어 뜻만 보인다 → 🎤 독일어로 말한다(또는 친다) → [정답 보기] → 맞은 단어 표시 + 원어민 발음 → 한 번 따라 말하기
//   막히면 첫 글자 힌트. 세 문장을 한 번씩 돈 뒤 **막힌 것만 한 번 더**(같은 세션 안 간격).
//   세 문장을 한 번씩 꺼내면 🔴 가 켜진다. 결과는 각 기록의 correction.recall 에 남긴다(CP4 인출 성공률).
//
// 문장은 오늘 교정 5단계에서 DE 로 보낸 것. 오늘 보낸 게 없으면 최근 7일 중 마지막 세 문장으로 연습한다.
// 암기(뜻↔문장 반복)는 Karten 몫이라 여기서는 한 세션만 돈다.

import { useCallback, useEffect, useMemo, useState } from "react";
import { loadEntriesRange, patchEntry } from "../lib/entryRepo";
import { keptSentences, scoreRecall, verdict, firstLetters } from "../lib/recall";
import { speak, stopSpeaking, sentenceAudio } from "../lib/audio";
import { useMic } from "../lib/useMic";
import { addDays } from "../lib/program";
import { KARTEN_URL, openApp } from "../lib/links";
import "../styles/listen.css";
import "../styles/recall.css";

const LABEL = { ok: "꺼냈어요", close: "거의 다", miss: "다시 한 번" };

export default function Recall({ userId, today, done, onDone, onClose, onError }) {
  const [list, setList] = useState(null); // [{ id, de, ko, day, entryId }]
  const [fromPast, setFromPast] = useState(false);
  const [entries, setEntries] = useState([]);
  const [queue, setQueue] = useState([]); // [{ i, round }]
  const [at, setAt] = useState(0);
  const [results, setResults] = useState([]); // [{ i, round, score, hint, gaveUp }]

  useEffect(() => {
    let alive = true;
    loadEntriesRange(userId, addDays(today, -7), today)
      .then((rows) => {
        if (!alive) return;
        const all = keptSentences(rows);
        const mine = all.filter((s) => s.day === today);
        const pick = mine.length ? mine : all.slice(-3);
        setEntries(rows);
        setFromPast(!mine.length && pick.length > 0);
        setList(pick);
        setQueue(pick.map((_, i) => ({ i, round: 1 })));
        pick.forEach((s) => sentenceAudio(s.id, s.de)); // 발음을 미리 준비 (정답을 열 때 바로 나오게)
      })
      .catch((e) => alive && (setList([]), onError(e.message)));
    return () => { alive = false; stopSpeaking(); };
  }, [userId, today, onError]);

  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const cur = queue[at];
  const finished = list && list.length > 0 && at >= queue.length;

  const record = useCallback((r) => {
    setResults((rs) => [...rs, r]);
    setQueue((q) => {
      // 1회차에 막힌 문장은 맨 뒤에 한 번 더 — 한 번만
      if (r.round === 1 && verdict(r.score) !== "ok") return [...q, { i: r.i, round: 2 }];
      return q;
    });
    setAt((n) => n + 1);
  }, []);

  // 끝나면 한 번만 저장
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!finished || saved) return;
    setSaved(true);
    if (!fromPast) onDone(); // 🔴 켜기 — 지난 문장으로 한 연습은 오늘 칸을 채우지 않는다
    const byEntry = new Map();
    for (const r of results) {
      const s = list[r.i];
      const first = results.find((x) => x.i === r.i && x.round === 1);
      if (!byEntry.has(s.entryId)) byEntry.set(s.entryId, new Map());
      byEntry.get(s.entryId).set(s.id, { id: s.id, first: Math.round((first?.score ?? 0) * 100) / 100, hint: !!first?.hint, again: results.some((x) => x.i === r.i && x.round === 2 && verdict(x.score) === "ok") });
    }
    for (const [entryId, m] of byEntry) {
      const e = entries.find((x) => x.id === entryId);
      if (!e?.correction) continue;
      const recall = [...(e.correction.recall || []), { at: new Date().toISOString(), day: today, items: [...m.values()] }].slice(-10);
      patchEntry(userId, entryId, { correction: { ...e.correction, recall } }).catch((err) => onError("꺼내기 기록 저장 실패: " + err.message));
    }
  }, [finished, saved, results, list, entries, fromPast, onDone, userId, today, onError]);

  const firstTry = useMemo(() => results.filter((r) => r.round === 1 && verdict(r.score) === "ok").length, [results]);

  return (
    <div className="lsn rc" role="dialog" aria-label="3문장 꺼내기">
      <div className="lsn-inner">
        <header className="lsn-head">
          <div className="lsn-src"><b>🔴 3문장 꺼내기</b> {list?.length > 0 && !finished && <span className="muted tiny">{Math.min(at + 1, queue.length)} / {queue.length}</span>}</div>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">✕</button>
        </header>

        {!list && <p className="muted pad">문장을 불러오는 중…</p>}

        {list && list.length === 0 && (
          <div className="notice soft">
            아직 꺼낼 문장이 없어요. <b>기록 → AI 교정 → 5단계</b>에서 외울 문장을 Fokus DE 로 보내면 여기서 연습해요.
          </div>
        )}

        {fromPast && !finished && (
          <p className="muted tiny rc-past">오늘 보낸 문장이 아직 없어서 최근 문장으로 연습해요. 이건 오늘 🔴 칸을 채우지 않아요.</p>
        )}

        {cur && list && (
          <RecallCard key={`${cur.i}-${cur.round}`} s={list[cur.i]} round={cur.round} onNext={(r) => record({ ...r, i: cur.i, round: cur.round })} />
        )}

        {finished && (
          <section className="rc-end">
            <div className="rc-big">{done || !fromPast ? "🔴 완료" : "연습 끝"}</div>
            <p>처음에 바로 꺼낸 문장 <b>{firstTry} / {list.length}</b></p>
            <ul className="rc-sum">
              {list.map((s, i) => {
                const r1 = results.find((x) => x.i === i && x.round === 1);
                const r2 = results.find((x) => x.i === i && x.round === 2);
                const v = verdict(r1?.score ?? 0);
                return (
                  <li key={s.id} className={v}>
                    <b lang="de">{s.de}</b>
                    <span className="muted tiny">
                      {s.ko} · {v === "ok" ? "바로 꺼냄" : r2 && verdict(r2.score) === "ok" ? "두 번째에 꺼냄" : "다음에 다시"}
                      {r1?.hint ? " · 힌트" : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="muted tiny">못 꺼낸 문장은 Karten 이 간격을 두고 다시 보여 줘요 — 여기서 반복하지 않아요.</p>
            <div className="cr-actions">
              {KARTEN_URL && <button className="link-btn" onClick={() => openApp(KARTEN_URL)}>외우기 <b>Karten</b> ↗</button>}
              <button className="btn primary" onClick={onClose}>닫기</button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

// ── 한 문장 ──────────────────────────────────────────────────────────────────
function RecallCard({ s, round, onNext }) {
  const [said, setSaid] = useState("");
  const [hint, setHint] = useState(false);
  const [shown, setShown] = useState(null); // { score, parts, gaveUp }
  const [voice, setVoice] = useState("");
  const mic = useMic(said, setSaid);

  const reveal = (gaveUp = false) => {
    mic.stop();
    const r = scoreRecall(gaveUp ? "" : said, s.de);
    setShown({ ...r, gaveUp });
    play(1);
  };
  const play = async (rate) => {
    const how = await speak(s.id, s.de, { rate });
    setVoice(how);
  };

  if (!shown) {
    return (
      <section className="rc-card">
        {round === 2 && <div className="rc-again">한 번 더 — 아까 막힌 문장</div>}
        <div className="rc-ko">{s.ko || "(뜻 없음)"}</div>
        <p className="muted tiny">이 뜻을 <b>독일어로</b> 말해 보세요. 소리 내서 — 머릿속으로만 하면 안 남아요.</p>
        {hint && <div className="rc-hint" lang="de">{firstLetters(s.de)}</div>}

        <div className="rc-say">
          {mic.ok && (
            <button className={`rc-mic ${mic.on ? "on" : ""}`} onClick={mic.toggle} aria-pressed={mic.on}>
              {mic.on ? "■ 멈추기" : "🎤 말하기"}
            </button>
          )}
          <textarea
            className="input rc-input" rows={2} lang="de" spellCheck={false} value={said}
            onChange={(e) => setSaid(e.target.value)}
            placeholder={mic.ok ? "말하면 여기 적혀요 (쳐도 돼요)" : "독일어로 쳐 보세요"}
          />
          {mic.interim && <div className="muted tiny" lang="de">{mic.interim}</div>}
          {mic.err && <div className="rc-err">{mic.err}</div>}
        </div>

        <div className="cr-actions">
          {!hint && <button className="btn" onClick={() => setHint(true)}>첫 글자 힌트</button>}
          <button className="btn" onClick={() => reveal(true)}>모르겠어요</button>
          <button className="btn primary" disabled={!said.trim()} onClick={() => reveal(false)}>정답 보기</button>
        </div>
      </section>
    );
  }

  const v = shown.gaveUp ? "miss" : verdict(shown.score);
  return (
    <section className="rc-card">
      <div className="rc-ko small">{s.ko}</div>
      <div className={`rc-verdict ${v}`}>
        {shown.gaveUp ? "정답을 보고 따라 말해 보세요" : `${LABEL[v]} · ${Math.round(shown.score * 100)}%`}
      </div>
      <p className="rc-answer" lang="de">
        {shown.parts.map((p, i) => (p.word ? <span key={i} className={p.hit ? "hit" : "miss"}>{p.t}</span> : <span key={i}>{p.t}</span>))}
      </p>
      {said.trim() && !shown.gaveUp && <p className="rc-said" lang="de"><span className="muted tiny">내가 말한 것 </span>{said}</p>}

      <div className="rc-play">
        <button className="btn" onClick={() => play(1)}>🔊 다시 듣기</button>
        <button className="btn" onClick={() => play(0.75)}>🐢 천천히</button>
        {voice === "device" && <span className="muted tiny">기기 목소리 (원어민 발음을 만들지 못했어요)</span>}
      </div>
      <p className="muted tiny">들은 대로 <b>한 번 따라 말하고</b> 넘어가세요.</p>

      <div className="cr-actions">
        <button className="btn primary" onClick={() => { stopSpeaking(); onNext({ score: shown.gaveUp ? 0 : shown.score, hint, gaveUp: shown.gaveUp }); }}>
          다음
        </button>
      </div>
    </section>
  );
}
