// 🎙 대화 후 정리 — Claude 가 추린 것 중 복습할 것만 골라 저장 (screens/Talk.jsx ③).
//
//   틀린 문장   내 말(틀린 곳 취소선) → 고친 문장 + 한국어 설명      → 오답 노트(며칠 뒤 다시 고쳐 쓰기)
//   한국어로 막힌 곳  “소포” → das Paket + 그 말을 넣은 문장
//   새 표현     대화에서 나온, 외워 둘 만한 문장
//   발음        AI 가 지적했거나 다르게 들린 단어 + 입 모양 팁 (보기만 — 기록에는 남는다)
//   저장한 뒤 [🗣 이 문장들로 발음 연습] → 같은 화면에서 발음 코치 대화로.
//   [Fokus DE 로도 보내기] 를 켜 두면 고른 문장이 DE 단어장 Alltag → Karten 복습 · 오늘 🔴 3문장 꺼내기로 간다.

import { useEffect, useMemo, useState } from "react";
import { askClaude } from "../lib/ai";
import { saveEntry, patchEntry } from "../lib/entryRepo";
import { loadSentenceTags, tagsFor, insertSentences, NOTEBOOK } from "../lib/deWrite";
import { speakText, stopSpeaking } from "../lib/audio";
import { KARTEN_URL, openApp } from "../lib/links";
import {
  REVIEW_SYSTEM, reviewPrompt, parseReview, defaultPicked, toggleMisheard, keepRows, talkEntry, topicOf, myLines, clock,
} from "../lib/talk";

const TALK_TAG = "Sprechen";

