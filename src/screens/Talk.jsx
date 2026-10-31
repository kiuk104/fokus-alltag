// 🎙 실시간 대화 — AI 와 독일어로 말하고, 끝나면 복습할 것만 추린다.
// 기획: 「Fokus Alltag 실시간 말하기 교정 기능 기획」(2026-10-31) · 기획서 0-7절.
//
//   ① 고르기   주제 · 교정 방식(흐름 유지 / 선생님) · 인식 언어(독일어 고정 / 한국어 섞기) · 말 차례(자동 / 누르고 말하기) · 폰 위치
//   ② 대화     AI 목소리 + 대화록. 내 말은 "인식된 그대로" 따로 표시 — 음성 인식이 문법을 고쳐 적었는지 보이게.
//             최대 10분(TALK_MAX_MIN). 흐름 유지면 대화 중에 교정하지 않고, 선생님이면 틀린 곳을 바로 끊고 확인한다(대화 중에도 바꿀 수 있음).
//   ③ 정리     Claude 가 틀린 문장 · 한국어로 막힌 곳 · 새 표현을 추린다 → components/TalkReview.jsx 에서 골라 저장.
//
// 비용: 대화(OpenAI)는 끝날 때 한 줄, 정리(Claude)는 한 줄 — 둘 다 ai_usage_log(ai.js)에, 같은 이번 달 상한 안에서.

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { connectTalk, rtSupported } from "../lib/realtime";
import { usageNow, pickModel, recordUsage, MONTHLY_CAP } from "../lib/ai";
import {
  TOPICS, STYLES, LANGS, VOICES, TONES, SPEEDS, topicOf, talkInstructions, applyEvent, cleanLines, myLines, rtCost, transcribeCost, sumUsage,
  TALK_MAX_MIN, TALK_WARN_MIN, clock,
} from "../lib/talk";
import TalkReview from "../components/TalkReview";
import "../styles/listen.css";
import "../styles/recall.css";
import "../styles/correct.css";
import "../styles/talk.css";

// 설정은 기기에 기억 — 차에서 쓰는 사람은 늘 "누르고 말하기 · 거치대"
const PREF_KEY = "fa-talk-pref";
const LAST_KEY = "fa-talk-last"; // 정리 전에 닫혔을 때 대화록을 살려 두는 곳
const readJson = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || "null") ?? d; } catch { return d; } };
const writeJson = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 막힘 */ } };

const linesReducer = (lines, ev) => (ev === "reset" ? [] : applyEvent(lines, ev));

