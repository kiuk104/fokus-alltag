// 오답 노트 — 다시 고칠 문장 고르기. 추천(때가 된 것, 유형 섞어 5개)을 미리 골라 두고, 내가 넣고 뺀다.
// 졸업한 문장도 펼쳐서 고를 수 있다.

import { useMemo, useState } from "react";
import { pickerGroups } from "../lib/drill";

const short = (day) => day.slice(5).replace("-", "/");

export default function DrillPicker({ pool, preset, today, onStart }) {
  const [sel, setSel] = useState(() => new Set(preset));
  const [type, setType] = useState("");
  const [showDone, setShowDone] = useState(false);

  const types = useMemo(() => [...new Set(pool.map((it) => it.type))], [pool]);
  const shown = type ? pool.filter((it) => it.type === type) : pool;
  const g = pickerGroups(shown, today);
  const ordered = useMemo(() => {
    const all = pickerGroups(pool, today);
    return [...all.due, ...all.later, ...all.done];
  }, [pool, today]);

  const toggle = (id) => setSel((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const setMany = (list, on) => setSel((s) => {
    const n = new Set(s);
    list.forEach((it) => (on ? n.add(it.id) : n.delete(it.id)));
    return n;
  });

  if (!pool.length) {
    return (
      <div className="notice soft">
        아직 다시 고칠 문장이 없어요. 교정에서 틀린 곳이 여기 쌓여요.
      </div>
    );
  }

  const row = (it) => {
    const i = it.before.indexOf(it.fix.from);
    return (
      <li key={it.id}>
        <label className={sel.has(it.id) ? "on" : ""}>
          <input type="checkbox" checked={sel.has(it.id)} onChange={() => toggle(it.id)} />
          <span className="dp-body">
            <span className="dp-sent" lang="de">
              {i < 0 ? it.before : <>{it.before.slice(0, i)}<u>{it.fix.from}</u>{it.before.slice(i + it.fix.from.length)}</>}
            </span>
            <span className="muted tiny">
              <span className="cr-type">{it.type}</span> {short(it.day)} 교정
              {it.state?.streak ? ` · 연속 ${it.state.streak}번 맞힘` : ""}
              {it.state?.tries && !it.state.streak ? " · 지난번에 틀림" : ""}
            </span>
          </span>
        </label>
      </li>
    );
  };

  const section = (title, list, note) => list.length > 0 && (
    <section className="dp-sec">
      <div className="dp-sec-head">
        <b>{title}</b> <span className="muted tiny">{list.length}개{note ? ` · ${note}` : ""}</span>
        <button className="fi-carry" onClick={() => setMany(list, !list.every((it) => sel.has(it.id)))}>
          {list.every((it) => sel.has(it.id)) ? "모두 빼기" : "모두 넣기"}
        </button>
      </div>
      <ul className="dp-list">{list.map(row)}</ul>
    </section>
  );

  return (
    <div className="dp">
      <p className="muted tiny">
        다시 고칠 문장을 고르세요. 추천 {preset.length}개를 미리 골라 뒀어요.
      </p>
      <div className="chips">
        <button className="chip" onClick={() => setSel(new Set(preset))}>추천대로</button>
        <button className="chip" onClick={() => setSel(new Set())}>모두 해제</button>
        {types.length > 1 && (
          <>
            <span className="dp-sep" />
            <button className={`chip ${!type ? "on" : ""}`} onClick={() => setType("")}>전체</button>
            {types.map((t) => (
              <button key={t} className={`chip ${type === t ? "on" : ""}`} onClick={() => setType(t)}>{t}</button>
            ))}
          </>
        )}
      </div>

      {section("오늘 할 때", g.due)}
      {section("아직 때가 아님", g.later, "미리 해도 돼요")}
      {g.done.length > 0 && (showDone
        ? section("졸업", g.done, "골라서 다시 할 수 있어요")
        : <button className="fi-carry dp-more" onClick={() => setShowDone(true)}>🎓 졸업한 문장 {g.done.length}개도 보기</button>)}

      <div className="dp-foot">
        <button className="btn primary wide" disabled={!sel.size} onClick={() => onStart(ordered.filter((it) => sel.has(it.id)))}>
          {sel.size ? `고른 ${sel.size}개 시작` : "문장을 골라 주세요"}
        </button>
      </div>
    </div>
  );
}
