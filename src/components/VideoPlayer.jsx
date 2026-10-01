// 유튜브 영상 플레이어 — 공식 IFrame API 로 영상을 틀고, 문장 구간이 있으면 AudioPlayer 와 같은 버튼을 단다.
//   ⏮ 이전 문장 · ↺10 · ▶ · 10↻ · 다음 문장 ⏭ · 🔁 이 문장 반복 · 속도
// 문장 구간(sentences)은 붙여넣은 자막에서 온다(lib/captions.js). 없으면 유튜브 기본 컨트롤만 보인다.
//
// children 은 영상 위에 얹는 것(자막 가림 띠). 영상 파일은 내려받지 않고 유튜브 임베드 안에서만 틀며, 시각 이동만 건다.

import { useEffect, useMemo, useRef, useState } from "react";
import { loadYouTubeApi } from "../lib/ytPlayer";
import { segIndex, prevStart, nextStart } from "../lib/sentences";

const SPEEDS = [0.75, 1];
const POLL_MS = 150;

export default function VideoPlayer({ videoId, title, sentences, onPlayCount, apiRef, covered, onToggleCover, children }) {
  const host = useRef(null);
  const player = useRef(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [rate, setRate] = useState(1);
  const [loop, setLoop] = useState(false);
  const [err, setErr] = useState("");

  const starts = useMemo(() => sentences.map((s) => s.start), [sentences]);
  // 반복할 문장 번호는 따로 들고 있는다 — 시각으로 매번 계산하면 문장 처음으로 막 옮긴 순간 앞 문장으로 튄다 (AudioPlayer 와 같은 이유)
  const L = useRef({ on: false, sentences, starts, idx: 0 });
  L.current.on = loop;
  L.current.sentences = sentences;
  L.current.starts = starts;
  const countRef = useRef(onPlayCount);
  countRef.current = onPlayCount;

  // 플레이어 만들기 — 영상이 바뀔 때만 다시 만든다
  useEffect(() => {
    const h = host.current;
    let alive = true;
    let p = null;
    setReady(false);
    setPlaying(false);
    setT(0);
    setErr("");
    const el = document.createElement("div"); // YT.Player 가 이 자리를 iframe 으로 바꾼다 — React 가 아는 노드는 건드리지 않는다
    h.appendChild(el);
    loadYouTubeApi()
      .then((YT) => {
        if (!alive) return;
        p = new YT.Player(el, {
          host: "https://www.youtube-nocookie.com",
          videoId,
          playerVars: { playsinline: 1, rel: 0, modestbranding: 1, enablejsapi: 1, origin: window.location.origin },
          events: {
            onReady: () => {
              if (!alive) return;
              player.current = p;
              setReady(true);
            },
            onStateChange: (e) => {
              if (!alive) return;
              setPlaying(e.data === 1);
              if (e.data === 0) countRef.current?.(); // 끝까지 봄 = 한 번 들음
            },
            onError: () => alive && setErr("이 영상은 앱 안에서 틀 수 없어요. 아래 '사이트에서 보기'로 열어 주세요."),
          },
        });
      })
      .catch((e) => alive && setErr(e.message));
    return () => {
      alive = false;
      player.current = null;
      try {
        p?.destroy();
      } catch {
        /* 이미 없어졌다 */
      }
      h.innerHTML = "";
    };
  }, [videoId]);

  // 지금 시각 읽기 + 🔁 반복
  useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => {
      const p = player.current;
      if (!p?.getCurrentTime) return;
      const cur = p.getCurrentTime() || 0;
      setT(cur);
      const S = L.current;
      if (!S.on || !S.sentences.length) return;
      const s = S.sentences[S.idx];
      if (!s) return;
      if (cur >= s.end - 0.05 && cur < s.end + 0.6) p.seekTo(s.start, true); // 이 문장 끝에 닿으면 처음으로
      else if (cur < s.start - 0.6 || cur >= s.end + 0.6) S.idx = segIndex(S.starts, cur); // 사용자가 다른 곳으로 옮기면 반복도 따라간다
    }, POLL_MS);
    return () => clearInterval(id);
  }, [ready]);

  useEffect(() => {
    if (ready) player.current?.setPlaybackRate?.(rate);
  }, [rate, ready]);

  const goto = (i) => {
    const p = player.current;
    const s = L.current.sentences[i];
    if (!p || !s) return;
    L.current.idx = i;
    p.seekTo(s.start, true);
    p.playVideo();
    setT(s.start);
  };
  if (apiRef) apiRef.current = { goto }; // 원고 목록에서 문장을 눌러 그 자리부터 듣기

  const now = () => player.current?.getCurrentTime?.() || 0;
  const jump = (d) => {
    const p = player.current;
    if (!p) return;
    const to = Math.max(0, now() + d);
    p.seekTo(to, true);
    L.current.idx = segIndex(starts, to);
  };
  const toggle = () => {
    const p = player.current;
    if (!p) return;
    if (p.getPlayerState?.() === 1) p.pauseVideo();
    else p.playVideo();
  };

  const has = sentences.length > 0;
  const idx = segIndex(starts, t);

  return (
    <>
      <div className="lsn-video" aria-label={title}>
        <div ref={host} className="lsn-yt" />
        {children}
      </div>
      {err && <div className="ap-err">{err}</div>}

      {has && (
        <div className="ap">
          <div className="ap-row">
            <button className="ap-btn" disabled={!ready} onClick={() => goto(segIndex(starts, prevStart(starts, now())))} aria-label="이전 문장">⏮</button>
            <button className="ap-btn" disabled={!ready} onClick={() => jump(-10)} aria-label="10초 뒤로">↺10</button>
            <button className="ap-play" disabled={!ready} onClick={toggle} aria-label={playing ? "멈춤" : "재생"}>
              {playing ? "❚❚" : "▶"}
            </button>
            <button className="ap-btn" disabled={!ready} onClick={() => jump(10)} aria-label="10초 앞으로">10↻</button>
            <button
              className="ap-btn"
              disabled={!ready || idx >= sentences.length - 1}
              onClick={() => {
                const n = nextStart(starts, now());
                if (n != null) goto(segIndex(starts, n));
              }}
              aria-label="다음 문장"
            >
              ⏭
            </button>
          </div>
          <div className="ap-foot">
            <span className="ap-sent">문장 {idx + 1} / {sentences.length}</span>
            <button
              className={`ap-loop ${loop ? "on" : ""}`}
              onClick={() => {
                L.current.idx = segIndex(starts, now());
                setLoop((v) => !v);
              }}
              aria-pressed={loop}
            >
              🔁 이 문장 반복
            </button>
            {onToggleCover && (
              <button className="ap-loop" onClick={onToggleCover} aria-pressed={covered}>
                {covered ? "👁 자막 보기" : "🙈 자막 가리기"}
              </button>
            )}
            <div className="ap-speed" role="radiogroup" aria-label="속도">
              {SPEEDS.map((sp) => (
                <button key={sp} role="radio" aria-checked={rate === sp} className={rate === sp ? "on" : ""} onClick={() => setRate(sp)}>
                  {sp === 1 ? "1×" : `${sp}`}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
