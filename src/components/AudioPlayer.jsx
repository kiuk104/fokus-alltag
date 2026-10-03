// 듣기용 플레이어 — ⏮ 이전 문장 · ▶ · 다음 문장 ⏭ · 🔁 이 문장 반복 · 속도 · 위치.
// 브라우저 기본 컨트롤 대신 직접 그리는 이유: 문장 이동·반복·0.8배가 이 연습의 핵심 버튼인데 기본 컨트롤에는 없다.
//
// 소리 파일은 한 번 통째로 받아(blob) 재생과 문장 분석에 같이 쓴다 — 두 번 받지 않게.
// 방송사 세 곳(dradio·DW·ARD)은 다른 출처에서 파일을 읽는 것을 허용한다(2026-09-28 확인).
// 받기가 막히면 원래 주소로 바로 틀고, 문장 이동 대신 ↺10초만 보여 준다.
//
// 🔖 갈무리(onClip): 지금 문장 구간을 저장한다. 문장을 못 나눈 소리면 지금 앞 8초.
// 갈무리 재생(clip = { start, end }): 그 구간만 되풀이한다 — 🔖 목록(screens/Clips.jsx)에서 쓴다.

import { useCallback, useEffect, useRef, useState } from "react";
import { fmtTime } from "../lib/listenApi";
import { sentenceStarts, segIndex, prevStart, nextStart } from "../lib/sentences";

const SPEEDS = [0.8, 0.9, 1];
const ANALYSIS_RATE = 8000; // 말소리의 크기만 보면 되므로 낮춰서 푼다 — 8분짜리도 메모리 15MB 안쪽

async function loadAndAnalyze(url, onProgress) {
  const r = await fetch(url, { mode: "cors" });
  if (!r.ok) throw new Error(String(r.status));
  const total = +r.headers.get("content-length") || 0;
  const reader = r.body?.getReader?.();
  let buf;
  if (reader && total) {
    const chunks = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      got += value.length;
      onProgress(got / total);
    }
    buf = new Uint8Array(got);
    let o = 0;
    for (const c of chunks) {
      buf.set(c, o);
      o += c.length;
    }
  } else {
    buf = new Uint8Array(await r.arrayBuffer());
  }
  const blobUrl = URL.createObjectURL(new Blob([buf], { type: "audio/mpeg" }));
  let starts = [0];
  try {
    const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const ab = await new Ctx(1, 1, ANALYSIS_RATE).decodeAudioData(buf.buffer.slice(0));
    starts = sentenceStarts(ab.getChannelData(0), ab.sampleRate);
  } catch {
    /* 분석 실패 — 재생은 된다 */
  }
  return { blobUrl, starts };
}

