// 오늘 — 앱을 열면 보이는 곳. "오늘 뭘 하면 되는가"만 보여 준다.
//
// 루틴 네 칸은 계획서의 하루 구성 그대로다(🟢듣기 🟡말하기 🔵교정 🔴꺼내기).
// 🔴 은 원래 "소리 내서 반복"이었는데 인출 연습으로 바꿨다(기획서 0-2절) — 칸 이름(repeat)은 DB 호환 때문에 그대로.
// 기록을 저장하면 🟡, 교정을 받으면 🔵, 꺼내기 화면(screens/Recall.jsx)을 끝내면 🔴 가 저절로 켜진다 —
// 그때도 손 체크는 남긴다(교정을 Claude 앱에서 받은 날 등).

import {
  ROADMAP, programState, streak, dayCounts, dayFull, templateFor, mixFor, weekday,
} from "../lib/program";
import { formFor } from "../lib/templates";
import { DE_URL, KARTEN_URL, openApp } from "../lib/links";
import { listenFor } from "../lib/listening";
import ListenStep from "../components/ListenStep";
import "../styles/drill.css";

const STEPS = [
  { key: "listen", dot: "g", title: "듣기", min: "5분", desc: "자막 없이 한 번 → 자막 켜고 한 번. 무슨 이야기인지만 잡는다." },
  { key: "speak", dot: "y", title: "말하기", min: "10분", desc: "오늘 있었던 일 하나를 독일어로.", core: true },
  { key: "correct", dot: "b", title: "AI 교정", min: "5분", desc: "틀린 곳을 먼저 스스로 고쳐 보고 → 정답 → 문법 하나를 내 말로 설명." },
  { key: "repeat", dot: "r", title: "3문장 꺼내기", min: "5~10분", desc: "한국어 뜻만 보고 독일어로 말한 뒤 정답 확인. 따라 읽기보다 오래 남는다.", core: true },
];

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

function longDate(s) {
  const [, m, d] = s.split("-").map(Number);
  return `${m}월 ${d}일 (${DOW[weekday(s)]})`;
}

export default function Today({ program, today, days, onPatch, onGoEntry, onListen, onRecall, drillDue = 0, onDrill }) {
  const start = program.start_date;
  const st = programState(start, today);
  const row = days.get(today) || {};
  const short = !!row.short_mode;
  const n = streak(days, start, today);
  const road = ROADMAP[st.month - 1];

  const tplKey = templateFor(start, today, program.settings?.template);
  const tpl = formFor(tplKey, weekday(today));
  const mixed = !!mixFor(start, today) && !program.settings?.template;

  const toggle = (key) => onPatch(today, { [key]: !row[key] });
  const source = listenFor(weekday(today), st.month, program.settings);

  return (
    <div className="today">
      <section className="hero">
        <div className="hero-date">{longDate(today)}</div>
        {st.status === "before" && (
          <>
            <div className="hero-big">D-{st.daysLeft}</div>
            <div className="hero-sub">{longDate(start)}에 시작 · 오늘 해 두는 것은 연습으로만 남습니다</div>
          </>
        )}
        {st.status === "running" && (
          <>
            <div className="hero-big">
              {st.month}개월차 <span className="hero-day">· {st.dayNo}일째</span>
            </div>
            <div className="hero-sub">
              {st.phase.no}단계 “{st.phase.title}” — {road.goal} · <span className="muted">{road.focus}</span>
            </div>
          </>
        )}
        {st.status === "done" && (
          <>
            <div className="hero-big">6개월 완주</div>
            <div className="hero-sub">문제가 생겼을 때 3~5분 동안 독일어로 설명할 수 있는가 — 진도 탭에서 확인.</div>
          </>
        )}
        {st.status !== "before" && (
          <div className="streak">
            <b>{n}</b>일 말하기 연속 {dayCounts(row) && <span className="streak-ok">· 오늘 완료</span>}
          </div>
        )}
      </section>

      {st.sunday && (
        <div className="notice soft">
          일요일은 쉬는 날입니다. 해도 되고, 안 해도 연속 일수가 끊기지 않아요.
        </div>
      )}

      <section className="tpl-card">
        <div className="tpl-kicker">
          오늘의 말하기 {mixed && <span className="mix-badge">섞는 날</span>}
        </div>
        <div className="tpl-title">{tpl.title}</div>
        <div className="tpl-hint">
          {mixed ? "지난 형식을 다시 꺼내 쓰는 날 — 섞어야 오래 남는다." : tpl.hint}
        </div>
      </section>

      <div className="routine-head">
        <h2>오늘 루틴</h2>
        <button
          className={`chip ${short ? "on" : ""}`}
          onClick={() => onPatch(today, { short_mode: !short })}
          aria-pressed={short}
        >
          오늘은 10분만
        </button>
      </div>
      {short && (
        <p className="muted tiny routine-note">말하기와 3문장 꺼내기만 하면 오늘도 연속으로 칩니다.</p>
      )}

      <ul className="routine">
        {STEPS.map((s) => {
          const skipped = short && !s.core;
          const on = !!row[s.key];
          if (s.key === "listen") {
            return (
              <ListenStep
                key={`listen-${today}`}
                source={source}
                row={row}
                skipped={skipped}
                onToggle={() => toggle("listen")}
                onPatch={(patch) => onPatch(today, patch)}
                onOpenInApp={() => onListen(source)}
              />
            );
          }
          return (
            <li key={s.key} className={`step ${on ? "done" : ""} ${skipped ? "skip" : ""}`}>
              <button className="step-check" onClick={() => toggle(s.key)} aria-pressed={on} aria-label={`${s.title} 완료`}>
                <span className={`dot ${s.dot}`}>{on ? "✓" : ""}</span>
              </button>
              <div className="step-body" onClick={() => toggle(s.key)}>
                <div className="step-title">
                  {s.title} <span className="step-min">{s.min}</span>
                  {skipped && <span className="step-min"> · 오늘은 건너뜀</span>}
                </div>
                <div className="step-desc">{s.desc}</div>
              </div>
              {s.key === "speak" && (
                <button className="btn small" onClick={onGoEntry}>
                  기록
                </button>
              )}
              {s.key === "repeat" && (
                <button className="btn small" onClick={onRecall}>
                  꺼내기
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {dayFull(row) && <p className="all-done">네 칸 모두 끝. 수고했어요.</p>}

      {/* ✏️ 오답 노트 — 루틴 밖의 선택 카드. 하루 20분에 단계를 더하지 않고, 시간 남는 날 하는 보너스 */}
      {drillDue > 0 && (
        <div className="drill-card">
          <div>
            <b>✏️ 틀린 곳 다시 고치기 · {drillDue}개</b>
            <p>예전 교정에서 틀린 곳이 다시 나올 때가 됐어요. 선택이에요.</p>
          </div>
          <button className="btn small" onClick={onDrill}>하기</button>
        </div>
      )}

      <section className="links">
        {KARTEN_URL && (
          <button className="link-btn" onClick={() => openApp(KARTEN_URL)}>
            외운 문장 복습 <b>Karten</b> ↗
          </button>
        )}
        <button className="link-btn" onClick={() => openApp(DE_URL)}>
          단어·문장 창고 <b>Fokus DE</b> ↗
        </button>
      </section>
    </div>
  );
}
