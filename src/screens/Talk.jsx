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
  TOPICS, STYLES, LANGS, VOICES, TONES, SPEEDS, DRIVE, DRIVE_RULE, continueRule, topicOf, talkInstructions, applyEvent, cleanLines, myLines, rtCost, transcribeCost, sumUsage,
  TALK_MAX_MIN, TALK_WARN_MIN, clock,
} from "../lib/talk";
import TalkReview from "../components/TalkReview";
import PastTalks from "../components/PastTalks";
import { loadEntriesRange } from "../lib/entryRepo";
import { keptSentences } from "../lib/recall";
import { addDays } from "../lib/program";
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
  const [pref, setPref] = useState(() => ({ topic: "tag", mode: "auto", noise: "near", style: "flow", lang: "de", voice: "marin", tone: "freundlich", speed: "normal", filler: "ignore", pron: false, ...readJson(PREF_KEY, {}) }));
  const [phase, setPhase] = useState("setup"); // setup | connecting | live | paused | review
  const [drive, setDrive] = useState(false); // 🚗 운전 모드 — 이번 대화에만
  const [run, setRun] = useState({ topic: null, sentences: [] }); // 이번 대화의 주제·연습 문장 (발음 연습을 정리 화면에서 바로 열 때 주제가 바뀐다)
  const [lines, dispatch] = useReducer(linesReducer, []);
  const [budget, setBudget] = useState(null); // { spent, todayCalls, block }
  const [sec, setSec] = useState(0);
  const [aiTalking, setAiTalking] = useState(false);
  const [hearing, setHearing] = useState(false);
  const [holding, setHolding] = useState(false);
  const [muted, setMuted] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null); // { lines, topic, seconds, cost, model } — 정리로 넘길 것
  const [last, setLast] = useState(() => readJson(LAST_KEY, null)); // 정리하지 않은 대화 (시작 화면 알림)
  const forgetLast = () => { writeJson(LAST_KEY, null); setLast(null); };

  // 이번 대화의 실제 설정 — 운전 모드면 운전용 값을 덮어쓴다(저장된 설정은 그대로)
  const cfg = drive ? { ...pref, ...DRIVE } : pref;

  const sess = useRef(null);
  const runRef = useRef(run);
  runRef.current = run;
  const usages = useRef([]); // 이번 구간의 response.done usage 들
  const cost = useRef(0); // 이번 구간 비용 (구간 = 한 번 연결, 최대 10분)
  const total = useRef({ sec: 0, cost: 0 }); // 이어서 한 구간까지 합친 것
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

  const snapshot = (model) => ({
    lines: cleanLines(linesRef.current), topic: runRef.current.topic || pref.topic, seconds: total.current.sec, cost: total.current.cost, model, day: today,
  });

  /**
   * 구간을 끝낸다 — 비용 기록(구간마다 한 줄) · 대화록 보관.
   * pause 면 "이어서 10분" 을 기다리고, 아니면 정리로.
   */
  const finish = useCallback((reason = "", pause = false) => {
    const s = sess.current;
    if (!s) return;
    sess.current = null;
    s.close();
    try { wake.current?.release(); } catch { /* 이미 풀림 */ }
    total.current.sec += Math.round((Date.now() - startedAt.current) / 1000);
    total.current.cost += cost.current;
    recordUsage(userId, { provider: "openai", model: s.model, kind: "alltag-talk", usage: sumUsage(usages.current), cost: cost.current });
    const r = snapshot(s.model);
    writeJson(LAST_KEY, r);
    setAiTalking(false);
    setHearing(false);
    setHolding(false);
    if (pause && r.lines.length) {
      setResult(r);
      setPhase("paused");
    } else {
      setResult(r);
      setPhase("review");
    }
    if (reason) setErr(reason);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    writeJson(LAST_KEY, {
      lines: cleanLines(linesRef.current), topic: c.topic, seconds: total.current.sec,
      cost: total.current.cost + cost.current, model: s.model, day: c.today,
    });
  }, []);

  // 시계 + 10분 상한 — 끝나면 정리로 바로 가지 않고 "이어서 10분" 을 기다린다
  useEffect(() => {
    if (phase !== "live") return;
    const id = setInterval(() => {
      const s = (Date.now() - startedAt.current) / 1000;
      setSec(s);
      if (s >= TALK_MAX_MIN * 60) finish("", true);
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
      if (e.key === "Escape") { if (sess.current) finish(); else if (phase !== "paused") onClose(); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [finish, onClose, phase]);

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

  /**
   * 연결. cont = 이어서 10분 (대화록·합계 유지, 앞 대화를 지시문에 붙인다)
   * topicKey · sentences: 정리 화면에서 [🗣 발음 연습] 으로 바로 열 때
   */
  const start = async ({ driveMode = drive, cont = false, topicKey = null, sentences = null } = {}) => {
    setErr("");
    let r = runRef.current;
    if (!cont) {
      dispatch("reset");
      total.current = { sec: 0, cost: 0 };
      setDrive(driveMode);
      const tk = topicKey || pref.topic;
      let sent = sentences || [];
      // 🗣 발음 연습 — 문장을 안 줬으면 최근 7일 Fokus DE 로 보낸 내 문장 (없으면 AI 가 고른다)
      if (topicOf(tk).coach && !sentences) {
        try { sent = keptSentences(await loadEntriesRange(userId, addDays(today, -7), today)).slice(-8).map((s) => s.de); } catch { sent = []; }
      }
      r = { topic: tk, sentences: sent };
      setRun(r);
      runRef.current = r;
    }
    usages.current = [];
    cost.current = 0;
    const base = { ...pref, topic: r.topic || pref.topic };
    const coach = topicOf(base.topic).coach;
    const c = driveMode ? { ...base, ...DRIVE } : coach ? { ...base, lang: "de" } : base; // 발음 연습은 받아쓰기를 독일어로 — 다르게 들린 단어가 보이게
    const extra = [driveMode ? DRIVE_RULE : "", cont ? continueRule(linesRef.current) : ""].filter(Boolean).join("\n\n");
    setPhase("connecting");
    try {
      const s = await connectTalk({
        instructions: talkInstructions(c.topic, { month, style: c.style, tone: c.tone, pron: c.pron, sentences: r.sentences, extra }),
        voice: c.voice,
        speed: SPEEDS.find((x) => x.key === c.speed)?.value || 1,
        mode: c.mode,
        noise: c.noise,
        lang: c.lang,
        guard: c.filler !== "off",
        onEvent,
        onError: setErr,
        // 신호가 끊기면 정리로 가지 않고 "이어서" 를 기다린다 — 배송 중엔 터널·지하 주차장이 흔하다
        onState: (st) => st === "closed" && sess.current && finish("", true),
      });
      sess.current = s;
      startedAt.current = Date.now();
      setSec(0);
      setMuted(false);
      setPhase("live");
      try { wake.current = await navigator.wakeLock?.request("screen"); } catch { /* 지원 안 함 */ }
    } catch (e) {
      setErr(e.message);
      setPhase(cont ? "paused" : "setup");
    }
  };

  // 교정 방식은 대화 중에도 바꾼다 — 지시문만 갈아 끼운다
  const setStyle = (style) => {
    savePref({ style });
    sess.current?.setInstructions(talkInstructions(runRef.current.topic || pref.topic, { month, style, tone: pref.tone, pron: pref.pron, sentences: runRef.current.sentences }));
  };

  const setMode = (mode) => {
    savePref({ mode });
    sess.current?.setMode(mode);
    setHolding(false);
  };

  const toggleMute = () => { const m = !muted; setMuted(m); sess.current?.mute(m); };

  // 누르고 말하기 — 손가락 · 마우스 · 스페이스바
  const down = (e) => { e.preventDefault(); if (holding) return; setHolding(true); sess.current?.press(); };
  const up = () => { if (!holding) return; setHolding(false); sess.current?.release(); };
  useEffect(() => {
    if (phase !== "live" || cfg.mode !== "ptt") return;
    const kd = (e) => { if (e.code === "Space" && !e.repeat && !holding) { e.preventDefault(); setHolding(true); sess.current?.press(); } };
    const ku = (e) => { if (e.code === "Space") { e.preventDefault(); setHolding(false); sess.current?.release(); } };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => { window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); };
  }, [phase, cfg.mode, holding]);

  const topic = topicOf(run.topic || pref.topic);
  const warn = phase === "live" && sec >= TALK_WARN_MIN * 60;
  const status = aiTalking ? "ai" : holding || hearing ? "hear" : muted ? "muted" : "idle";

  return (
    <div className={`lsn tk ${drive && (phase === "live" || phase === "paused") ? "tk-drive-on" : ""}`} role="dialog" aria-label="실시간 대화">
      <div className="lsn-inner">
        <header className="lsn-head">
          <div className="lsn-src">
            <b>{drive ? "🚗 운전 모드" : "🎙 실시간 대화"}</b>{" "}
            {phase === "live" && !drive && <span className={`muted tiny ${warn ? "tk-warn" : ""}`}>{clock(sec)} / {TALK_MAX_MIN}:00 · ${(total.current.cost + cost.current).toFixed(3)}</span>}
          </div>
          <button className="icon-btn" onClick={() => (sess.current ? finish() : phase === "paused" ? setPhase("review") : onClose())} aria-label="닫기">✕</button>
        </header>

        {err && <div className="notice error" onClick={() => setErr("")}>{err}</div>}

        {(phase === "setup" || (phase === "connecting" && !result)) && (
          <Setup
            pref={pref} savePref={savePref} budget={budget} last={last} connecting={phase === "connecting"}
            onStart={() => start({ driveMode: false })}
            onDrive={() => start({ driveMode: true })}
            onResume={() => { setResult(last); setPhase("review"); }}
            onDropLast={forgetLast}
            userId={userId} today={today} onError={onError}
          />
        )}

        {phase === "live" && drive && (
          <section className="tk-drive">
            <div className={`tk-orb ${status}`} aria-live="polite">
              <span className="tk-orb-icon" aria-hidden>{status === "ai" ? "🔊" : status === "hear" ? "🎤" : status === "muted" ? "🔇" : "💬"}</span>
              <span className="tk-orb-text">
                {status === "ai" ? "AI 가 말하는 중" : status === "hear" ? "듣는 중" : status === "muted" ? "마이크 꺼짐" : "말하세요"}
              </span>
            </div>
            <div className={`tk-drive-clock ${warn ? "tk-warn" : ""}`}>{clock(TALK_MAX_MIN * 60 - sec)}</div>
            <p className="tk-drive-note">폰은 거치대에 두고, 손대지 마세요. 대답하기 어려우면 그냥 조용히 있어도 기다려요.</p>
            <div className="tk-drive-btns">
              <button className="tk-big soft" onClick={toggleMute}>{muted ? "🎤 마이크 켜기" : "🔇 마이크 끄기"}</button>
              <button className="tk-big" onClick={() => finish()}>■ 끝내기</button>
            </div>
          </section>
        )}

        {phase === "live" && !drive && (
          <>
            <div className="tk-topic muted tiny">{topic.icon} {topic.label} · {cfg.mode === "ptt" ? "누르고 말하기" : "자동 차례"} · {cfg.style === "teacher" ? "선생님 모드" : "흐름 유지"}</div>
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
              {aiTalking ? "🔊 AI 가 말하는 중" : holding ? "🎤 듣는 중 — 다 말하면 손을 떼세요" : hearing ? "🎤 듣는 중" : cfg.mode === "ptt" ? "버튼을 누르고 있는 동안 말해요" : muted ? "마이크 꺼짐" : "말하세요 — 잠깐 멈춰도 기다려 줘요"}
            </div>

            {cfg.mode === "ptt" ? (
              <button
                className={`tk-ptt ${holding ? "on" : ""}`}
                onPointerDown={down} onPointerUp={up} onPointerLeave={up} onPointerCancel={up}
                onContextMenu={(e) => e.preventDefault()}
              >
                {holding ? "말하는 중…" : "누르고 말하기"}
              </button>
            ) : (
              <button className={`tk-ptt soft ${muted ? "" : "on"}`} onClick={toggleMute}>
                {muted ? "🎤 마이크 켜기" : "⏸ 잠깐 마이크 끄기"}
              </button>
            )}

            <div className="tk-row">
              <div className="tk-switches">
                <div className="chips tk-chips">
                  <button className={`chip ${cfg.mode === "auto" ? "on" : ""}`} onClick={() => setMode("auto")}>자동</button>
                  <button className={`chip ${cfg.mode === "ptt" ? "on" : ""}`} onClick={() => setMode("ptt")}>누르고 말하기</button>
                </div>
                <div className="chips tk-chips">
                  {STYLES.map((s) => (
                    <button key={s.key} className={`chip ${cfg.style === s.key ? "on" : ""}`} onClick={() => setStyle(s.key)}>{s.label}</button>
                  ))}
                </div>
              </div>
              <button className="btn primary" onClick={() => finish()}>끝내고 정리하기</button>
            </div>
            {warn && <p className="tk-warn tiny">1분 뒤 이번 10분이 끝나요. 이어서 할 수 있어요.</p>}
          </>
        )}

        {phase === "paused" && result && (
          <section className="tk-paused">
            <div className="rc-big">{drive ? "🚗 " : ""}잠깐 멈춤</div>
            <p className="cr-lead">
              지금까지 {clock(result.seconds)} · 내 말 {myLines(result.lines).length}줄.
              {drive ? " 차를 세운 뒤에 누르세요." : ""} 이어서 하면 AI 가 앞 대화를 기억하고 계속해요.
            </p>
            <button className="tk-big wide" onClick={() => start({ driveMode: drive, cont: true })}>▶ 이어서 {TALK_MAX_MIN}분</button>
            <button className="tk-big soft wide" onClick={() => setPhase("review")}>끝내고 정리하기</button>
          </section>
        )}

        {phase === "connecting" && result && <p className="muted pad">다시 연결하는 중…</p>}

        {phase === "review" && result && (
          <TalkReview
            result={result} userId={userId} today={today} month={month}
            onSaved={() => { forgetLast(); onPatch({ speak: true }); }}
            onDiscard={() => { forgetLast(); onClose(); }}
            onAgain={() => { forgetLast(); setResult(null); setDrive(false); setRun({ topic: null, sentences: [] }); setPhase("setup"); }}
            onPron={(sents) => { forgetLast(); setResult(null); start({ driveMode: false, topicKey: "aussprache", sentences: sents }); }}
            onClose={onClose} onError={onError}
          />
        )}
      </div>
    </div>
  );
}

// ── ① 고르기 ─────────────────────────────────────────────────────────────────
function Setup({ pref, savePref, budget, last, connecting, onStart, onDrive, onResume, onDropLast, userId, today, onError }) {
  const ok = rtSupported();
  const [dropArmed, setDropArmed] = useState(false);
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
          <span className="tk-last-btns">
            <button className={`btn small ${dropArmed ? "danger" : ""}`} onClick={() => (dropArmed ? onDropLast() : (setDropArmed(true), setTimeout(() => setDropArmed(false), 3000)))}>
              {dropArmed ? "정말 버리기" : "버리기"}
            </button>
            <button className="btn small" onClick={onResume}>이어서 정리</button>
          </span>
        </div>
      )}

      <div className="tk-drive-card">
        <div>
          <b>🚗 운전 모드</b>
          <p className="muted tiny">손대지 않고 — 자동 차례 · 거치대 · 흐름 유지 · 차분하게 · 천천히. 화면엔 큰 상태 표시만. 주제·목소리는 아래 고른 대로.</p>
        </div>
        <button className="btn primary" disabled={!ok || connecting || !budget || !!budget.block} onClick={onDrive}>
          {connecting ? "연결 중…" : "운전 모드로 시작"}
        </button>
      </div>

      <div className="cr-label">주제</div>
      <div className="tk-topics">
        {TOPICS.map((t) => (
          <button key={t.key} className={`tk-topic-btn ${pref.topic === t.key ? "on" : ""}`} onClick={() => savePref({ topic: t.key })}>
            <span aria-hidden>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {topicOf(pref.topic).coach && (
        <p className="muted tiny">
          AI 발음 코치가 문장을 들려주면 따라 말해요. 소리를 직접 듣고 어느 소리가 다른지, 입 모양을 한국어로 알려 줘요.
          최근 7일 Fokus DE 로 보낸 내 문장으로 연습하고, 없으면 배송 일상 문장으로 해요. <b>누르고 말하기</b>가 잘 맞아요.
        </p>
      )}

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

      {!topicOf(pref.topic).coach && (
        <div className="chips">
          <button className={`chip ${pref.pron ? "on" : ""}`} onClick={() => savePref({ pron: !pref.pron })}>
            {pref.pron ? "✓ " : ""}발음도 교정
          </button>
        </div>
      )}
      {pref.pron && !topicOf(pref.topic).coach && (
        <p className="muted tiny">알아듣기 어려운 발음이 나오면 AI 가 그 단어를 천천히 들려주고 입 모양을 알려 준 뒤 한 번 따라 말하게 해요.</p>
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

      <div className="cr-label">추임새 <span className="muted">— “음…”, “아~”, “ähm”</span></div>
      <div className="chips">
        <button className={`chip ${pref.filler !== "off" ? "on" : ""}`} onClick={() => savePref({ filler: "ignore" })}>무시 — 대화가 안 끊김</button>
        <button className={`chip ${pref.filler === "off" ? "on" : ""}`} onClick={() => savePref({ filler: "off" })}>그대로 — 말로 AI 끊기 가능</button>
      </div>
      <p className="muted tiny">
        {pref.filler === "off"
          ? "AI 가 말하는 중에 소리를 내면 AI 가 멈추고, “음”만 해도 대답할 수 있어요."
          : "AI 가 말하는 중에 “아~” 해도 멈추지 않고, “음…”만 말하면 대답하지 않고 기다려요. 대신 대답이 0.5초쯤 늦을 수 있어요. (자동 차례에서만)"}
      </p>

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

      <PastTalks userId={userId} today={today} onError={onError} />
    </section>
  );
}
