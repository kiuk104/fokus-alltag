// 설정 시트 — 테마 · 듣기 · 시작일 · 로그아웃.

import { useRef, useState } from "react";
import { THEMES, themeSwatches } from "../lib/theme";
import { loadDeTheme, withDeTheme } from "../lib/deTheme";
import { supabase } from "../lib/supabase";
import { programState, ymd } from "../lib/program";
import ListenSettings from "../components/ListenSettings";

export default function Settings({ settings, onSettings, program, onStartDate, onProgramSettings, email, onClose }) {
  const { month } = programState(program.start_date, ymd());
  const [start, setStart] = useState(program.start_date);
  const dirty = start && start !== program.start_date;

  // 🎨 Fokus DE 의 테마·색 조정 가져오기 (lib/deTheme.js)
  const [deMsg, setDeMsg] = useState(null);
  const curTheme = settings.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const overCount = Object.keys(settings.themeOverrides?.[curTheme] || {}).length;
  const importDe = async (follow = settings.followDe) => {
    setDeMsg("가져오는 중…");
    try {
      const { data } = await supabase.auth.getSession();
      const de = await loadDeTheme(data.session?.user?.id);
      if (!de) return setDeMsg("Fokus DE 에 저장된 설정이 없어요. DE 에서 테마를 한 번 바꿔 보세요.");
      onSettings({ ...withDeTheme(settings, de), followDe: follow });
      const name = THEMES.find((t) => t.id === de.theme)?.name || de.theme;
      setDeMsg(`✓ 가져왔어요: ${name}${de.count ? ` · 색 조정 ${de.count}개` : ""}.`);
    } catch (e) {
      setDeMsg(`못 가져왔어요: ${e.message}`);
    }
  };

  // 바깥(어두운 배경)을 "눌러서 뗀" 경우에만 닫는다. 드롭다운 선택 직후 딸려 온 클릭이
  // 배경에 닿아 시트가 저절로 닫히던 문제를 막는다.
  const downOnBackdrop = useRef(false);

  return (
    <div
      className="sheet-backdrop"
      onPointerDown={(e) => { downOnBackdrop.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (e.target === e.currentTarget && downOnBackdrop.current) onClose(); downOnBackdrop.current = false; }}
    >
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
              // 직접 고르면 "DE 따라가기" 는 끈다 (다음에 열 때 덮어쓰지 않게)
              onClick={() => onSettings({ ...settings, theme: t.id, followDe: false })}
            >
              <span className="swatches">
                {themeSwatches(t, settings.themeOverrides).map((c, i) => (
                  <i key={i} style={{ background: c }} />
                ))}
              </span>
              {t.name}
            </button>
          ))}
        </div>

        <div className="de-theme">
          <button className="btn small" onClick={() => importDe()}>🎨 Fokus DE 색 가져오기</button>
          <label className="de-follow tiny">
            <input
              type="checkbox"
              checked={!!settings.followDe}
              onChange={(e) => (e.target.checked ? importDe(true) : onSettings({ ...settings, followDe: false }))}
            />
            앱을 열 때마다 DE 설정 따라가기
          </label>
        </div>
        {(deMsg || overCount > 0) && (
          <p className="muted tiny de-msg">
            {deMsg}
            {overCount > 0 && (
              <>
                {deMsg ? " " : ""}지금 테마에 색 조정 {overCount}개 적용 중 ·{" "}
                <button
                  className="text-link"
                  onClick={() => {
                    const all = { ...settings.themeOverrides };
                    delete all[curTheme];
                    onSettings({ ...settings, themeOverrides: all, followDe: false });
                    setDeMsg(null);
                  }}
                >
                  기본 색으로
                </button>
              </>
            )}
          </p>
        )}

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
