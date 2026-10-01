// 듣기 화면 — 앱 안에서 듣고, 한 줄로 꺼내고, 그다음에 원고를 연다.
//
// 순서가 곧 설계다(기획서 0-2절 "정답은 시도한 뒤에만 연다"):
//   ① 원고 없이 듣기 → ② 들은 내용 한 줄 → ③ (선택) 한 번 더 → ④ 원고 열기
// 원고를 먼저 보여 주면 "읽으며 듣기"가 되어 귀가 아니라 눈으로 이해한 것을 들었다고 착각한다.
// 그래도 ④는 언제든 "그냥 보기"로 열 수 있다 — 지친 날 앱이 벽이 되면 안 된다.
//
// 영상(Easy German)은 자막이 화면에 박혀 있어서, 원고 대신 화면 아래를 가림 띠로 덮었다가 ④에서 걷는다.
// App.jsx 에서 탭 밖(맨 위)에 렌더한다 — 탭 안에 두면 다른 탭에서 열 때 안 뜬다.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchListen } from "../lib/listenApi";
import { openApp } from "../lib/links";
import AudioPlayer from "../components/AudioPlayer";
import TandemCompare from "../components/TandemCompare";
import VideoPlayer from "../components/VideoPlayer";
import { loadYouTubeApi } from "../lib/ytPlayer";
import CaptionPaste from "../components/CaptionPaste";
import PastVideos from "../components/PastVideos";
import { loadCaptions, saveCaptions, clearCaptions } from "../lib/captions";
import { fetchRemoteCaptions, saveRemoteCaptions, clearRemoteCaptions, latestCaptionVideo, rememberVideo } from "../lib/captionsRepo";
import "../styles/listen.css";

