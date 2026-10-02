// 지난 기록 — 오늘 이전에 쓴 기록을 날짜별로 다시 본다(읽기 전용). 기록 화면은 오늘 것만 보여 줘서, 어제 쓴 글이 안 보이는 것처럼 느껴졌다.
// 고치기는 오늘 기록에서만 한다(날짜가 섞이지 않게). 기록을 펼치면 그날 받은 교정까지 보인다(EntryReview, 2026-10-02).

import { useEffect, useState } from "react";
import { loadEntriesRange, sentIds } from "../lib/entryRepo";
import EntryReview from "./EntryReview";
import { addDays } from "../lib/program";
import { formFor } from "../lib/templates";
import { weekday } from "../lib/program";

const DAYS = 30;
const hhmm = (iso) => new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
const dayLabel = (d) =>
  new Date(`${d}T12:00:00`).toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });

export default function PastEntries({ userId, today }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let alive = true;
    loadEntriesRange(userId, addDays(today, -DAYS), addDays(today, -1))
      .then((r) => alive && setRows(r))
      .catch(() => alive && setRows([]));
    return () => { alive = false; };
  }, [userId, today]);

  if (!rows || rows.length === 0) return null;

  const byDay = new Map();
  for (const r of rows) byDay.set(r.day, [...(byDay.get(r.day) || []), r]);
  const days = [...byDay.keys()].sort().reverse();

  return (
    <details className="lsn-paste past-entries">
      <summary>지난 기록 · 최근 {DAYS}일 {rows.length}개</summary>
      <div className="lsn-paste-body">
        {days.map((d) => (
          <section key={d}>
            <h3 className="sheet-sub">{dayLabel(d)}</h3>
            {byDay.get(d).map((r) => (
              <details key={r.id} className="pe-item">
                <summary>
                  <span className="muted tiny">
                    {hhmm(r.created_at)} · {formFor(r.template, weekday(d)).title}{r.input_mode === "ko" && " · 한국어"}
                    <span className="pe-badges">
                      {r.correction?.data ? <b className="pe-badge ok">교정</b> : <b className="pe-badge">교정 없음</b>}
                      {sentIds(r).length > 0 && <b className="pe-badge">DE {sentIds(r).length}문장</b>}
                    </span>
                  </span>
                  <span className="pe-first">{(r.raw_text || "").replace(/^\[[^\]]+\]\s*/, "").split("\n")[0]}</span>
                </summary>
                <EntryReview entry={r} />
              </details>
            ))}
          </section>
        ))}
      </div>
    </details>
  );
}