export default function Talk({ userId, today, month, onPatch, onClose, onError }) {
  const [pref, setPref] = useState(() => ({ topic: "tag", mode: "auto", noise: "near", style: "flow", lang: "de", voice: "marin", tone: "freundlich", speed: "normal", ...readJson(PREF_KEY, {}) }));
  const [phase, setPhase] = useState("setup"); // setup | connecting | live | review
  const [lines, dispatch] = useReducer(linesReducer, []);
  const [budget, setBudget] = useState(null); // { spent, todayCalls, block }
  const [sec, setSec] = useState(0);
  const [aiTalking, setAiTalking] = useState(false);
  const [hearing, setHearing] = useState(false);
  const [holding, setHolding] = useState(false);
  const [muted, setMuted] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null); // { lines, topic, seconds, cost, model } — 정리로 넘길 것
  const [last] = useState(() => readJson(LAST_KEY, null));

  const sess = useRef(null);
  const usages = useRef([]); // response.done 의 usage 들
  const cost = useRef(0);
  const startedAt = useRef(0);
  const linesRef = useRef(lines);
  linesRef.current = lines;
  const listRef = useRef(null);
  const wake = useRef(null);

  const savePref = (patch) => setPref((p) => { const n = { ...p, ...patch }; writeJson(PREF_KEY, n); return n; });

  // 남은 예산 — 상한에 닿았으면 시작 버튼을 막는다
  useEffect(() => {
    let alive = true;
    usageNow(userId)
      .then((u) => alive && setBudget({ ...u, block: pickModel(u).model ? "" : pickModel(u).reason }))
      .catch(() => alive && setBudget({ spent: 0, todayCalls: 0, block: "" }));
    return () => { alive = false; };
  }, [userId]);

  // 대화를 끝낸다 — 비용 기록 · 대화록 보관 · 정리로
  const finish = useCallback((reason = "") => {
    const s = sess.current;
    if (!s) return;
    sess.current = null;
    s.close();
    try { wake.current?.release(); } catch { /* 이미 풀림 */ }
    const seconds = Math.round((Date.now() - startedAt.current) / 1000);
    const total = cost.current;
    recordUsage(userId, { provider: "openai", model: s.model, kind: "alltag-talk", usage: sumUsage(usages.current), cost: total });
    const r = { lines: cleanLines(linesRef.current), topic: pref.topic, seconds, cost: total, model: s.model, day: today };
    writeJson(LAST_KEY, r);
    setResult(r);
    setPhase("review");
    if (reason) setErr(reason);
  }, [userId, pref.topic, today]);

  // 닫거나 화면을 떠나면 연결을 끊는다 (돈이 계속 나가지 않게). 값은 ref 로 — 의존값이 바뀔 때마다 끊기면 안 된다
  const ctx = useRef({});
  ctx.current = { userId, topic: pref.topic, today };
  useEffect(() => () => {
    const s = sess.current;
    if (!s) return;
    sess.current = null;
    s.close();
    const c = ctx.current;
    recordUsage(c.userId, { provider: "openai", model: s.model, kind: "alltag-talk", usage: sumUsage(usages.current), cost: cost.current });
    writeJson(LAST_KEY, { lines: cleanLines(linesRef.current), topic: c.topic, seconds: 0, cost: cost.current, model: s.model, day: c.today });
  }, []);

  // 시계 + 10분 상한
  useEffect(() => {
    if (phase !== "live") return;
    const id = setInterval(() => {
      const s = (Date.now() - startedAt.current) / 1000;
      setSec(s);
      if (s >= TALK_MAX_MIN * 60) finish(`${TALK_MAX_MIN}분이 지나서 대화를 마쳤어요.`);
    }, 500);
    return () => clearInterval(id);
  }, [phase, finish]);

  // 새 줄이 생기면 아래로
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  // Esc 로 닫기 (대화 중이면 끝내기)
  useEffect(() => {
    const k = (e) => {
      if (e.key === "Escape") { if (sess.current) finish(); else onClose(); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [finish, onClose]);

  const onEvent = useCallback((ev) => {
    dispatch(ev);
    switch (ev.type) {
      case "response.done":
        if (ev.response?.usage) {
          usages.current.push(ev.response.usage);
          cost.current += rtCost(sess.current?.model, ev.response.usage);
        }
        break;
      case "conversation.item.input_audio_transcription.completed":
        cost.current += transcribeCost(ev.usage);
        break;
      case "output_audio_buffer.started": setAiTalking(true); break;
      case "output_audio_buffer.stopped":
      case "output_audio_buffer.cleared": setAiTalking(false); break;
      case "input_audio_buffer.speech_started": setHearing(true); break;
      case "input_audio_buffer.speech_stopped":
      case "input_audio_buffer.committed": setHearing(false); break;
      default:
    }
  }, []);

  const start = async () => {
    setErr("");
    dispatch("reset");
    usages.current = [];
    cost.current = 0;
    setPhase("connecting");
    try {
      const s = await connectTalk({
        instructions: talkInstructions(pref.topic, { month, style: pref.style, tone: pref.tone }),
        voice: pref.voice,
        speed: SPEEDS.find((s) => s.key === pref.speed)?.value || 1,
        mode: pref.mode,
        noise: pref.noise,
        lang: pref.lang,
        onEvent,
        onError: setErr,
        onState: (st) => st === "closed" && sess.current && finish(),
      });
      sess.current = s;
      startedAt.current = Date.now();
      setSec(0);
      setMuted(false);
      setPhase("live");
      try { wake.current = await navigator.wakeLock?.request("screen"); } catch { /* 지원 안 함 */ }
    } catch (e) {
      setErr(e.message);
      setPhase("setup");
    }
  };

  // 교정 방식은 대화 중에도 바꾼다 — 지시문만 갈아 끼운다
  const setStyle = (style) => {
    savePref({ style });
    sess.current?.setInstructions(talkInstructions(pref.topic, { month, style, tone: pref.tone }));
  };

  const setMode = (mode) => {
    savePref({ mode });
    sess.current?.setMode(mode);
    setHolding(false);
  };

  // 누르고 말하기 — 손가락 · 마우스 · 스페이스바
  const down = (e) => { e.preventDefault(); if (holding) return; setHolding(true); sess.current?.press(); };
  const up = () => { if (!holding) return; setHolding(false); sess.current?.release(); };
  useEffect(() => {
    if (phase !== "live" || pref.mode !== "ptt") return;
    const kd = (e) => { if (e.code === "Space" && !e.repeat && !holding) { e.preventDefault(); setHolding(true); sess.current?.press(); } };
    const ku = (e) => { if (e.code === "Space") { e.preventDefault(); setHolding(false); sess.current?.release(); } };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => { window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); };
  }, [phase, pref.mode, holding]);

  const topic = topicOf(pref.topic);
  const warn = phase === "live" && sec >= TALK_WARN_MIN * 60;

  return (
    <div className="lsn tk" role="dialog" aria-label="실시간 대화">
      <div className="lsn-inner">
        <header className="lsn-head">
          <div className="lsn-src">
            <b>🎙 실시간 대화</b>{" "}
            {phase === "live" && <span className={`muted tiny ${warn ? "tk-warn" : ""}`}>{clock(sec)} / {TALK_MAX_MIN}:00 · ${cost.current.toFixed(3)}</span>}
          </div>
          <button className="icon-btn" onClick={() => (sess.current ? finish() : onClose())} aria-label="닫기">✕</button>
        </header>

        {err && <div className="notice error" onClick={() => setErr("")}>{err}</div>}

        {(phase === "setup" || phase === "connecting") && (
          <Setup
            pref={pref} savePref={savePref} budget={budget} last={last} connecting={phase === "connecting"}
            onStart={start}
            onResume={() => { setResult(last); setPhase("review"); }}
          />
        )}

        {phase === "live" && (
          <>
            <div className="tk-topic muted tiny">{topic.icon} {topic.label} · {pref.mode === "ptt" ? "누르고 말하기" : "자동 차례"} · {pref.style === "teacher" ? "선생님 모드" : "흐름 유지"}</div>
            <ul className="tk-lines" ref={listRef} aria-live="polite">
              {lines.length === 0 && <li className="tk-wait muted">AI 가 먼저 말을 걸어요…</li>}
              {lines.map((l) => (
                <li key={l.id} className={`tk-line ${l.who}`}>
                  {l.who === "me" && <span className="tk-who">인식된 내 말</span>}
                  <span lang="de" className="tk-text">
                    {l.text || (l.failed ? "(못 알아들었어요)" : "…")}
                  </span>
                </li>
              ))}
            </ul>

            <div className="tk-status muted tiny">
              {aiTalking ? "🔊 AI 가 말하는 중" : holding ? "🎤 듣는 중 — 다 말하면 손을 떼세요" : hearing ? "🎤 듣는 중" : pref.mode === "ptt" ? "버튼을 누르고 있는 동안 말해요" : muted ? "마이크 꺼짐" : "말하세요 — 잠깐 멈춰도 기다려 줘요"}
            </div>

            {pref.mode === "ptt" ? (
              <button
                className={`tk-ptt ${holding ? "on" : ""}`}
                onPointerDown={down} onPointerUp={up} onPointerLeave={up} onPointerCancel={up}
                onContextMenu={(e) => e.preventDefault()}
              >
                {holding ? "말하는 중…" : "누르고 말하기"}
              </button>
            ) : (
              <button className={`tk-ptt soft ${muted ? "" : "on"}`} onClick={() => { const m = !muted; setMuted(m); sess.current?.mute(m); }}>
                {muted ? "🎤 마이크 켜기" : "⏸ 잠깐 마이크 끄기"}
              </button>
            )}

            <div className="tk-row">
              <div className="tk-switches">
                <div className="chips tk-chips">
                  <button className={`chip ${pref.mode === "auto" ? "on" : ""}`} onClick={() => setMode("auto")}>자동</button>
                  <button className={`chip ${pref.mode === "ptt" ? "on" : ""}`} onClick={() => setMode("ptt")}>누르고 말하기</button>
                </div>
                <div className="chips tk-chips">
                  {STYLES.map((s) => (
                    <button key={s.key} className={`chip ${pref.style === s.key ? "on" : ""}`} onClick={() => setStyle(s.key)}>{s.label}</button>
                  ))}
                </div>
              </div>
              <button className="btn primary" onClick={() => finish()}>끝내고 정리하기</button>
            </div>
            {warn && <p className="tk-warn tiny">1분 뒤 저절로 끝나요.</p>}
          </>
        )}

        {phase === "review" && result && (
          <TalkReview
            result={result} userId={userId} today={today} month={month}
            onSaved={() => { writeJson(LAST_KEY, null); onPatch({ speak: true }); }}
            onDiscard={() => { writeJson(LAST_KEY, null); onClose(); }}
            onAgain={() => { writeJson(LAST_KEY, null); setResult(null); setPhase("setup"); }}
            onClose={onClose} onError={onError}
          />
        )}
      </div>
    </div>
  );
}

// ── ① 고르기 ─────────────────────────────────────────────────────────────────
function Setup({ pref, savePref, budget, last, connecting, onStart, onResume }) {
  const ok = rtSupported();
  const hasLast = last && myLines(last.lines).length > 0;
  return (
    <section className="tk-setup">
      <p className="cr-lead">
        AI 와 독일어로 대화해요. 막히는 단어는 <b>한국어로 말해도 돼요</b> — “Ich möchte 소포 abholen” 처럼.
        {pref.style === "teacher" ? "틀리면 그 자리에서 확인하고 고쳐 주고, " : "대화 중에는 끊지 않고, "}
        끝나면 틀린 문장·막힌 단어·새 표현만 골라 드려요.
      </p>

      {hasLast && (
        <div className="notice soft tk-last">
          정리하지 않은 대화가 있어요 ({last.day} · 내 말 {myLines(last.lines).length}줄).
          <button className="btn small" onClick={onResume}>이어서 정리</button>
        </div>
      )}

      <div className="cr-label">주제</div>
      <div className="tk-topics">
        {TOPICS.map((t) => (
          <button key={t.key} className={`tk-topic-btn ${pref.topic === t.key ? "on" : ""}`} onClick={() => savePref({ topic: t.key })}>
            <span aria-hidden>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      <div className="cr-label">AI 목소리</div>
      <div className="tk-voices">
        {VOICES.map((v) => (
          <button key={v.key} className={`tk-voice ${pref.voice === v.key ? "on" : ""}`} onClick={() => savePref({ voice: v.key })}>
            <b>{v.label}</b><span>{v.desc}</span>
          </button>
        ))}
      </div>

      <div className="cr-label">말투 · 빠르기</div>
      <div className="chips">
        {TONES.map((t) => (
          <button key={t.key} className={`chip ${pref.tone === t.key ? "on" : ""}`} onClick={() => savePref({ tone: t.key })}>{t.label}</button>
        ))}
      </div>
      <div className="chips">
        {SPEEDS.map((s) => (
          <button key={s.key} className={`chip ${pref.speed === s.key ? "on" : ""}`} onClick={() => savePref({ speed: s.key })}>{s.label}</button>
        ))}
      </div>

      <div className="cr-label">교정 방식</div>
      <div className="chips">
        {STYLES.map((s) => (
          <button key={s.key} className={`chip ${pref.style === s.key ? "on" : ""}`} onClick={() => savePref({ style: s.key })}>{s.label} — {s.desc}</button>
        ))}
      </div>
      {pref.style === "teacher" && (
        <p className="muted tiny">틀리면 AI 가 바로 끊고 “혹시 이 말 하려던 거예요? — … 이렇게 말하는 게 맞아요” 하고 확인한 뒤, 한 번 따라 말하게 해요. 끝나고 정리도 그대로 해요.</p>
      )}

      <div className="cr-label">인식 언어 <span className="muted">— 화면에 보이는 “인식된 내 말”</span></div>
      <div className="chips">
        {LANGS.map((l) => (
          <button key={l.key} className={`chip ${pref.lang === l.key ? "on" : ""}`} onClick={() => savePref({ lang: l.key })}>{l.label} — {l.desc}</button>
        ))}
      </div>

      <div className="cr-label">말 차례</div>
      <div className="chips">
        <button className={`chip ${pref.mode === "auto" ? "on" : ""}`} onClick={() => savePref({ mode: "auto" })}>자동 — “음…” 해도 기다려 줌</button>
        <button className={`chip ${pref.mode === "ptt" ? "on" : ""}`} onClick={() => savePref({ mode: "ptt" })}>누르고 말하기 — 시끄러운 곳</button>
      </div>

      <div className="cr-label">폰 위치</div>
      <div className="chips">
        <button className={`chip ${pref.noise === "near" ? "on" : ""}`} onClick={() => savePref({ noise: "near" })}>입 가까이 · 이어폰</button>
        <button className={`chip ${pref.noise === "far" ? "on" : ""}`} onClick={() => savePref({ noise: "far" })}>거치대 · 멀리</button>
      </div>

      <p className="muted tiny">
        한 번에 최대 {TALK_MAX_MIN}분. 10분이면 대략 $0.1~0.3 이 들어요 (Claude 교정과 같은 이번 달 상한 ${MONTHLY_CAP}
        {budget ? ` 중 $${budget.spent.toFixed(2)} 사용` : ""}).
      </p>
      {budget?.block && <div className="notice soft">{budget.block}</div>}
      {!ok && <div className="notice soft">이 브라우저는 실시간 대화를 못 해요. Chrome 이나 Safari 에서 열어 주세요.</div>}

      <div className="cr-actions">
        <button className="btn primary tk-start" disabled={!ok || connecting || !budget || !!budget.block} onClick={onStart}>
          {connecting ? "연결하는 중…" : "🎙 대화 시작"}
        </button>
      </div>
    </section>
  );
}
