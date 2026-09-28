// 진도 — 6개월 로드맵과 "한 날" 수. 문법 8개·나만의 100문장·자주 틀리는 것은
// 기록과 교정이 쌓여야 셀 수 있어서 CP4 에서 채운다(자리만 먼저 보여 준다).

import { GRAMMAR, MONTH_DAYS, ROADMAP, programState, daysBetween, dayCounts } from "../lib/program";

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

export default function Progress({ program, today, days }) {
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
