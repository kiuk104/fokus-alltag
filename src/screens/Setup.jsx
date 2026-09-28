// 처음 한 번 — 프로그램 시작일 정하기. 나중에 설정에서 바꿀 수 있다.

import { useState } from "react";
import { PHASES, TOTAL_DAYS, addDays } from "../lib/program";

export const DEFAULT_START = "2026-10-01";

export default function Setup({ onStart }) {
  const [start, setStart] = useState(DEFAULT_START);
  const [busy, setBusy] = useState(false);

  const go = async () => {
    setBusy(true);
    await onStart(start);
    setBusy(false);
  };

  return (
    <div className="setup">
      <div className="setup-logo">
        Fokus <em>Alltag</em>
      </div>
      <p className="setup-lead">
        하루 20~30분, 주 6일. <br />
        오늘 있었던 일을 독일어로 말하고, 교정받고, 세 문장만 외운다.
      </p>

      <ol className="setup-phases">
        {PHASES.map((p) => (
          <li key={p.no}>
            <b>{p.months.join("~")}개월</b> {p.title}
          </li>
        ))}
      </ol>

      <label className="field">
        <span className="field-label">시작일</span>
        <input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
      </label>
      <p className="muted tiny">
        끝나는 날: {start ? addDays(start, TOTAL_DAYS - 1) : "—"} · 30일마다 한 달씩 넘어갑니다.
      </p>

      <button className="btn primary wide" disabled={!start || busy} onClick={go}>
        {busy ? "…" : "이 날짜로 시작"}
      </button>
    </div>
  );
}
