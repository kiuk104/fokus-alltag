// 기록 — CP1. 형식별 입력 칸 · 🎤 음성 인식 · 한국어 모드 · alltag_entries 저장.
//
// 흐름: 칸을 채운다(말하거나 친다) → [저장] → 오늘 루틴의 🟡말하기가 켜진다.
// 저장한 기록은 바로 아래에서 AI 교정(components/Correction.jsx, CP2)을 받는다.
// 상한에 닿으면 교정 화면이 [교정 요청 복사](Claude 앱)로 돌아간다(lib/bridge.js).
//
// 쓰는 동안은 기기에 임시 저장된다(entryRepo 의 draft). 배송 중 신호가 끊기거나 앱이 닫혀도
// 다시 열면 그대로 있고, DB 에 저장한 뒤에야 지운다.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { programState, templateFor, mixFor, weekday } from "../lib/program";
import { formFor, SWITCHABLE, composeText, hasContent, randomQuestion } from "../lib/templates";
import { listen, stopListening, supported, appendSpoken } from "../lib/speech";
import { loadEntries, saveEntry, deleteEntry, loadDraft, saveDraft, peekLegacyDraft, clearLegacyDraft } from "../lib/entryRepo";
import Correction from "../components/Correction";
import FieldInput from "../components/FieldInput";
import Revive from "../components/Revive";

const hhmm = (iso) => new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });

function blank(template, mode = "de") {
  const parts = template === "why" ? { q: randomQuestion() } : {};
  return { id: null, template, input_mode: mode, parts };
}

