// 설정 시트 — 테마 · 듣기 · 시작일 · 로그아웃.

import { useState } from "react";
import { THEMES } from "../lib/theme";
import { supabase } from "../lib/supabase";
import { programState, ymd } from "../lib/program";
import ListenSettings from "../components/ListenSettings";

export default function Settings({ settings, onSettings, program, onStartDate, onProgramSettings, email, onClose }) {
  const { month } = programState(program.start_date, ymd());
  const [start, setStart] = useState(program.start_date);
  const dirty = start && start !== program.start_date;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="설정">
        <div className="sheet-head">
          <h2>설정</h2>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">✕</button>
        </div>

        <h3 className="sheet-sub">테마</h3>
        <div className="themes">
          {THEMES.map((t) => (
            <button
              key={t.id}
              className={`theme ${settings.theme === t.id ? "on" : ""}`}
              onClick={() => onSettings({ ...settings, theme: t.id })}
            >
              <span className="swatches">
                {t.swatches.map((c) => (
                  <i key={c} style={{ background: c }} />
                ))}
              </span>
              {t.name}
            </button>
          ))}
        </div>

        <h3 className="sheet-sub">🟢 듣기 — 요일별로 열 곳</h3>
        <ListenSettings program={program} month={month} onSave={onProgramSettings} />

        <h3 className="sheet-sub">프로그램 시작일</h3>
        <div className="row">
          <input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          <button className="btn" disabled={!dirty} onClick={() => onStartDate(start)}>
            바꾸기
          </button>
        </div>
        <p className="muted tiny">
          바꾸면 몇 개월차인지와 오늘의 형식이 새 날짜 기준으로 다시 계산됩니다. 체크한 기록은 그대로입니다.
        </p>

        <h3 className="sheet-sub">계정</h3>
        <div className="row">
          <span className="muted tiny grow">{email}</span>
          <button className="btn" onClick={() => supabase.auth.signOut()}>로그아웃</button>
        </div>
      </div>
    </div>
  );
}