export default function AudioPlayer({ src, onEnded, onPlayCount, onClip, clip, apiRef }) {
  const ref = useRef(null);
  const [playSrc, setPlaySrc] = useState(null);
  const [starts, setStarts] = useState([0]);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const [rate, setRate] = useState(1);
  const [loop, setLoop] = useState(false);
  const [err, setErr] = useState("");
  // 반복할 문장 번호는 따로 들고 있는다. 시각으로 매번 계산하면, 문장 처음으로 막 옮긴 순간
  // "앞 문장 끝"으로 읽혀 앞 문장으로 튀어 버린다.
  const loopRef = useRef({ on: false, starts: [0], idx: 0, clip: null });
  loopRef.current.on = loop;
  loopRef.current.starts = starts;
  loopRef.current.clip = clip || null;
  const [clipState, setClipState] = useState(""); // "", "busy", "ok", 에러 글

  // 받기 + 문장 분석. 실패하면 원래 주소로.
  useEffect(() => {
    let alive = true;
    let made = null;
    setPlaySrc(null);
    setStarts([0]);
    setProgress(0);
    loadAndAnalyze(src, (p) => alive && setProgress(p))
      .then(({ blobUrl, starts }) => {
        made = blobUrl;
        if (!alive) return URL.revokeObjectURL(blobUrl);
        setPlaySrc(blobUrl);
        setStarts(starts);
      })
      .catch(() => alive && setPlaySrc(src));
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [src]);

  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    const on = (ev, fn) => (a.addEventListener(ev, fn), () => a.removeEventListener(ev, fn));
    const offs = [
      on("timeupdate", () => {
        setT(a.currentTime);
        // 🔁 이 문장 반복 — 다음 문장 시작에 닿으면 이 문장 처음으로
        const L = loopRef.current;
        if (L.clip) {
          // 갈무리 재생 — 이 구간만
          if (a.currentTime >= L.clip.end - 0.05) a.currentTime = L.clip.start;
          return;
        }
        if (L.on && L.starts.length > 1) {
          const end = L.starts[L.idx + 1] ?? a.duration;
          if (a.currentTime >= end - 0.05) a.currentTime = L.starts[L.idx];
        }
      }),
      on("loadedmetadata", () => {
        setDur(a.duration);
        if (loopRef.current.clip) a.currentTime = loopRef.current.clip.start;
      }),
      on("play", () => setPlaying(true)),
      on("pause", () => setPlaying(false)),
      on("ended", () => {
        setPlaying(false);
        onEnded?.();
      }),
      on("error", () => setErr("소리 파일을 열지 못했어요. 인터넷 연결을 확인해 주세요.")),
    ];
    return () => offs.forEach((f) => f());
  }, [onEnded, playSrc]);

  useEffect(() => {
    if (ref.current) ref.current.playbackRate = rate;
  }, [rate, playSrc]);

  const seek = useCallback((to) => {
    const a = ref.current;
    if (!a || to == null) return;
    a.currentTime = to;
    setT(to);
    loopRef.current.idx = segIndex(loopRef.current.starts, to);
    if (a.paused) a.play().catch(() => {});
  }, []);

  if (apiRef) apiRef.current = { seek }; // 원고 옆 🔖 갈무리의 ▶ 로 그 구간부터 듣기

  // 10초 뒤로/앞으로 — 문장 경계와 상관없이 시간으로 움직인다
  const jump = (d) => {
    const a = ref.current;
    if (!a) return;
    seek(Math.min(Math.max(0, a.currentTime + d), Math.max(0, (a.duration || 0) - 0.1)));
  };

  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    if (a.paused) {
      const C = loopRef.current.clip;
      if (C && (a.currentTime < C.start - 0.3 || a.currentTime >= C.end)) a.currentTime = C.start;
      else if (a.ended || a.currentTime >= (a.duration || Infinity) - 0.2) a.currentTime = 0; // 끝난 뒤 다시 누르면 처음부터 = 두 번째 듣기
      if (a.currentTime < 0.5) onPlayCount?.();
      a.play().catch(() => setErr("재생이 막혔어요. 한 번 더 눌러 주세요."));
    } else a.pause();
  };

  const hasSentences = starts.length > 1;
  const idx = segIndex(starts, t);

  // 🔖 지금 문장(못 나눈 소리면 앞 8초)을 갈무리
  const capture = async () => {
    const a = ref.current;
    if (!a || !onClip) return;
    const cur = a.currentTime || 0;
    const L = loopRef.current;
    const i = L.on ? L.idx : segIndex(starts, cur);
    const seg = hasSentences
      ? { start: starts[i], end: starts[i + 1] ?? a.duration ?? cur, dur: a.duration }
      : { start: Math.max(0, cur - 8), end: cur + 0.5, dur: a.duration };
    setClipState("busy");
    try {
      await onClip(seg);
      setClipState("ok");
      setTimeout(() => setClipState(""), 2000);
    } catch (e) {
      setClipState(e.message);
    }
  };
  const clipBtn = onClip && (
    <button className={`ap-loop ap-clip ${clipState === "ok" ? "on" : ""}`} disabled={clipState === "busy"} onClick={capture} title="지금 문장 구간을 🔖 목록에 저장">
      {clipState === "ok" ? "✓ 갈무리" : "🔖 갈무리"}
    </button>
  );

  if (!playSrc) {
    return (
      <div className="ap ap-loading">
        <div className="ap-bar"><i style={{ width: `${Math.round(progress * 100)}%` }} /></div>
        <div className="muted tiny">소리 받는 중 {progress ? `${Math.round(progress * 100)}%` : "…"} · 문장을 나누는 중</div>
      </div>
    );
  }

  if (clip) {
    // 갈무리 재생 — ▶ 와 속도만. 구간 안에서만 돈다.
    return (
      <div className="ap ap-cliponly">
        <audio ref={ref} src={playSrc} preload="auto" />
        <div className="ap-row">
          <button className="ap-play" onClick={toggle} aria-label={playing ? "멈춤" : "재생"}>{playing ? "❚❚" : "▶"}</button>
        </div>
        <div className="ap-foot">
          <span className="ap-sent">🔁 이 구간만 반복 중</span>
          <div className="ap-speed" role="radiogroup" aria-label="속도">
            {SPEEDS.map((sp) => (
              <button key={sp} role="radio" aria-checked={rate === sp} className={rate === sp ? "on" : ""} onClick={() => setRate(sp)}>
                {sp === 1 ? "1×" : `${sp}`}
              </button>
            ))}
          </div>
        </div>
        {err && <div className="ap-err">{err}</div>}
      </div>
    );
  }

  return (
    <div className="ap">
      <audio ref={ref} src={playSrc} preload="auto" />
      {/* 가운데 줄: ⏮ 문장 · ↺10 · ▶ · 10↻ · 문장 ⏭ — 문장 이동은 나눈 문장이 있을 때만 */}
      <div className="ap-row">
        {hasSentences && (
          <button className="ap-btn" onClick={() => seek(prevStart(starts, ref.current?.currentTime || 0))} aria-label="이전 문장">⏮</button>
        )}
        <button className="ap-btn" onClick={() => jump(-10)} aria-label="10초 뒤로">↺10</button>
        <button className="ap-play" onClick={toggle} aria-label={playing ? "멈춤" : "재생"}>
          {playing ? "❚❚" : "▶"}
        </button>
        <button className="ap-btn" onClick={() => jump(10)} aria-label="10초 앞으로">10↻</button>
        {hasSentences && (
          <button
            className="ap-btn"
            onClick={() => seek(nextStart(starts, ref.current?.currentTime || 0))}
            disabled={idx >= starts.length - 1}
            aria-label="다음 문장"
          >
            ⏭
          </button>
        )}
      </div>

      <div className="ap-seekwrap">
        <input
          className="ap-seek"
          type="range"
          min={0}
          max={dur || 0}
          step={0.1}
          value={Math.min(t, dur || 0)}
          onChange={(e) => {
            if (!ref.current) return;
            ref.current.currentTime = +e.target.value;
            loopRef.current.idx = segIndex(starts, +e.target.value);
          }}
          aria-label="재생 위치"
        />
        {/* 문장 경계 눈금 — 어디서 끊기는지 보이면 "몇 번째 문장"이 손에 잡힌다 */}
        {hasSentences && dur > 0 && (
          <div className="ap-ticks" aria-hidden>
            {starts.slice(1).map((s) => (
              <i key={s} style={{ left: `${(s / dur) * 100}%` }} />
            ))}
          </div>
        )}
      </div>

      <div className="ap-time">{fmtTime(t)} / {fmtTime(dur)}</div>

      <div className="ap-foot">
        {hasSentences ? (
          <>
            <span className="ap-sent">문장 {idx + 1} / {starts.length}</span>
            <button className={`ap-loop ${loop ? "on" : ""}`} onClick={() => {
                loopRef.current.idx = segIndex(starts, ref.current?.currentTime || 0);
                setLoop((v) => !v);
              }} aria-pressed={loop}>
              🔁 이 문장 반복
            </button>
            {clipBtn}
          </>
        ) : (
          <>
            <span className="muted tiny">문장을 나누지 못한 소리예요 — ↺10 · 10↻ 으로</span>
            {clipBtn}
          </>
        )}
        <div className="ap-speed" role="radiogroup" aria-label="속도">
          {SPEEDS.map((sp) => (
            <button key={sp} role="radio" aria-checked={rate === sp} className={rate === sp ? "on" : ""} onClick={() => setRate(sp)}>
              {sp === 1 ? "1×" : `${sp}`}
            </button>
          ))}
        </div>
      </div>
      {err && <div className="ap-err">{err}</div>}
      {clipState && !["busy", "ok"].includes(clipState) && <div className="ap-err">{clipState}</div>}
    </div>
  );
}
