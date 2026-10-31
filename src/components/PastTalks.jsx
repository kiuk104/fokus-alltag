// 🎙 지난 대화 — 저장한 대화 기록(alltag_entries · template "talk")을 다시 보고 지운다 (screens/Talk.jsx 고르기 화면 아래).
// 기록 탭은 대화 기록을 거르므로(Entry · PastEntries) 여기가 대화 기록의 유일한 자리다. 2026-10-31.
//
// 지우면: 그 대화의 오답 노트 항목도 함께 사라진다(같은 줄에 들어 있다).
//        Fokus DE 로 보낸 문장은 남는다 — 이 앱은 DE 문장을 지울 수 없다(가드레일). 지우려면 DE 단어장 Alltag 에서.

import { useEffect, useState } from "react";
import { loadEntriesRange, deleteEntry, sentIds } from "../lib/entryRepo";
import { addDays } from "../lib/program";
import { TALK_TEMPLATE, topicOf, clock } from "../lib/talk";
import "../styles/review.css";

const DAYS = 60;
const when = (iso) =>
  new Date(iso).toLocaleString("ko-KR", { month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });

export default function PastTalks({ userId, today, onError, onContinue }) {
  const [rows, setRows] = useState(null);
  const [armed, setArmed] = useState(null); // 한 번 누르면 "정말 지우기?" — 두 번째에 지운다

  useEffect(() => {
    let alive = true;
    loadEntriesRange(userId, addDays(today, -DAYS), today)
      .then((r) => alive && setRows(r.filter((x) => x.template === TALK_TEMPLATE).reverse()))
      .catch(() => alive && setRows([]));
    return () => { alive = false; };
  }, [userId, today]);

  if (!rows || rows.length === 0) return null;

  const remove = async (row) => {
    if (armed !== row.id) {
      setArmed(row.id);
      setTimeout(() => setArmed((a) => (a === row.id ? null : a)), 3000);
      return;
    }
    setArmed(null);
    try {
      await deleteEntry(userId, row.id);
      setRows((list) => list.filter((r) => r.id !== row.id));
    } catch (e) {
      onError("삭제 실패: " + e.message);
    }
  };

  return (
    <details className="lsn-paste tk-past">
      <summary>지난 대화 · 최근 {DAYS}일 {rows.length}개</summary>
      <div className="lsn-paste-body">
        {rows.map((r) => {
          const t = r.correction?.talk || {};
          const tp = topicOf(t.topic || r.parts?.topic);
          const nFix = r.correction?.data?.b1?.fixes?.length || 0;
          const nDe = sentIds(r).length;
          return (
            <details key={r.id} className="pe-item tk-past-item">
              <summary>
                <span className="muted tiny">
                  {when(r.created_at)} · {tp.icon} {tp.label}{t.seconds ? ` · ${clock(t.seconds)}` : ""}
                  <span className="pe-badges">
                    {nFix > 0 && <b className="pe-badge ok">오답 {nFix}</b>}
                    {nDe > 0 && <b className="pe-badge">DE {nDe}문장</b>}
                  </span>
                </span>
                <span className="pe-first">{t.summary || (r.raw_text || "").split("\n")[0] || "(내 말 없음)"}</span>
              </summary>

              <ul className="tk-lines flat">
                {(t.lines || []).map((l, i) => (
                  <li key={i} className={`tk-line ${l.who}`}>
                    {l.who === "me" && <span className="tk-who">인식된 내 말</span>}
                    <span lang="de" className="tk-text">{l.text}</span>
                  </li>
                ))}
              </ul>
              {(t.fixes || []).length > 0 && (
                <ul className="tk-past-fixes">
                  {t.fixes.map((f, i) => (
                    <li key={i}><span className="tk-said" lang="de">{f.said}</span> → <b lang="de">{f.better}</b></li>
                  ))}
                </ul>
              )}

              <div className="tk-past-del">
                {onContinue && (t.lines || []).length > 0 && (
                  <button className="btn small" onClick={() => onContinue(r)}>▶ 이 이야기 이어서 대화하기</button>
                )}
                {armed === r.id && (
                  <span className="muted tiny">
                    오답 노트 항목도 같이 지워져요.{nDe > 0 ? " DE 로 보낸 문장은 DE 에 남아요." : ""}
                  </span>
                )}
                <button className={`btn small ${armed === r.id ? "danger" : ""}`} onClick={() => remove(r)}>
                  {armed === r.id ? "정말 지우기" : "🗑 이 대화 지우기"}
                </button>
              </div>
            </details>
          );
        })}
      </div>
    </details>
  );
}