export default function Entry({ program, today, userId, onPatch, onError }) {
  const start = program.start_date;
  const { month } = programState(start, today);
  const autoTpl = templateFor(start, today, program.settings?.template);
  const mixed = mixFor(start, today);

  const [entries, setEntries] = useState(null);
  const [edit, setEdit] = useState(() => {
    const d = loadDraft(today);
    if (d) return d;
    const b = blank(autoTpl);
    const legacy = peekLegacyDraft(today); // CP0 에서 쓰던 한 칸짜리 글
    if (legacy) b.parts = { ...b.parts, [formFor(autoTpl, weekday(today)).fields.find((f) => !f.question).key]: legacy };
    return b;
  });
  const [status, setStatus] = useState(""); // "", "saving", "saved"
  const [mic, setMic] = useState({ key: null, interim: "" });
  const [micMsg, setMicMsg] = useState("");
  const [armed, setArmed] = useState(null); // 지우기 확인 — 한 번 누르면 "지우기?"로 바뀌고 두 번째에 지운다
  const micOk = supported();

  const form = useMemo(() => formFor(edit.template, weekday(today)), [edit.template, today]);
  const korean = edit.input_mode === "ko";
  const dirty = status !== "saved";

  // 오늘 기록 불러오기
  useEffect(() => {
    let alive = true;
    loadEntries(userId, today)
      .then((rows) => alive && setEntries(rows))
      .catch((e) => alive && (setEntries([]), onError(e.message)));
    return () => { alive = false; };
  }, [userId, today, onError]);

  // 임시 저장 — 저장된 기록을 그대로 보고 있을 때는 남기지 않는다
  useEffect(() => {
    if (status === "saved") return;
    const has = hasContent(form, edit.parts);
    saveDraft(today, has ? edit : null);
    if (has) clearLegacyDraft(today); // 새 임시 저장으로 옮겨졌다
  }, [edit, form, status, today]);

  // 화면을 떠나면 마이크를 끈다
  useEffect(() => () => stopListening(), []);

  const setPart = useCallback((key, value) => {
    setEdit((e) => ({ ...e, parts: { ...e.parts, [key]: value } }));
    setStatus("");
  }, []);

  // 🎤 — 확정 조각은 칸 끝에 붙이고, 잠정 조각은 칸 아래 회색으로만. 최신 값을 읽으려고 ref 를 쓴다.
  const partsRef = useRef(edit.parts);
  partsRef.current = edit.parts;
  const toggleMic = (key) => {
    if (mic.key === key) return stopListening();
    setMicMsg("");
    const lang = korean ? "ko-KR" : "de-DE";
    listen({
      lang,
      onFinal: (t) => setPart(key, appendSpoken(partsRef.current[key] || "", t, lang)),
      onInterim: (t) => setMic((m) => (m.key === key ? { ...m, interim: t } : m)),
      onState: (on) => setMic(on ? { key, interim: "" } : { key: null, interim: "" }),
      onError: setMicMsg,
    });
  };

  const switchTemplate = (template) => {
    stopListening();
    setEdit((e) => ({
      ...e,
      template,
      parts: template === "why" && !e.parts.q ? { ...e.parts, q: randomQuestion() } : e.parts,
    }));
    setStatus("");
  };

  const switchMode = (mode) => {
    stopListening();
    setEdit((e) => ({ ...e, input_mode: mode }));
    setStatus("");
  };

  const save = async () => {
    stopListening();
    setStatus("saving");
    try {
      const row = await saveEntry(userId, {
        ...edit,
        day: today,
        month_no: month,
        raw_text: composeText(form, edit.parts),
      });
      setEntries((list) => {
        const rest = (list || []).filter((r) => r.id !== row.id);
        return [...rest, row].sort((a, b) => a.created_at.localeCompare(b.created_at));
      });
      setEdit({ id: row.id, template: row.template, input_mode: row.input_mode, parts: row.parts });
      saveDraft(today, null);
      setStatus("saved");
      onPatch(today, { speak: true }); // 🟡 말하기 완료
    } catch (e) {
      setStatus("");
      onError("저장 실패: " + e.message + " — 글은 이 기기에 남아 있어요.");
    }
  };

  const openEntry = (row) => {
    stopListening();
    setEdit({ id: row.id, template: row.template, input_mode: row.input_mode, parts: row.parts || {} });
    setStatus("saved");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const newEntry = () => {
    stopListening();
    setEdit(blank(autoTpl, edit.input_mode));
    setStatus("");
  };

  const remove = async (row) => {
    if (armed !== row.id) {
      setArmed(row.id);
      setTimeout(() => setArmed((a) => (a === row.id ? null : a)), 3000);
      return;
    }
    setArmed(null);
    try {
      await deleteEntry(userId, row.id);
      setEntries((list) => list.filter((r) => r.id !== row.id));
      if (edit.id === row.id) newEntry();
    } catch (e) {
      onError("삭제 실패: " + e.message);
    }
  };

  const canSave = hasContent(form, edit.parts) && status !== "saving";

  // 지금 보고 있는 저장된 기록 (교정 결과가 여기 붙는다)
  const current = edit.id ? entries?.find((r) => r.id === edit.id) : null;
  const updateRow = (row) => setEntries((list) => (list || []).map((r) => (r.id === row.id ? row : r)));

  return (
    <div className="entry">
      <section className="tpl-card">
        <div className="tpl-kicker">
          {month}개월차 형식
          {mixed && edit.template === mixed && <span className="mix-badge">섞는 날</span>}
          {edit.id && <span className="edit-badge">{hhmm(entries?.find((r) => r.id === edit.id)?.created_at || new Date().toISOString())} 기록 고치는 중</span>}
        </div>
        <div className="tpl-title">{form.title}</div>
        <div className="tpl-hint">
          {mixed && edit.template === mixed
            ? "오늘은 지난 형식을 섞는 날 — 비슷한 것만 몰아서 하면 쉬워 보이기만 한다."
            : form.hint}
        </div>
        <div className="chips">
          {SWITCHABLE.map((t) => (
            <button
              key={t.key}
              className={`chip ${edit.template === t.key ? "on" : ""}`}
              onClick={() => switchTemplate(t.key)}
            >
              {t.label}
              {t.key === autoTpl && edit.template !== t.key ? " ·오늘" : ""}
            </button>
          ))}
        </div>
      </section>

      <div className="mode-row">
        <div className="seg" role="radiogroup" aria-label="입력 언어">
          <button role="radio" aria-checked={!korean} className={!korean ? "on" : ""} onClick={() => switchMode("de")}>
            🇩🇪 독일어
          </button>
          <button role="radio" aria-checked={korean} className={korean ? "on" : ""} onClick={() => switchMode("ko")}>
            🇰🇷 한국어로
          </button>
        </div>
        {!micOk && <span className="muted tiny">🎤 는 Chrome 에서 됩니다</span>}
      </div>
      {korean && (
        <div className="notice soft">
          <b>지친 날 모드.</b> 한국어로 적어 두면 교정 단계에서 AI가 핵심 단어만 먼저 주고, 독일어는 내가 말해 봅니다.
        </div>
      )}
      {micMsg && <div className="notice error" onClick={() => setMicMsg("")}>{micMsg}</div>}

      {!edit.id && <Revive userId={userId} today={today} onResult={(r) => setPart("revive", r)} />}

      {form.fields.map((f) => (
        <FieldInput
          key={`${edit.template}-${f.key}`}
          field={f}
          value={edit.parts[f.key] || ""}
          onChange={(v) => setPart(f.key, v)}
          carryText={f.carry ? edit.parts[f.carry] || "" : ""}
          listening={mic.key === f.key}
          interim={mic.key === f.key ? mic.interim : ""}
          onMic={() => toggleMic(f.key)}
          micOk={micOk && !f.question}
          korean={korean && !f.question}
          extra={
            f.question ? (
              <button type="button" className="fi-carry" onClick={() => setPart("q", randomQuestion(edit.parts.q))}>
                🎲 다른 질문
              </button>
            ) : null
          }
        />
      ))}

      <button className="btn primary wide" disabled={!canSave || !dirty} onClick={save}>
        {status === "saving" ? "저장 중…" : status === "saved" ? "저장됨 ✓" : edit.id ? "고친 내용 저장" : "저장"}
      </button>

      {current && status === "saved" ? (
        <Correction
          key={current.id}
          entry={current}
          userId={userId}
          month={month}
          tplTitle={formFor(current.template, weekday(today)).title}
          onEntry={updateRow}
          onPatchDay={(patch) => onPatch(today, patch)}
          onError={onError}
        />
      ) : (
        <p className="muted tiny cr-wait">저장하면 여기서 AI 교정을 받을 수 있어요.</p>
      )}

      {entries && entries.length > 0 && (
        <section className="today-list">
          <div className="today-list-head">
            <h2 className="sec-title">오늘 기록 {entries.length}</h2>
            {edit.id && (
              <button className="chip" onClick={newEntry}>
                ＋ 새 기록
              </button>
            )}
          </div>
          <ul>
            {entries.map((r) => (
              <li key={r.id} className={r.id === edit.id ? "on" : ""}>
                <button className="tl-open" onClick={() => openEntry(r)}>
                  <span className="tl-meta">
                    {hhmm(r.created_at)} · {formFor(r.template, weekday(today)).title}
                    {r.input_mode === "ko" && " · 한국어"}
                  </span>
                  <span className="tl-text">{(r.raw_text || "").replace(/^\[[^\]]+\]\s*/, "").split("\n")[0]}</span>
                </button>
                <button
                  className={`tl-del ${armed === r.id ? "armed" : ""}`}
                  aria-label="이 기록 지우기"
                  onClick={() => remove(r)}
                >
                  {armed === r.id ? "지우기?" : "✕"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
