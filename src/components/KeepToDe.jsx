// 외울 문장 → Fokus DE · 새 단어 → 내 단어 — 교정 5단계(Correction.jsx)와 지난 기록(EntryReview.jsx)이 같이 쓴다.
// 지난 기록에서 보내면 note 의 날짜는 **그 기록의 날짜**다(보낸 날이 아니라). 2026-10-13 Correction.jsx 에서 분리.

import { useEffect, useMemo, useState } from "react";
import { wordKey } from "../lib/correct";
import { loadSentenceTags, tagsFor, insertSentences, knownWordKeys, insertWord, NOTEBOOK } from "../lib/deWrite";
import { sentIds } from "../lib/entryRepo";
import { GRAMMAR } from "../lib/program";
import { DE_URL, KARTEN_URL, openApp } from "../lib/links";
import "../styles/correct.css";

const gTag = (key) => GRAMMAR.find((g) => g.key === key)?.tag || "";

// ── ⑤ 외울 3문장 → Fokus DE ─────────────────────────────────────────────────
export function StepKeep({ data, entry, prog, userId, month, onError, onSaved, onWords, past = false }) {
  const [rows, setRows] = useState(() => (prog.keepEdited || data.keep).map((k) => ({ ...k, on: k.on ?? true })));
  const [existing, setExisting] = useState([]);
  const [busy, setBusy] = useState(false);
  const ids = sentIds(entry);
  const saved = prog.saved && ids.length > 0;

  useEffect(() => {
    let alive = true;
    loadSentenceTags(userId).then((t) => alive && setExisting(t));
    return () => { alive = false; };
  }, [userId]);

  const tagged = useMemo(
    () => rows.map((k) => ({ ...k, ...tagsFor(k, { month, existing, grammarLabel: gTag(k.grammar) }) })),
    [rows, existing, month]
  );

  const set = (i, patch) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const send = async () => {
    const pick = tagged.filter((r) => r.on && r.de.trim());
    if (!pick.length) return;
    setBusy(true);
    try {
      const ids = await insertSentences(
        userId,
        pick.map((r) => ({ de: r.de, ko: r.ko, tags: r.tags, category: r.category, note: `Fokus Alltag · ${entry.day}` }))
      );
      onSaved(ids, rows);
    } catch (e) {
      onError("DE 저장 실패: " + e.message);
    } finally {
      setBusy(false);
    }
  };

  if (saved) {
    const first = ids[0];
    return (
      <div className="cr-body">
        <p className="cr-lead">✓ Fokus DE 단어장 <b>{NOTEBOOK}</b> 에 {ids.length}문장을 보냈어요.</p>
        <ul className="cr-keep done">
          {rows.filter((r) => r.on).map((r, i) => (
            <li key={i}><b lang="de">{r.de}</b><span>{r.ko}</span></li>
          ))}
        </ul>
        <div className="cr-links">
          {KARTEN_URL && <button className="link-btn" onClick={() => openApp(KARTEN_URL)}>외우기 <b>Karten</b> ↗</button>}
          <button className="link-btn" onClick={() => openApp(`${DE_URL}/?edit=${first}`)}>문장 보기 <b>Fokus DE</b> ↗</button>
        </div>
        {!past && <p className="muted tiny">오늘 🔴 3문장 꺼내기는 이 세 문장으로 — 한국어 뜻만 보고 독일어로 말해 보세요.</p>}
        <NewWords words={data.words} saved={prog.wordsSaved} userId={userId} month={month} onError={onError} onSaved={onWords} />
      </div>
    );
  }

  return (
    <div className="cr-body">
      <p className="cr-lead">{past ? "그날 보내지 않은 외울 문장이에요. 지금 보내도 돼요 — 고치고 싶으면 고친 뒤 보내세요." : "오늘 외울 문장이에요. 고치고 싶으면 고친 뒤 DE 로 보내세요."}</p>
      <ul className="cr-keep">
        {tagged.map((r, i) => (
          <li key={i} className={r.on ? "" : "off"}>
            <label className="cr-on"><input type="checkbox" checked={r.on} onChange={(e) => set(i, { on: e.target.checked })} /></label>
            <div className="cr-kfields">
              <textarea className="input" rows={2} lang="de" value={r.de} onChange={(e) => set(i, { de: e.target.value })} spellCheck={false} />
              <input className="input" value={r.ko} onChange={(e) => set(i, { ko: e.target.value })} />
              <div className="cr-tags">
                {r.tags.map((t) => <span key={t}>#{t}</span>)}
                {r.changed.length > 0 && <span className="muted tiny">기존 태그로 맞춤: {r.changed.join(", ")}</span>}
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className="cr-actions">
        <button className="btn primary" disabled={busy || !tagged.some((r) => r.on && r.de.trim())} onClick={send}>
          {busy ? "보내는 중…" : `Fokus DE 로 보내기 (${tagged.filter((r) => r.on).length})`}
        </button>
      </div>
      <NewWords words={data.words} saved={prog.wordsSaved} userId={userId} month={month} onError={onError} onSaved={onWords} />
    </div>
  );
}

// ── 새 단어 → Fokus DE 내 단어 (연결 지점 2) ────────────────────────────────
// DE 에 이미 있으면 버튼 대신 ✓. 옛 교정(단어 칸이 생기기 전)에는 아무것도 안 보인다.
export function NewWords({ words, saved = [], userId, month, onError, onSaved }) {
  const [known, setKnown] = useState(null);
  const [busy, setBusy] = useState("");
  const list = words || [];

  useEffect(() => {
    if (!list.length) return;
    let alive = true;
    knownWordKeys(userId).then((k) => alive && setKnown(k)).catch(() => alive && setKnown(new Set()));
    return () => { alive = false; };
  }, [userId, list.length]);

  if (!list.length) return null;

  const add = async (w) => {
    setBusy(w.de);
    try {
      await insertWord(userId, w, { month });
      setKnown((k) => new Set(k).add(wordKey(w.de)));
      onSaved([...saved, w.de]);
    } catch (e) {
      onError("단어 저장 실패: " + e.message);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="cr-words">
      <div className="cr-label">새 단어 <span className="muted">— 내 단어({NOTEBOOK})에 넣으면 DE·Karten 에서 외워요</span></div>
      <ul>
        {list.map((w) => {
          const have = saved.includes(w.de) || known?.has(wordKey(w.de));
          return (
            <li key={w.de}>
              <span lang="de"><b>{w.article ? `${w.article} ` : ""}{w.de}</b></span>
              <span className="muted">{w.ko}</span>
              {have ? (
                <span className="cr-have">{saved.includes(w.de) ? "✓ 넣음" : "✓ DE 에 있음"}</span>
              ) : (
                <button className="btn small" disabled={!known || !!busy} onClick={() => add(w)}>
                  {busy === w.de ? "…" : known ? "+ 내 단어" : "확인 중"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