export default function Listen({ source, today, row, onPatch, onClose }) {
  const [item, setItem] = useState(null); // Nachrichtenleicht 기사 · Easy German 영상 고르기
  const [data, setData] = useState(null);
  const [urlMsg, setUrlMsg] = useState("");
  const [err, setErr] = useState("");
  const [plays, setPlays] = useState(0);
  const [line, setLine] = useState(row.note || "");
  const [reveal, setReveal] = useState(false); // 원고가 지금 펼쳐져 있는가 (닫았다 다시 열 수 있다)
  const [opened, setOpened] = useState(false); // 한 번이라도 열었는가 — 단계 표시용
  const [cover, setCover] = useState(true);
  const [sentences, setSentences] = useState([]); // 영상의 문장 구간 — 붙여넣은 자막을 영상별로 저장해 둔 것
  const playerApi = useRef(null); // 원고의 문장을 눌러 그 자리부터 듣기

  useEffect(() => {
    let alive = true;
    setErr("");
    fetchListen(source.id, { item: source.id === "leicht" ? item : null, day: today })
      .then((d) => alive && setData(d))
      .catch((e) => alive && setErr(e.message));
    return () => { alive = false; };
  }, [source.id, item, today]);

  // 뒤로가기 대신 ✕ — 전체 화면이라 Esc 로도 닫는다
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const countPlay = useCallback(() => setPlays((n) => n + 1), []);
  const saved = !!line.trim() && (row.note || "") === line.trim();
  const saveLine = () => {
    const t = line.trim();
    if (t) onPatch({ note: t, listen: true });
  };

  // 영상은 고른 영상 id 로 바꿔 끼운다 (Easy German 은 목록을 받아 두고 서버를 다시 부르지 않는다)
  const curItem = item || (data?.kind === "video" ? data?.videoId : data?.item);
  const videoId = data?.kind === "video" ? curItem : null;

  // 영상 목록을 못 받은 날(재생목록 대체 화면): 유튜브 플레이어에게 재생목록의 맨 앞(최신) 영상 id 를 물어 바로 연다.
  // 그것도 안 되면 PC 에서 마지막으로 자막을 붙인 영상을 연다. 주소를 붙여넣는 칸은 마지막 수단.
  const noList = data?.kind === "video" && !data.videoId && !item;
  useEffect(() => {
    if (!noList) return;
    let alive = true;
    let p = null;
    let timer = 0;
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:-9999px;width:200px;height:120px";
    document.body.appendChild(host);
    const el = document.createElement("div");
    host.appendChild(el);
    const done = (id) => alive && id && setItem((prev) => prev || id); // 그새 사용자가 지난 영상을 골랐으면 그대로 둔다
    loadYouTubeApi()
      .then((YT) => {
        if (!alive) return;
        p = new YT.Player(el, {
          host: "https://www.youtube-nocookie.com",
          playerVars: { listType: "playlist", list: data.playlist, enablejsapi: 1, origin: window.location.origin },
        });
        let tries = 0;
        timer = setInterval(() => {
          const ids = p?.getPlaylist?.();
          if (ids?.length) { clearInterval(timer); done(ids[0]); }
          else if (++tries > 20) { clearInterval(timer); latestCaptionVideo().then(done); } // 10초
        }, 500);
      })
      .catch(() => latestCaptionVideo().then(done));
    return () => {
      alive = false;
      clearInterval(timer);
      try { p?.destroy(); } catch { /* 이미 없어졌다 */ }
      host.remove();
    };
  }, [noList, data?.playlist]);

  // 서버가 유튜브 자막을 받을 수 없어서(봇 확인) 사용자가 붙여넣은 것을 영상별로 저장해 두고, 영상이 바뀔 때 다시 읽는다
  useEffect(() => {
    const local = videoId ? loadCaptions(videoId) : [];
    setSentences(local);
    if (!videoId) return;
    let alive = true;
    if (local.length) saveRemoteCaptions(videoId, local); // 이 기기에만 있던 것도 계정에 올려 둔다
    else
      fetchRemoteCaptions(videoId).then((r) => {
        if (!alive || !r) return;
        saveCaptions(videoId, r);
        setSentences(r);
      });
    return () => { alive = false; };
  }, [videoId]);
  const title = data?.list?.find((x) => x.item === curItem)?.title || data?.title || "";
  const videoSents = data?.kind === "video" && sentences.length > 0;
  const scriptBlocks = useMemo(
    () => (data?.script?.length ? data.script : sentences.map((x) => ({ h: "", p: x.text }))),
    [data, sentences],
  );
  const hasScript = scriptBlocks.length > 0 || (data?.words?.length || 0) > 0;
  const step = opened ? 4 : saved ? (plays >= 2 ? 4 : 3) : plays >= 1 ? 2 : 1;

  return (
    <div className="lsn" role="dialog" aria-label="듣기">
      <div className="lsn-inner">
      <header className="lsn-head">
        <div className="lsn-src">
          <b>{source.name}</b> <span className="listen-lv">{source.level}</span>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="닫기">✕</button>
      </header>

      {!data && !err && <p className="muted pad">최신 편을 가져오는 중…</p>}
      {err && (
        <div className="notice error">
          {err}
          <div style={{ marginTop: 8 }}>
            <button className="btn small" onClick={() => openApp(source.url)}>사이트에서 듣기 ↗</button>
          </div>
        </div>
      )}

      {data && (
        <>
          <div className="lsn-title">{title}</div>
          {data.date && <div className="muted tiny">{new Date(data.date).toLocaleDateString("ko-KR")}</div>}

          {data.list?.length > 1 && (
            <div className="chips lsn-list">
              {data.list.slice(0, 5).map((x) => {
                const cur = x.item === curItem;
                return (
                  <button
                    key={x.item}
                    className={`chip ${cur ? "on" : ""}`}
                    onClick={() => { setItem(x.item); setPlays(0); setReveal(false); setOpened(false); setCover(true); if (data.kind !== "video") setData(null); }}
                    title={x.title}
                  >
                    {x.title.length > 28 ? x.title.slice(0, 27) + "…" : x.title}
                  </button>
                );
              })}
            </div>
          )}

          {data.kind === "audio" && data.audio && (
            <AudioPlayer key={data.audio} src={data.audio} onPlayCount={countPlay} />
          )}
          {data.kind === "audio" && data.noAudio && (
            <div className="notice">
              이 기사는 아직 소리 파일이 올라오지 않았어요(글이 먼저 올라오고 소리는 몇 시간 뒤에 붙어요).
              위에서 다른 기사를 고르거나, 나중에 다시 열어 주세요.
            </div>
          )}

          {data.kind === "video" && videoId && (
            <VideoPlayer key={`v-${videoId}`} videoId={videoId} title={title} sentences={sentences} onPlayCount={countPlay} apiRef={playerApi} covered={cover} onToggleCover={reveal ? null : () => setCover((c) => !c)}>
              {cover && !reveal && (
                <button className="lsn-cover" onClick={() => setCover(false)}>
                  자막 가림 · 누르면 걷기
                </button>
              )}
            </VideoPlayer>
          )}
          {data.kind === "video" && !videoId && data.playlist && (
            <div className="lsn-video">
              <iframe
                key={data.playlist}
                src={`https://www.youtube-nocookie.com/embed/videoseries?list=${data.playlist}&playsinline=1&rel=0&modestbranding=1`}
                title={title}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
              {cover && !reveal && (
                <button className="lsn-cover" onClick={() => setCover(false)}>
                  자막 가림 · 누르면 걷기
                </button>
              )}
            </div>
          )}
          {data.kind === "video" && !videoSents && !cover && !reveal && (
            <button className="lsn-played" onClick={() => setCover(true)}>🙈 자막 다시 가리기</button>
          )}
          {data.kind === "video" && plays === 0 && (
            <button className="lsn-played" onClick={countPlay}>한 번 다 봤어요</button>
          )}
          {data.kind === "video" && (
            <PastVideos
              current={videoId}
              refreshKey={sentences.length}
              onPick={(id) => { setItem(id); setPlays(0); setReveal(false); setOpened(false); setCover(true); }}
            />
          )}
          {data.kind === "video" && (
            <details className="lsn-paste" open={!videoId}>
              <summary>다른 영상 주소로 열기</summary>
              <form
                className="lsn-paste-body"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = e.currentTarget;
                  const m = String(new FormData(f).get("u") || "").match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{11})|^([A-Za-z0-9_-]{11})$/);
                  if (!m) return setUrlMsg("유튜브 영상 주소를 찾지 못했어요. 공유 → 링크 복사로 받은 주소를 붙여 주세요.");
                  const id = m[1] || m[2];
                  setItem(id); setPlays(0); setReveal(false); setOpened(false); setCover(true);
                  rememberVideo(id); // 지난 영상 목록에도 올린다
                  setUrlMsg("열었어요. 지난 영상 목록에도 저장돼요.");
                  f.reset();
                }}
              >
                <div className="row">
                  <input className="input grow" name="u" placeholder="https://www.youtube.com/watch?v=…" inputMode="url" autoCapitalize="none" />
                  <button className="btn" type="submit">열기</button>
                </div>
                {urlMsg && <p className="muted tiny">{urlMsg}</p>}
              </form>
            </details>
          )}
          {videoId && (
            <CaptionPaste
              key={`c-${videoId}`}
              count={sentences.length}
              onSave={(sents) => { saveCaptions(videoId, sents); setSentences(sents); saveRemoteCaptions(videoId, sents); }}
              onClear={() => { clearCaptions(videoId); setSentences([]); clearRemoteCaptions(videoId); }}
            />
          )}

          <ol className="lsn-steps">
            <li className={step === 1 ? "now" : step > 1 ? "done" : ""}>
              <b>원고 없이 듣기</b>
              <span>
                {data.kind === "video" ? "자막은 가려 두었어요. 소리에만 집중." : "무슨 이야기인지만 잡는다. 모든 단어를 알아들을 필요 없음."}
                {plays > 0 && ` · ${plays}번 들음`}
              </span>
            </li>
            <li className={step === 2 ? "now" : step > 2 ? "done" : ""}>
              <b>들은 내용 한 줄 (독일어)</b>
              <span>
                누가 · 무엇을 · 어디서 중 들린 것을 한 문장으로. 틀려도 괜찮아요 — 원고와 비교하는 게 목적.
                막히면 들린 단어 서너 개만 적어도 돼요.
              </span>
              <div className="listen-line">
                <input
                  className="input"
                  value={line}
                  onChange={(e) => setLine(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveLine()}
                  placeholder="Es geht um … / In … hat …"
                  lang="de"
                  spellCheck={false}
                />
                <button className="btn small" disabled={!line.trim() || saved} onClick={saveLine}>
                  {saved ? "✓" : "저장"}
                </button>
              </div>
            </li>
            <li className={step === 3 ? "now" : step > 3 ? "done" : ""}>
              <b>한 번 더 듣기</b>
              <span>
                방금 쓴 한 줄이 맞는지 확인하며. 안 들리는 문장은 ⏮ 로 돌아가거나 🔁 로 반복.
                {data.kind === "video" && !videoSents && " (영상은 자막을 붙여넣으면 ⏮·🔁 이 켜져요.)"}
              </span>
            </li>
            <li className={step === 4 ? "now" : ""}>
              <b>원고 열기</b>
              <span>
                {reveal ? (
                  <button className="btn small" onClick={() => { setReveal(false); setCover(true); }}>
                    원고 닫기
                  </button>
                ) : (
                  <button className="btn small" onClick={() => { setReveal(true); setOpened(true); setCover(false); }}>
                    {opened ? "원고 다시 보기" : saved ? "원고 보기" : "그냥 보기"}
                  </button>
                )}
                {opened && !reveal && " 닫고 한 번 더 들어 보면 좋아요."}
              </span>
            </li>
          </ol>

          {reveal && (
            <section className="lsn-script">
              {line.trim() && <TandemCompare line={line.trim()} script={scriptBlocks} words={data.words} />}
              {data.kind === "video" && <p className="muted tiny">가림 띠를 걷었어요 — 자막을 보며 한 번 더.</p>}
              {data.kind === "audio" && !hasScript && (
                <p className="muted tiny">이 출처는 원고가 없어요. (다음 단계에서 AI 받아쓰기로 채울 예정)</p>
              )}
              {videoSents ? (
                <div className="lsn-sents">
                  {sentences.map((x) => (
                    <button key={x.i} className="lsn-sent" lang="de" onClick={() => playerApi.current?.goto(x.i)}>
                      <i>{x.i + 1}</i>
                      {x.text}
                    </button>
                  ))}
                </div>
              ) : (
                data.script?.map((b, i) => (
                  <div key={i} className="lsn-block">
                    {b.h && <h3>{b.h}</h3>}
                    {b.p && <p lang="de">{b.p}</p>}
                  </div>
                ))
              )}
              {data.words?.length > 0 && (
                <div className="lsn-words">
                  <div className="lsn-words-head">낱말 풀이 (쉬운 독일어)</div>
                  {data.words.map((w) => (
                    <div key={w.term} className="lsn-word">
                      <b lang="de">{w.term}</b>
                      <span lang="de">{w.expl}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {reveal && (
            <button className="btn wide-soft lsn-close" onClick={() => { setReveal(false); setCover(true); }}>
              원고 닫기
            </button>
          )}

          <button className="link-btn lsn-site" onClick={() => openApp(data.link || source.url)}>
            사이트에서 보기 <b>↗</b>
          </button>
        </>
      )}
      </div>
    </div>
  );
}
