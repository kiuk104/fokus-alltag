// 진도 — 6개월 로드맵과 "한 날" 수 · 자주 틀리는 것(오답 노트로 들어가는 곳).
// 문법 8개·나만의 100문장은 CP4 나머지에서 채운다(자리만 먼저 보여 준다).

import { GRAMMAR, MONTH_DAYS, ROADMAP, programState, daysBetween, dayCounts } from "../lib/program";
import { typeStats, isDue } from "../lib/drill";
import { deHasGrammar, deGrammarUrl, openApp } from "../lib/links";
import "../styles/drill.css";

// 월별로 "한 날"(말하기+소리 내기) 수를 센다. 시작 전 연습은 뺀다.
function doneByMonth(days, start) {
  const out = Array(6).fill(0);
  for (const row of days.values()) {
    if (!dayCounts(row)) continue;
    const diff = daysBetween(start, row.day);
    if (diff < 0) continue;
    const m = Math.min(5, Math.floor(diff / MONTH_DAYS));
    out[m]++;
  }
  return out;
}

export default function Progress({ program, today, days, entries, items, onDrill }) {
  const start = program.start_date;
  const st = programState(start, today);
  const done = doneByMonth(days, start);
  const current = st.status === "running" ? st.month : st.status === "done" ? 7 : 0;

  return (
    <div className="progress">
      <h2 className="sec-title">6개월 로드맵</h2>
      <ol className="road">
        {ROADMAP.map((r) => (
          <li key={r.month} className={r.month === current ? "now" : r.month < current ? "past" : ""}>
            <span className="road-m">{r.month}</span>
            <div className="road-body">
              <div className="road-goal">{r.goal}</div>
              <div className="road-focus">{r.focus}</div>
            </div>
            <span className="road-count" title="말하기와 소리 내기를 한 날">
              {done[r.month - 1]}
              <small>/{MONTH_DAYS}</small>
            </span>
          </li>
        ))}
      </ol>

      <h2 className="sec-title">B2 핵심 문법 8개</h2>
      <p className="muted tiny sec-note">
        아는 것이 아니라 <b>내 문장에 쓴 횟수</b>로 잽니다 — 교정 기록이 쌓이면(CP4) 숫자가 붙어요.
      </p>
      <ul className="grammar">
        {GRAMMAR.map((g) => (
          <li key={g.key}>
            <div className="g-label">{g.label}</div>
            <div className="g-ex">{g.ex}</div>
          </li>
        ))}
      </ul>

      <Mistakes entries={entries} items={items} today={today} onDrill={onDrill} />

      <h2 className="sec-title">나만의 100문장</h2>
      <div className="hundred">
        <div className="hundred-num">
          0<small> / 100</small>
        </div>
        <p className="muted tiny">
          교정에서 고른 외울 문장이 Fokus DE 에 <code>Alltag</code> 단어장으로 쌓이면 여기서 셉니다.
        </p>
      </div>

      <h2 className="sec-title">6개월 후 목표</h2>
      <p className="goal">
        직장에서 문제가 생겼을 때 3~5분 동안 독일어로 상황을 설명하고, 원인을 말하고, 의견과 해결책까지 제시한다.
      </p>
    </div>
  );
}

// ── 자주 틀리는 것 Top 5 ────────────────────────────────────────────────────
// 막대: 빨강 = 아직 연습할 것, 초록 = 졸업(두 번 연속 맞힘). 철자·뜻 같은 유형은 세기만 하고 연습은 안 낸다.
function Mistakes({ entries, items, today, onDrill }) {
  if (!entries) {
    return (
      <>
        <h2 className="sec-title">자주 틀리는 것</h2>
        <p className="muted tiny">불러오는 중…</p>
      </>
    );
  }
  const top = typeStats(entries, items).slice(0, 5);
  const due = items.filter((it) => isDue(it, today)).length;
  return (
    <>
      <h2 className="sec-title">자주 틀리는 것</h2>
      {top.length === 0 ? (
        <p className="muted tiny sec-note">교정을 받으면 틀린 유형이 여기 쌓여요.</p>
      ) : (
        <>
          <p className="muted tiny sec-note">
            유형을 누르면 그때 틀린 내 문장을 <b>다시 고쳐 써요</b>. 두 번 연속 맞히면 졸업.
          </p>
          <ul className="mistakes">
            {top.map((r) => (
              <li key={r.key}>
                <div className="mk-body">
                  <div className="mk-name">
                    {r.type} <small>{r.count}번{r.drillable && r.done > 0 ? ` · 졸업 ${r.done}` : ""}{!r.drillable ? " · 연습 안 함" : ""}</small>
                  </div>
                  <div className="mk-bar" aria-hidden="true">
                    <i className="done" style={{ width: `${(r.done / r.count) * 100}%` }} />
                    <i style={{ width: `${((r.count - r.done) / r.count) * 100}%`, opacity: r.drillable ? 1 : 0.35 }} />
                  </div>
                </div>
                <div className="mk-acts">
                  {r.drillable && r.open + r.done > 0 && (
                    <button className="btn small" onClick={() => onDrill(r.type)}>다시 고치기</button>
                  )}
                  {deHasGrammar(r.type) && (
                    <button className="link-btn mk-de" onClick={() => openApp(deGrammarUrl(r.type))} title="Fokus DE Dojo 📐 문법">
                      DE ↗
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {due > 0 && (
            <button className="btn primary mk-mix" onClick={() => onDrill(null)}>
              섞어서 다시 고치기 · 오늘 {due}개
            </button>
          )}
        </>
      )}
    </>
  );
}
