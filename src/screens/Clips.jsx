// 🔖 갈무리 목록 — 듣기에서 저장해 둔 구간만 다시 듣는다.
//
// 글자는 가려 둔다: 먼저 듣고 → (선택) 들린 대로 적고 → [문장 보기]. 듣기 전에 글자가 보이면 귀가 아니라 눈으로 듣게 된다.
// 소리는 원래 주소에서 다시 받는다. 방송사가 옛 편을 내렸으면 재생되지 않는다 — 그때는 지워 달라고 안내한다.

import { useEffect, useState } from "react";
import { loadClips, patchClip, deleteClip } from "../lib/clipsRepo";
import { fmtRange } from "../lib/clips";
import { scoreRecall } from "../lib/recall";
import { SOURCES } from "../lib/listening";
import AudioPlayer from "../components/AudioPlayer";
import VideoPlayer from "../components/VideoPlayer";
import "../styles/listen.css";
import "../styles/clips.css";

const srcName = (id) => SOURCES[id]?.name || (id === "custom" ? "내 링크" : id);

export default function Clips({ userId, onClose }) {
  const [list, setList] = useState(null);
  const [err, setErr] = useState("");
  const [cur, setCur] = useState(null);

  useEffect(() => {
    let alive = true;
    loadClips(userId).then((r) => alive && setList(r)).catch((e) => alive && (setList([]), setErr(e.message)));
    return () => { alive = false; };
  }, [userId]);

  useEffect(() => {
    const k = (e) => e.key === "Escape" && (cur ? setCur(null) : onClose());
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [cur, onClose]);

  const update = (c) => setList((l) => l.map((x) => (x.id === c.id ? c : x)));
  const remove = async (c) => {
    setList((l) => l.filter((x) => x.id !== c.id));
    setCur(null);
    try { await deleteClip(userId, c.id); } catch (e) { setErr(e.message); }
  };

  const clip = list?.find((x) => x.id === cur);

  return (
    <div className="lsn clips" role="dialog" aria-label="갈무리">
      <div className="lsn-inner">
        <header className="lsn-head">
          <div className="lsn-src">
            {clip ? <button className="chip" onClick={() => setCur(null)}>← 목록</button> : <b>🔖 갈무리</b>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">✕</button>
        </header>
        {err && <div className="notice error" onClick={() => setErr("")}>{err}</div>}
        {!list && <p className="muted pad">불러오는 중…</p>}

        {list && !clip && (
          <>
            {list.length === 0 && !err && (
              <div className="notice soft">
                아직 갈무리한 구간이 없어요. 듣기 화면에서 다시 듣고 싶은 문장이 나올 때 <b>🔖 갈무리</b>를 누르세요.
              </div>
            )}
            <ul className="cl-list">
              {list.map((c) => (
                <li key={c.id}>
                  <button className="cl-row" onClick={() => setCur(c.id)}>
                    <span className="cl-meta">
                      {c.kind === "video" ? "🎬" : "🎧"} {srcName(c.src)} · {c.ep_date ? new Date(c.ep_date).toLocaleDateString("ko-KR") : ""} · {fmtRange(c.start_s, c.end_s)}
                      {c.heard > 0 && <span className="cl-heard">{c.heard}번 들음</span>}
                    </span>
                    <span className="cl-title">{c.title}</span>
                    {/* 글자는 가린다 — 메모만 보인다 */}
                    <span className="cl-memo">{c.memo || (c.text ? "문장 있음 · 가려 둠" : "문장 없음")}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {clip && <ClipPlay key={clip.id} userId={userId} clip={clip} onUpdate={update} onDelete={() => remove(clip)} onError={setErr} />}
      </div>
    </div>
  );
}

function ClipPlay({ userId, clip, onUpdate, onDelete, onError }) {
  const [said, setSaid] = useState("");
  const [shown, setShown] = useState(false);
  const [counted, setCounted] = useState(false);
  const [armed, setArmed] = useState(false);
  const bounds = { start: clip.start_s, end: clip.end_s };

  // 처음 ▶ 를 누르면 "다시 들은 횟수" +1 (한 번 열 때 한 번만)
  const countPlay = () => {
    if (counted) return;
    setCounted(true);
    const next = { ...clip, heard: (clip.heard || 0) + 1 };
    onUpdate(next);
    patchClip(userId, clip.id, { heard: next.heard }).catch((e) => onError(e.message));
  };
  const score = shown && said.trim() && clip.text ? scoreRecall(said, clip.text) : null;

  return (
    <section className="cl-play">
      <div className="lsn-title">{clip.title}</div>
      <div className="muted tiny">{srcName(clip.src)} · {fmtRange(clip.start_s, clip.end_s)}{clip.memo && ` · ${clip.memo}`}</div>

      <div onClickCapture={countPlay}>
        {clip.kind === "audio" ? (
          <AudioPlayer key={clip.media} src={clip.media} clip={bounds} />
        ) : (
          <VideoPlayer key={clip.media} videoId={clip.media} title={clip.title} sentences={[]} clip={bounds}>
            {!shown && <div className="lsn-cover cl-cover">자막 가림</div>}
          </VideoPlayer>
        )}
      </div>

      <div className="cl-try">
        <div className="cr-label">들린 대로 적어 보기 (선택)</div>
        <textarea className="input" rows={2} lang="de" spellCheck={false} value={said} onChange={(e) => setSaid(e.target.value)} placeholder="들린 단어만 적어도 돼요" />
      </div>

      {!shown ? (
        <button className="btn primary wide" onClick={() => setShown(true)}>{clip.text ? "문장 보기" : "메모 보기"}</button>
      ) : (
        <div className="cl-answer">
          {clip.text ? (
            <p className="rc-answer" lang="de">
              {score
                ? score.parts.map((p, i) => (p.word ? <span key={i} className={p.hit ? "hit" : "miss"}>{p.t}</span> : <span key={i}>{p.t}</span>))
                : clip.text}
            </p>
          ) : (
            <p className="muted tiny">이 갈무리에는 문장이 없어요. 그 편의 듣기 화면에서 원고를 연 뒤 붙일 수 있어요.</p>
          )}
          {score && <div className="muted tiny">들린 단어 {Math.round(score.score * 100)}%</div>}
          <button className="chip" onClick={() => setShown(false)}>다시 가리기</button>
        </div>
      )}

      <p className="muted tiny cl-note">재생이 안 되면 방송사가 그 편을 내린 거예요 — 이 갈무리는 지워도 돼요.</p>
      <div className="cr-actions">
        <button className={`btn ${armed ? "danger" : ""}`} onClick={() => (armed ? onDelete() : (setArmed(true), setTimeout(() => setArmed(false), 3000)))}>
          {armed ? "정말 지우기?" : "갈무리 지우기"}
        </button>
      </div>
    </section>
  );
}
