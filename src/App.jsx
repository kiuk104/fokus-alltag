// Fokus Alltag — CP0: 로그인 · 프로그램 시작일 · 오늘 화면(루틴 체크) · 탭 셸.
//
// 역할(기획서 0-1절): 이 앱은 **산출**(말하기·쓰기·교정)과 6개월 진도만 맡는다.
// 암기 복습은 Karten, 문장 창고는 Fokus DE — 여기서 다시 만들지 않는다.
// 가드레일: scripts/check-guardrails.mjs (npm run check)

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import { registerServiceWorker } from "./lib/pwa";
import { applyTheme, getSettings, saveSettings } from "./lib/theme";
import { loadDeTheme, withDeTheme } from "./lib/deTheme";
import { loadProgram, saveProgram, loadDays, saveDay, MIGRATION_FILE } from "./lib/programRepo";
import { addDays, ymd } from "./lib/program";
import Auth from "./components/Auth";
import PwaBar from "./components/PwaBar";
import TabBar from "./components/TabBar";
import Setup from "./screens/Setup";
import Today from "./screens/Today";
import Entry from "./screens/Entry";
import Progress from "./screens/Progress";
import Settings from "./screens/Settings";
import Listen from "./screens/Listen";
import Recall from "./screens/Recall";
import "./styles/app.css";
import "./styles/pwa.css"; // 마지막 — 안전영역 여백이 app.css 를 덮어야 한다

export default function App() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);

  const [program, setProgram] = useState(undefined); // undefined = 아직 모름, null = 없음
  const [missing, setMissing] = useState(false); // 마이그레이션을 안 돌렸다
  const [days, setDays] = useState(() => new Map());
  const [error, setError] = useState(null);

  const [tab, setTab] = useState("today");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [listenSrc, setListenSrc] = useState(null); // 듣기 화면에 띄운 출처
  const [recallOpen, setRecallOpen] = useState(false); // 🔴 3문장 꺼내기
  const [appSet, setAppSet] = useState(() => getSettings());

  // 자정을 넘겨 켜 둔 앱이 어제를 "오늘"로 보여 주지 않게 — 돌아올 때마다 다시 잰다.
  const [today, setToday] = useState(() => ymd());
  useEffect(() => {
    const tick = () => setToday(ymd());
    document.addEventListener("visibilitychange", tick);
    const id = setInterval(tick, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", tick);
      clearInterval(id);
    };
  }, []);

  // PWA
  const [updateReady, setUpdateReady] = useState(false);
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && !navigator.onLine);
  useEffect(() => {
    applyTheme();
    registerServiceWorker(() => setUpdateReady(true));
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id;

  const reload = useCallback(async () => {
    if (!userId) return;
    setError(null);
    try {
      const r = await loadProgram(userId);
      setMissing(r.missing);
      setProgram(r.program);
      if (!r.missing) {
        const rows = await loadDays(userId, addDays(ymd(), -400));
        setDays(new Map(rows.map((row) => [row.day, row])));
      }
    } catch (e) {
      setError(e.message);
    }
  }, [userId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const changeSettings = useCallback((next) => {
    saveSettings(next);
    applyTheme(next);
    setAppSet(next);
  }, []);

  // 🎨 "앱을 열 때마다 DE 설정 따라가기" — 로그인 뒤 한 번 DE 의 테마·색 조정을 받아 온다
  useEffect(() => {
    if (!userId || !getSettings().followDe) return;
    loadDeTheme(userId)
      .then((de) => de && changeSettings({ ...withDeTheme(getSettings(), de), followDe: true }))
      .catch(() => {}); // 못 받으면 지난번 색 그대로
  }, [userId, changeSettings]);

  // 프로그램 설정(듣기 순환표 등) — alltag_program.settings 에 통째로 저장
  const saveProgramSettings = async (settings) => {
    const before = program;
    setProgram((p) => ({ ...p, settings }));
    try {
      setProgram(await saveProgram(userId, { start_date: program.start_date, settings }));
    } catch (e) {
      setProgram(before);
      setError("설정 저장 실패: " + e.message);
    }
  };

  const startProgram = async (start_date) => {
    try {
      setProgram(await saveProgram(userId, { start_date }));
    } catch (e) {
      setError(e.message);
    }
  };

  // 체크는 누르는 즉시 화면에 반영하고, 저장이 실패하면 되돌린다.
  // 배송 중 신호가 약한 곳에서 누르고 반응이 없으면 두 번 누르게 된다.
  const patchDay = async (day, patch) => {
    const before = days.get(day);
    setDays((prev) => new Map(prev).set(day, { day, ...before, ...patch }));
    try {
      const row = await saveDay(userId, day, patch);
      setDays((prev) => new Map(prev).set(day, row));
    } catch (e) {
      setDays((prev) => {
        const m = new Map(prev);
        if (before) m.set(day, before);
        else m.delete(day);
        return m;
      });
      setError("저장 실패: " + e.message);
    }
  };

  if (!ready) return null;
  if (!session) return <Auth />;

  const pwa = <PwaBar state={{ updateReady, offline }} />;

  if (missing) {
    return (
      <div className="shell">
        {pwa}
        <div className="notice">
          <b>테이블이 아직 없습니다.</b>
          <p>
            Supabase 대시보드 → SQL Editor 에서 <code>{MIGRATION_FILE}</code> 를 통째로 실행한 뒤
            다시 열어 주세요.
          </p>
          <button className="btn" onClick={reload}>다시 확인</button>
        </div>
      </div>
    );
  }

  if (program === undefined) {
    return (
      <div className="shell">
        {pwa}
        {error ? <div className="notice error">{error}</div> : <p className="muted pad">불러오는 중…</p>}
      </div>
    );
  }

  if (!program) {
    return (
      <div className="shell">
        {pwa}
        {error && <div className="notice error">{error}</div>}
        <Setup onStart={startProgram} />
      </div>
    );
  }

  return (
    <div className="shell has-tabs">
      <header className="topbar">
        <div className="topbar-title">
          Fokus <em>Alltag</em>
        </div>
        <div className="topbar-spacer" />
        <button className="icon-btn" aria-label="설정" onClick={() => setSettingsOpen(true)}>
          ⚙
        </button>
      </header>
      {pwa}
      {error && (
        <div className="notice error" onClick={() => setError(null)}>
          {error}
        </div>
      )}

      {tab === "today" && (
        <Today
          program={program}
          today={today}
          days={days}
          onPatch={patchDay}
          onGoEntry={() => setTab("entry")}
          onListen={setListenSrc}
          onRecall={() => setRecallOpen(true)}
        />
      )}
      {tab === "entry" && (
        <Entry key={today} program={program} today={today} userId={userId} onPatch={patchDay} onError={setError} />
      )}
      {tab === "progress" && <Progress program={program} today={today} days={days} />}

      <TabBar tab={tab} onTab={setTab} />

      {listenSrc && (
        <Listen
          key={`${listenSrc.id}-${today}`}
          source={listenSrc}
          today={today}
          row={days.get(today) || {}}
          onPatch={(patch) => patchDay(today, patch)}
          onClose={() => setListenSrc(null)}
        />
      )}

      {recallOpen && (
        <Recall
          key={today}
          userId={userId}
          today={today}
          done={!!days.get(today)?.repeat}
          onDone={() => patchDay(today, { repeat: true })}
          onClose={() => setRecallOpen(false)}
          onError={setError}
        />
      )}

      {settingsOpen && (
        <Settings
          settings={appSet}
          onSettings={changeSettings}
          program={program}
          onStartDate={startProgram}
          onProgramSettings={saveProgramSettings}
          email={session.user.email}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
