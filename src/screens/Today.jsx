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
import { useT } from "../strings/useT";
import "../styles/drill.css";

// 칸 이름 · 시간 · 설명은 strings 의 "today.step.<key>.title|min|desc" (듣기 칸은 ListenStep 이 그린다)
const STEPS = [
  { key: "listen", dot: "g" },
  { key: "speak", dot: "y", core: true },
  { key: "correct", dot: "b" },
  { key: "repeat", dot: "r", core: true },
];

function longDate(s, t) {
  const [, m, d] = s.split("-").map(Number);
  return t("date.long", { m, d, dow: t(`dow.${weekday(s)}`) });
}

export default function Today({ program, today, days, onPatch, onGoEntry, onListen, onRecall, drillDue = 0, onDrill }) {
  const t = useT();
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
        <div className="hero-date">{longDate(today, t)}</div>
        {st.status === "before" && (
          <>
            <div className="hero-big">D-{st.daysLeft}</div>
            <div className="hero-sub">{t("today.before.sub", { date: longDate(start, t) })}</div>
          </>
        )}
        {st.status === "running" && (
          <>
            <div className="hero-big">
              {t("today.month", { n: st.month })} <span className="hero-day">{t("today.day", { n: st.dayNo })}</span>
            </div>
            <div className="hero-sub">
              {t("today.phase", { no: st.phase.no, title: st.phase.title, goal: road.goal })} <span className="muted">{road.focus}</span>
            </div>
          </>
        )}
        {st.status === "done" && (
          <>
            <div className="hero-big">{t("today.done.big")}</div>
            <div className="hero-sub">{t("today.done.sub")}</div>
          </>
        )}
        {st.status !== "before" && (
          <div className="streak">
            <b>{n}</b>{t("today.streak")} {dayCounts(row) && <span className="streak-ok">{t("today.streak.ok")}</span>}
          </div>
        )}
      </section>

      {st.sunday && (
        <div className="notice soft">
          {t("today.sunday")}
        </div>
      )}

      <section className="tpl-card">
        <div className="tpl-kicker">
          {t("today.tpl.kicker")} {mixed && <span className="mix-badge">{t("today.tpl.mix")}</span>}
        </div>
        <div className="tpl-title">{tpl.title}</div>
        <div className="tpl-hint">
          {mixed ? t("today.tpl.mixHint") : tpl.hint}
        </div>
      </section>

      <div className="routine-head">
        <h2>{t("today.routine")}</h2>
        <button
          className={`chip ${short ? "on" : ""}`}
          onClick={() => onPatch(today, { short_mode: !short })}
          aria-pressed={short}
        >
          {t("today.short")}
        </button>
      </div>
      {short && (
        <p className="muted tiny routine-note">{t("today.short.note")}</p>
      )}

      <ul className="routine">
        {STEPS.map((s) => {
          const skipped = short && !s.core;
          const on = !!row[s.key];
          const title = t(`today.step.${s.key}.title`);
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
              <button className="step-check" onClick={() => toggle(s.key)} aria-pressed={on} aria-label={t("today.check", { title })}>
                <span className={`dot ${s.dot}`}>{on ? "✓" : ""}</span>
              </button>
              <div className="step-body" onClick={() => toggle(s.key)}>
                <div className="step-title">
                  {title} <span className="step-min">{t(`today.step.${s.key}.min`)}</span>
                  {skipped && <span className="step-min">{t("today.skipped")}</span>}
                </div>
                <div className="step-desc">{t(`today.step.${s.key}.desc`)}</div>
              </div>
              {s.key === "speak" && (
                <button className="btn small" onClick={onGoEntry}>
                  {t("today.step.speak.go")}
                </button>
              )}
              {s.key === "repeat" && (
                <button className="btn small" onClick={onRecall}>
                  {t("today.step.repeat.go")}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {dayFull(row) && <p className="all-done">{t("today.allDone")}</p>}

      {/* ✏️ 오답 노트 — 루틴 밖의 선택 카드. 하루 20분에 단계를 더하지 않고, 시간 남는 날 하는 보너스 */}
      {drillDue > 0 && (
        <div className="drill-card">
          <div>
            <b>{t("today.drill.title", { n: drillDue })}</b>
            <p>{t("today.drill.desc")}</p>
          </div>
          <button className="btn small" onClick={onDrill}>{t("today.drill.go")}</button>
        </div>
      )}

      <section className="links">
        {KARTEN_URL && (
          <button className="link-btn" onClick={() => openApp(KARTEN_URL)}>
            {t("today.link.karten")} <b>Karten</b> ↗
          </button>
        )}
        <button className="link-btn" onClick={() => openApp(DE_URL)}>
          {t("today.link.de")} <b>Fokus DE</b> ↗
        </button>
      </section>
    </div>
  );
}