export default function TalkReview({ result, userId, today, month, onSaved, onDiscard, onAgain, onPron, onClose, onError }) {
  const [review, setReview] = useState(null);
  const [picked, setPicked] = useState(null);
  const [state, setState] = useState("loading"); // loading | ready | empty | failed | saving | saved
  const [why, setWhy] = useState("");
  const [toDe, setToDe] = useState(true);
  const [saved, setSaved] = useState(null); // { fixes, sent }
  const [showAll, setShowAll] = useState(false);
  const [tries, setTries] = useState(0);
  const mine = myLines(result.lines);
  const topic = topicOf(result.topic);

  useEffect(() => () => stopSpeaking(), []);

  useEffect(() => {
    if (!mine.length) { setState("empty"); return; }
    let alive = true;
    setState("loading");
    askClaude(userId, {
      system: REVIEW_SYSTEM,
      prompt: reviewPrompt(result.lines, { topicLabel: topic.label }),
      maxTokens: 3500,
      kind: "alltag-talk-review",
    })
      .then((r) => {
        if (!alive) return;
        const rv = parseReview(r.text);
        setReview(rv);
        setPicked(defaultPicked(rv));
        setState("ready");
      })
      .catch((e) => { if (alive) { setWhy(e.message); setState("failed"); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tries]);

  const flip = (group, i) => setPicked((p) => ({ ...p, [group]: p[group].map((v, j) => (j === i ? !v : v)) }));
  // 인식 오류 (2026-10-31) — 음성 인식이 잘못 적은 것은 내 실수가 아니다 → 오답 노트에 들어가면 안 한 실수를 연습하게 된다
  const mis = (group, i) => setPicked((p) => toggleMisheard(p, group, i));
  const isMis = (group, i) => !!picked?.mis?.[group]?.[i];
  const rows = useMemo(() => (review && picked ? keepRows(review, picked) : []), [review, picked]);
  const nFix = picked ? picked.fixes.filter(Boolean).length : 0;
  const nMis = picked?.mis ? [...picked.mis.fixes, ...picked.mis.korean].filter(Boolean).length : 0;
  const total = picked ? [...picked.fixes, ...picked.korean, ...picked.phrases].filter(Boolean).length : 0;

  const save = async () => {
    setState("saving");
    try {
      const entry = talkEntry({
        day: today, month, topic: result.topic, lines: result.lines, review, picked,
        seconds: result.seconds, cost: result.cost, model: result.model,
      });
      let row = await saveEntry(userId, entry);
      let sent = 0;
      if (toDe && rows.length) {
        try {
          const existing = await loadSentenceTags(userId);
          const ids = await insertSentences(
            userId,
            rows.map((r) => ({
              de: r.de, ko: r.ko,
              tags: tagsFor({ topic: TALK_TAG }, { month, existing, grammarLabel: "" }).tags,
              note: `Fokus Alltag 🎙 ${topic.label} · ${today}${r.note ? ` · ${r.note}` : ""}`,
            }))
          );
          row = await patchEntry(userId, row.id, {
            correction: {
              ...row.correction,
              progress: { ...row.correction.progress, saved: true, sentIds: ids, keepEdited: rows.map((r) => ({ de: r.de, ko: r.ko, on: true })) },
            },
          });
          sent = ids.length;
        } catch (e) {
          onError("대화는 저장했지만 DE 로 보내지 못했어요: " + e.message);
        }
      }
      setSaved({ fixes: row.correction?.data?.b1?.fixes?.length || 0, sent, rows: rows.map((r) => r.de) });
      setState("saved");
      onSaved();
    } catch (e) {
      setState("ready");
      onError("저장 실패: " + e.message + " — 대화록은 이 기기에 남아 있어요.");
    }
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(`${REVIEW_SYSTEM}\n\n${reviewPrompt(result.lines, { topicLabel: topic.label })}`);
      setWhy((w) => `${w}\n\n복사했어요. Claude 앱에 붙여 넣으면 같은 정리를 받을 수 있어요.`);
    } catch { /* 복사 막힘 */ }
  };

  const transcript = (
    <details className="lsn-paste tk-transcript" open={showAll} onToggle={(e) => setShowAll(e.currentTarget.open)}>
      <summary>대화록 · {clock(result.seconds)} · 내 말 {mine.length}줄</summary>
      <ul className="lsn-paste-body tk-lines flat">
        {result.lines.map((l, i) => (
          <li key={i} className={`tk-line ${l.who}`}>
            {l.who === "me" && <span className="tk-who">인식된 내 말</span>}
            <span lang="de" className="tk-text">{l.text}</span>
          </li>
        ))}
      </ul>
    </details>
  );

  if (state === "empty") {
    return (
      <section className="tk-review">
        <div className="notice soft">이번 대화에서 받아 적힌 내 말이 없어요. 마이크가 꺼져 있었거나 너무 조용했을 수 있어요.</div>
        <div className="cr-actions">
          <button className="btn" onClick={onDiscard}>닫기</button>
          <button className="btn primary" onClick={onAgain}>다시 대화하기</button>
        </div>
      </section>
    );
  }

  if (state === "loading") {
    return (
      <section className="tk-review">
        <p className="cr-lead">대화를 정리하는 중이에요… 틀린 문장 · 한국어로 막힌 곳 · 새 표현을 고르고 있어요.</p>
        {transcript}
      </section>
    );
  }

  if (state === "failed") {
    return (
      <section className="tk-review">
        <div className="notice soft" style={{ whiteSpace: "pre-line" }}>정리하지 못했어요: {why}</div>
        {transcript}
        <div className="cr-actions">
          <button className="btn" onClick={copyPrompt}>정리 요청 복사</button>
          <button className="btn" onClick={onDiscard}>버리고 닫기</button>
          <button className="btn primary" onClick={() => setTries((n) => n + 1)}>다시 시도</button>
        </div>
      </section>
    );
  }

  if (state === "saved") {
    return (
      <section className="tk-review">
        <div className="rc-big">✓ 저장했어요</div>
        <ul className="rc-sum">
          {saved.fixes > 0 && <li className="ok"><b>오답 노트 {saved.fixes}개</b><span className="muted tiny">내일부터 오늘 화면 ✏️ 에서 다시 고쳐 써요.</span></li>}
          {saved.sent > 0 && <li className="ok"><b>Fokus DE 단어장 {NOTEBOOK} · {saved.sent}문장</b><span className="muted tiny">Karten 에서 외우고, 오늘 🔴 3문장 꺼내기에도 나와요.</span></li>}
          {!saved.fixes && !saved.sent && <li><b>대화 기록만 저장했어요</b></li>}
        </ul>
        <div className="cr-actions">
          {saved.sent > 0 && KARTEN_URL && <button className="link-btn" onClick={() => openApp(KARTEN_URL)}>외우기 <b>Karten</b> ↗</button>}
          {saved.rows.length > 0 && onPron && <button className="btn" onClick={() => onPron(saved.rows)}>🗣 이 문장들로 발음 연습</button>}
          <button className="btn" onClick={onAgain}>한 번 더</button>
          <button className="btn primary" onClick={onClose}>닫기</button>
        </div>
      </section>
    );
  }

  // ready | saving
  const { summary, fixes, korean, phrases, pron = [] } = review;
  return (
    <section className="tk-review">
      {summary && <p className="cr-lead tk-summary">{summary}</p>}

      {fixes.length > 0 && (
        <>
          <div className="cr-label">틀린 문장 <span className="muted">— 인식된 내 말 → 고친 문장</span></div>
          <p className="muted tiny">내가 한 말이 아니라 음성 인식이 잘못 적은 것이면 [인식 오류] — 오답 노트에 안 들어가요.</p>
          <ul className="tk-items">
            {fixes.map((f, i) => (
              <li key={i} className={picked.fixes[i] ? "" : "off"}>
                <label className="cr-on"><input type="checkbox" checked={picked.fixes[i]} disabled={isMis("fixes", i)} onChange={() => flip("fixes", i)} /></label>
                <div className="tk-item">
                  <p className="tk-said" lang="de">
                    {f.from ? <Marked text={f.said} part={f.from} cls="tk-wrong" /> : f.said}
                    <button className={`tk-mis ${isMis("fixes", i) ? "on" : ""}`} onClick={() => mis("fixes", i)}>
                      {isMis("fixes", i) ? "✓ 인식 오류" : "인식 오류"}
                    </button>
                  </p>
                  <p className="tk-better" lang="de">
                    {f.to ? <Marked text={f.better} part={f.to} cls="tk-right" /> : f.better}
                    <button className="tk-play" onClick={() => speakText(f.better)} aria-label="발음 듣기">🔊</button>
                  </p>
                  <p className="muted tiny">{f.type && <span className="tk-type">{f.type}</span>} {f.why}</p>
                  {f.ko && <p className="muted tiny">{f.ko}</p>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {korean.length > 0 && (
        <>
          <div className="cr-label">한국어로 막힌 곳</div>
          <ul className="tk-items">
            {korean.map((k, i) => (
              <li key={i} className={picked.korean[i] ? "" : "off"}>
                <label className="cr-on"><input type="checkbox" checked={picked.korean[i]} disabled={isMis("korean", i)} onChange={() => flip("korean", i)} /></label>
                <div className="tk-item">
                  <p className="tk-ko">
                    <span>{k.ko}</span> → <b lang="de">{k.de}</b>
                    <button className={`tk-mis ${isMis("korean", i) ? "on" : ""}`} onClick={() => mis("korean", i)}>
                      {isMis("korean", i) ? "✓ 인식 오류" : "인식 오류"}
                    </button>
                  </p>
                  {k.better && (
                    <p className="tk-better" lang="de">
                      {k.better}
                      <button className="tk-play" onClick={() => speakText(k.better)} aria-label="발음 듣기">🔊</button>
                    </p>
                  )}
                  {k.said && <p className="muted tiny" lang="de">내 말: {k.said}</p>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {phrases.length > 0 && (
        <>
          <div className="cr-label">새로 배운 표현</div>
          <ul className="tk-items">
            {phrases.map((p, i) => (
              <li key={i} className={picked.phrases[i] ? "" : "off"}>
                <label className="cr-on"><input type="checkbox" checked={picked.phrases[i]} onChange={() => flip("phrases", i)} /></label>
                <div className="tk-item">
                  <p className="tk-better" lang="de">
                    {p.de}
                    <button className="tk-play" onClick={() => speakText(p.de)} aria-label="발음 듣기">🔊</button>
                  </p>
                  <p className="muted tiny">{p.ko}{p.note ? ` · ${p.note}` : ""}</p>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {pron.length > 0 && (
        <>
          <div className="cr-label">발음 <span className="muted">— 다르게 들린 단어</span></div>
          <ul className="tk-items tk-pron">
            {pron.map((p, i) => (
              <li key={i}>
                <div className="tk-item">
                  <p className="tk-better" lang="de">
                    {p.word}
                    <button className="tk-play" onClick={() => speakText(p.word)} aria-label="발음 듣기">🔊</button>
                    <button className="tk-play" onClick={() => speakText(p.word, { rate: 0.7 })} aria-label="천천히 듣기">🐢</button>
                  </p>
                  {p.heard && p.heard !== p.word && <p className="muted tiny" lang="de">인식된 말: {p.heard}</p>}
                  {p.issue && <p className="tiny">{p.issue}</p>}
                  {p.tip && <p className="muted tiny">💡 {p.tip}</p>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {!fixes.length && !korean.length && !phrases.length && !pron.length && (
        <div className="notice soft">고칠 곳이 거의 없었어요. 대화 기록만 저장할 수 있어요.</div>
      )}

      {transcript}

      <label className="tk-toggle">
        <input type="checkbox" checked={toDe} onChange={(e) => setToDe(e.target.checked)} />
        고른 문장을 Fokus DE 로도 보내기 <span className="muted tiny">({rows.length}문장 → 단어장 {NOTEBOOK} · Karten 복습)</span>
      </label>
      <p className="muted tiny">
        틀린 곳 {nFix}개는 오답 노트로 들어가요.
        {nMis > 0 && ` 인식 오류 ${nMis}개는 빼고, 기록에만 남겨요.`}
      </p>

      <div className="cr-actions">
        <button className="btn" onClick={onDiscard} disabled={state === "saving"}>저장 안 함</button>
        <button className="btn primary" onClick={save} disabled={state === "saving"}>
          {state === "saving" ? "저장하는 중…" : total ? `고른 ${total}개 저장` : "기록 저장"}
        </button>
      </div>
    </section>
  );
}

/** text 안의 part 한 곳을 감싸서 보여 준다 */
function Marked({ text, part, cls }) {
  const i = text.indexOf(part);
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}<span className={cls}>{part}</span>{text.slice(i + part.length)}
    </>
  );
}
