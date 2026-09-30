// AI 교정 — 단계별 공개 (기획서 0-2절 "정답은 시도한 뒤에만 연다").
//
//   ① 스스로 고치기   틀린 위치·유형·힌트만 → 내가 고쳐 쓴다   (한국어로 쓴 날: 핵심 단어 5개 → 내가 독일어로)
//   ② B1 교정 공개    고친 표현과 이유, 내가 맞게 고친 곳 ✓
//   ③ B2 · 원어민     (선택) 내가 먼저 B2로 올려 본 뒤 공개
//   ④ 자기 설명       문법 하나를 내 말로 한 줄 → AI 가 확인 (Haiku, 짧게)
//   ⑤ 외울 3문장      고쳐서 Fokus DE 로 보내기 (단어장 "Alltag")
//
// AI 호출은 교정 1회 + 자기 설명 확인 1회. 결과와 진행 상태는 alltag_entries.correction 에 저장되어
// 앱을 닫았다 열어도 이어서 한다. 상한에 닿으면 "교정 요청 복사"(Claude 앱)로 돌아간다.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { askClaude, MONTHLY_CAP } from "../lib/ai";
import { SYSTEM, correctionPrompt, explainPrompt, extractJson, normalizeCorrection, normalizeExplain, markFixes, selfFixed, levelUpPrompt, normalizeLevelUp, wordKey } from "../lib/correct";
import { loadSentenceTags, tagsFor, insertSentences, knownWordKeys, insertWord, NOTEBOOK } from "../lib/deWrite";
import { patchEntry, sentIds } from "../lib/entryRepo";
import { buildPrompt } from "../lib/bridge";
import { GRAMMAR } from "../lib/program";
import { DE_URL, KARTEN_URL, openApp } from "../lib/links";
import TandemCompare from "./TandemCompare";
import "../styles/correct.css";

const STEPS = ["스스로 고치기", "B1 교정", "B2 · 원어민", "내 말로 설명", "외울 3문장"];
const gLabel = (key) => GRAMMAR.find((g) => g.key === key)?.label || key;
const gTag = (key) => GRAMMAR.find((g) => g.key === key)?.tag || "";
// 칸 이름 [Level 1] 은 교정할 때 방해가 되니 떼고 보여 준다
const plain = (t) => String(t || "").replace(/^\[[^\]]+\]\s*/gm, "");

export default function Correction({ entry, userId, month, tplTitle, onEntry, onPatchDay, onError }) {
  const c = entry.correction;
  const korean = entry.input_mode === "ko";
  const [busy, setBusy] = useState("");
  const [capMsg, setCapMsg] = useState("");
  const [copied, setCopied] = useState(false);

  const stale = c && c.forText !== entry.raw_text;
  const prog = c?.progress || { step: 0 };
  const data = c?.data;

  // 진행 상태 저장 (단계를 넘길 때마다) — 실패해도 화면은 계속 간다
  const save = async (nextProg, extra = {}) => {
    const correction = { ...c, progress: { ...prog, ...nextProg } };
    onEntry({ ...entry, correction, ...extra });
    try {
      onEntry(await patchEntry(userId, entry.id, { correction, ...extra }));
    } catch (e) {
      onError("진행 저장 실패: " + e.message);
    }
  };

  const run = async () => {
    setBusy("교정 받는 중…");
    setCapMsg("");
    try {
      const prompt = correctionPrompt({ text: entry.raw_text, month, tplTitle, korean });
      const ask = (extra, maxTokens) => askClaude(userId, { system: SYSTEM, prompt: prompt + extra, maxTokens, kind: "alltag-correct" });
      // 응답이 잘리거나(max_tokens) JSON 이 아닌 말로 오면 한 번만 다시 — 더 길게, JSON 만 달라고 못 박아서
      let r = await ask("", 4000);
      let raw;
      try {
        raw = extractJson(r.text);
      } catch {
        r = await ask("\n\n⚠ 반드시 JSON 객체 하나만 출력하라. 설명·인사·마크다운 금지. 학습자 글에 한국어가 섞여 있어도 독일어 부분만 교정하고 JSON 으로 답하라.", 6000);
        try {
          raw = extractJson(r.text);
        } catch {
          const why = r.stop === "max_tokens" ? "응답이 너무 길어 잘렸어요" : r.stop === "refusal" ? "AI 가 답을 거절했어요" : `AI 가 JSON 대신 다른 말을 했어요 (${r.stop || "?"})`;
          throw new Error(`${why} — “${String(r.text || "(빈 응답)").slice(0, 80)}…”`);
        }
      }
      const d = normalizeCorrection(raw, { text: entry.raw_text });
      const correction = { data: d, model: r.model, saving: r.saving, spent: r.spent, at: new Date().toISOString(), forText: entry.raw_text, progress: { step: 0 } };
      onEntry(await patchEntry(userId, entry.id, { correction }));
      onPatchDay({ correct: true }); // 🔵 교정 완료
    } catch (e) {
      if (e.capped) setCapMsg(e.message);
      else onError("교정 실패: " + e.message);
    } finally {
      setBusy("");
    }
  };

  // B2 · 원어민 글이 비어 왔으면 그 둘만 다시 받는다 (교정 전체를 다시 하지 않는다)
  const fillB2 = async () => {
    setBusy("B2 문장 받는 중…");
    try {
      const r = await askClaude(userId, {
        system: SYSTEM,
        prompt: levelUpPrompt({ b1: c.data.b1.text || plain(entry.raw_text) }),
        maxTokens: 800,
        kind: "alltag-correct",
      });
      const got = normalizeLevelUp(extractJson(r.text));
      if (!got.b2 && !got.native) throw new Error("빈 응답");
      const correction = { ...c, data: { ...c.data, b2: c.data.b2 || got.b2, native: c.data.native || got.native }, spent: r.spent };
      onEntry({ ...entry, correction });
      onEntry(await patchEntry(userId, entry.id, { correction }));
    } catch (e) {
      onError(e.capped ? e.message : "B2 문장을 받지 못했어요: " + e.message);
    } finally {
      setBusy("");
    }
  };

  const copyBridge = async () => {
    try {
      await navigator.clipboard.writeText(buildPrompt({ text: entry.raw_text, month, tplTitle, korean }));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onError("복사하지 못했어요.");
    }
  };

  // ── 아직 교정 전 ──
  if (!c || stale) {
    return (
      <section className="cr">
        <div className="cr-start">
          <div>
            <b>AI 교정</b>
            <div className="muted tiny">
              {stale ? "글을 고쳤어요 — 새 글로 다시 교정받을 수 있어요." : "틀린 곳을 먼저 스스로 고쳐 보고, 그다음 정답을 엽니다."}
            </div>
          </div>
          <button className="btn primary" disabled={!!busy} onClick={run}>
            {busy || (stale ? "다시 교정" : "교정 받기")}
          </button>
        </div>
        {capMsg && (
          <div className="notice soft">
            <b>{capMsg}</b> 그동안은 Claude 앱으로:
            <button className="btn small cr-copy" onClick={copyBridge}>{copied ? "복사됨" : "교정 요청 복사"}</button>
          </div>
        )}
      </section>
    );
  }

  const step = prog.step || 0;
  const go = (n, extra) => save({ step: Math.max(step, n), view: n, ...extra });
  const view = prog.view ?? step;

  return (
    <section className="cr">
      <div className="cr-head">
        <b>AI 교정</b>
        {c.saving && <span className="cr-save">절약 모드</span>}
        <span className="muted tiny cr-cost">이번 달 ${(c.spent || 0).toFixed(2)} / ${MONTHLY_CAP}</span>
        {/* 결과가 마음에 안 들면 다시 — DE 로 보내기 전까지만 (보낸 뒤 바꾸면 보낸 문장과 어긋난다) */}
        {!prog.saved && (
          <button className="btn small cr-redo" disabled={!!busy} onClick={run} title="같은 글로 교정을 새로 받습니다">
            {busy || "↻ 다시 교정"}
          </button>
        )}
      </div>
      <ol className="cr-steps">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              className={`${i === view ? "now" : ""} ${i < step || (i === 4 && prog.saved) ? "done" : ""}`}
              disabled={i > step}
              onClick={() => save({ view: i })}
            >
              <i>{i + 1}</i>
              <span>{s}</span>
            </button>
          </li>
        ))}
      </ol>

      {view === 0 && <StepSelf data={data} text={entry.raw_text} korean={korean} prog={prog} onDone={(mine) => go(1, { mine })} />}
      {view === 1 && <StepB1 data={data} korean={korean} prog={prog} onNext={() => go(2)} />}
      {view === 2 && <StepB2 data={data} prog={prog} busy={busy} onFill={fillB2} onNext={(myB2) => go(3, { myB2 })} />}
      {view === 3 && (
        <StepExplain data={data} prog={prog} userId={userId} busy={busy} setBusy={setBusy} onError={onError}
          onDone={(explain) => go(4, explain ? { explain } : {})} />
      )}
      {view === 4 && (
        <StepKeep data={data} entry={entry} prog={prog} userId={userId} month={month} onError={onError}
          onSaved={(ids, keepEdited) => save({ step: 4, view: 4, saved: true, keepEdited, sentIds: ids })}
          onWords={(wordsSaved) => save({ wordsSaved })} />
      )}
    </section>
  );
}

// ── ① 스스로 고치기 ─────────────────────────────────────────────────────────
function StepSelf({ data, text, korean, prog, onDone }) {
  const [mine, setMine] = useState(prog.mine ?? (korean ? "" : plain(text)));
  const fixes = data.b1.fixes;

  if (korean) {
    return (
      <div className="cr-body">
        <p className="cr-lead">이 단어들로 오늘 일을 <b>독일어로</b> 말하거나 써 보세요. 정답은 다음 단계에서.</p>
        <div className="cr-kw">
          {data.keywords.map((w) => (
            <span key={w.de}><b lang="de">{w.de}</b> {w.ko}</span>
          ))}
        </div>
        <textarea className="input area" rows={5} value={mine} onChange={(e) => setMine(e.target.value)} lang="de" placeholder="Heute …" spellCheck={false} />
        <div className="cr-actions">
          <button className="btn" onClick={() => onDone("")}>건너뛰기</button>
          <button className="btn primary" disabled={!mine.trim()} onClick={() => onDone(mine.trim())}>써 봤어요 → 정답</button>
        </div>
      </div>
    );
  }

  if (!fixes.length) {
    return (
      <div className="cr-body">
        <p className="cr-lead">틀린 곳이 없어요. 👏 다음 단계에서 더 자연스러운 표현을 볼 수 있어요.</p>
        <div className="cr-actions"><button className="btn primary" onClick={() => onDone("")}>다음</button></div>
      </div>
    );
  }

  // 틀린 부분이 글에서 사라졌으면 "손댐" — 정답인지는 다음 단계에서 공개한다
  const touched = (f) => (f.found ? !mine.includes(f.from) : selfFixed(mine, f));
  const left = fixes.filter((f) => !touched(f)).length;
  return (
    <div className="cr-body">
      <p className="cr-lead">
        밑줄 친 곳을 <b>바로 눌러서 고쳐</b> 보세요. 고친 곳은 밑줄이 사라져요.
      </p>
      <MarkedEditor value={mine} onChange={setMine} fixes={fixes} />
      <ol className="cr-hints">
        {fixes.map((f, i) => (
          <li key={i} className={touched(f) ? "done" : ""}>
            <b>{touched(f) ? "✓" : i + 1}</b> <span className="cr-type">{f.type || "고칠 곳"}</span> {f.hint}
            {!f.found && <span className="muted tiny"> · “{f.from}”</span>}
          </li>
        ))}
      </ol>
      <div className="cr-actions">
        {mine !== plain(text) && (
          <button className="btn" onClick={() => setMine(plain(text))}>처음 글로</button>
        )}
        <button className="btn" onClick={() => onDone("")}>건너뛰기</button>
        <button className="btn primary" onClick={() => onDone(mine.trim())}>
          {left ? `고쳤어요 → 정답 (${fixes.length - left}/${fixes.length})` : "다 고쳤어요 → 정답"}
        </button>
      </div>
    </div>
  );
}

// 밑줄이 보이는 입력 칸. 투명한 textarea 뒤에 같은 글자를 같은 자리에 깔고(글자는 투명),
// 거기에 물결 밑줄만 보이게 한다. 글자 크기·줄 간격·여백·줄바꿈 규칙이 두 겹에서 똑같아야 한다(correct.css .cr-ed).
function MarkedEditor({ value, onChange, fixes }) {
  const ta = useRef(null);
  const back = useRef(null);
  const parts = markFixes(value, fixes);

  // 글 길이에 맞춰 높이를 늘린다 — 칸 안에서 스크롤되면 밑줄 층과 어긋나기 쉽다
  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + 2 + "px";
  }, [value]);

  const sync = () => {
    if (back.current && ta.current) back.current.scrollTop = ta.current.scrollTop;
  };

  return (
    <div className="cr-ed">
      <div className="cr-ed-back" ref={back} aria-hidden="true">
        {parts.map((p, i) => (p.fix == null ? <span key={i}>{p.t}</span> : <u key={i} data-n={p.fix + 1}>{p.t}</u>))}
        {"\n "}
      </div>
      <textarea
        ref={ta}
        className="cr-ed-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={sync}
        lang="de"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        aria-label="고쳐 쓸 글"
      />
    </div>
  );
}

// ── ② B1 교정 ───────────────────────────────────────────────────────────────
function StepB1({ data, korean, prog, onNext }) {
  const fixes = data.b1.fixes;
  const mine = prog.mine || "";
  const got = korean ? 0 : fixes.filter((f) => selfFixed(mine, f)).length;
  return (
    <div className="cr-body">
      <div className="cr-label">자연스러운 B1</div>
      <p className="cr-text" lang="de">{data.b1.text}</p>
      {korean && mine && <TandemCompare line={mine} script={[{ h: "", p: data.b1.text }]} words={[]} />}
      {!korean && fixes.length > 0 && (
        <>
          <div className="cr-label">
            고친 곳 {mine && <span className="cr-got">스스로 고친 것 {got} / {fixes.length}</span>}
          </div>
          <ul className="cr-fixes">
            {fixes.map((f, i) => {
              const ok = mine && selfFixed(mine, f);
              return (
                <li key={i} className={ok ? "ok" : ""}>
                  <span lang="de"><s>{f.from}</s> → <b>{f.to}</b></span>
                  {ok && <span className="cr-ok">✓ 직접 고침</span>}
                  {f.why && <div className="muted tiny">{f.why}</div>}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {data.errorTypes.length > 0 && <div className="muted tiny">오늘 틀린 유형: {data.errorTypes.join(" · ")}</div>}
      <div className="cr-actions"><button className="btn primary" onClick={onNext}>다음: B2 로 올리기</button></div>
    </div>
  );
}

// ── ③ B2 · 원어민 ───────────────────────────────────────────────────────────
function StepB2({ data, prog, busy, onFill, onNext }) {
  const [mine, setMine] = useState(prog.myB2 || "");
  const [shown, setShown] = useState(prog.step > 2);
  return (
    <div className="cr-body">
      {!shown ? (
        <>
          <p className="cr-lead">B1 문장을 <b>B2 로</b> 한 단계 올려 보세요 — weil · obwohl · Passiv · Konjunktiv II … (선택)</p>
          <textarea className="input area" rows={4} value={mine} onChange={(e) => setMine(e.target.value)} lang="de" spellCheck={false} placeholder="…" />
          <div className="cr-actions"><button className="btn primary" onClick={() => setShown(true)}>{mine.trim() ? "써 봤어요 → B2 보기" : "그냥 보기"}</button></div>
        </>
      ) : (
        <>
          {mine.trim() && (
            <>
              <div className="cr-label">내가 올린 B2</div>
              <p className="cr-text mine" lang="de">{mine}</p>
            </>
          )}
          {data.b2 || data.native ? (
            <>
              {data.b2 && (
                <>
                  <div className="cr-label">B2</div>
                  <p className="cr-text" lang="de">{data.b2}</p>
                </>
              )}
              {data.native && (
                <>
                  <div className="cr-label">원어민이라면</div>
                  <p className="cr-text native" lang="de">{data.native}</p>
                </>
              )}
            </>
          ) : (
            <div className="notice soft cr-missing">
              이번 교정에 B2 문장이 빠져 있어요.
              <button className="btn small" disabled={!!busy} onClick={onFill}>{busy || "B2 문장 받기"}</button>
            </div>
          )}
          <div className="cr-actions"><button className="btn primary" onClick={() => onNext(mine.trim())}>다음: 내 말로 설명</button></div>
        </>
      )}
    </div>
  );
}

// ── ④ 자기 설명 ─────────────────────────────────────────────────────────────
function StepExplain({ data, prog, userId, busy, setBusy, onError, onDone }) {
  const g = data.grammar[0];
  const example = data.keep.find((k) => k.grammar === g?.key)?.de || data.b2 || data.b1.text;
  const [mine, setMine] = useState(prog.explain?.mine || "");
  const [res, setRes] = useState(prog.explain?.res || null);

  if (!g) {
    return (
      <div className="cr-body">
        <p className="cr-lead">오늘 글에서는 따로 짚을 문법이 없었어요.</p>
        <div className="cr-actions"><button className="btn primary" onClick={() => onDone(null)}>다음</button></div>
      </div>
    );
  }

  const check = async () => {
    setBusy("확인 중…");
    try {
      const r = await askClaude(userId, {
        system: SYSTEM,
        prompt: explainPrompt({ grammarLabel: gLabel(g.key), sentence: example, mine }),
        maxTokens: 400,
        kind: "alltag-explain",
        main: false,
      });
      setRes(normalizeExplain(extractJson(r.text)));
    } catch (e) {
      onError(e.capped ? e.message : "확인 실패: " + e.message);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="cr-body">
      <div className="cr-label">{gLabel(g.key)}</div>
      <p className="cr-text" lang="de">{example}</p>
      <p className="cr-lead">이 문장에서 <b>{gLabel(g.key)}</b> 는 왜 이렇게 쓰였을까요? 한 줄로 (한국어 OK)</p>
      <textarea className="input" rows={2} value={mine} onChange={(e) => { setMine(e.target.value); setRes(null); }} placeholder="예: weil 뒤에서는 동사가 문장 끝으로 간다" />
      {res && (
        <div className={`cr-verdict ${res.ok ? "ok" : ""}`}>
          <b>{res.ok ? "맞아요" : "조금 달라요"}</b> {res.add}
          {g.note && <div className="muted tiny">정리: {g.note}</div>}
        </div>
      )}
      <div className="cr-actions">
        <button className="btn" onClick={() => onDone(null)}>건너뛰기</button>
        {!res ? (
          <button className="btn primary" disabled={!mine.trim() || !!busy} onClick={check}>{busy || "확인받기"}</button>
        ) : (
          <button className="btn primary" onClick={() => onDone({ mine, res })}>다음: 외울 3문장</button>
        )}
      </div>
    </div>
  );
}

// ── ⑤ 외울 3문장 → Fokus DE ─────────────────────────────────────────────────
function StepKeep({ data, entry, prog, userId, month, onError, onSaved, onWords }) {
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
        <p className="muted tiny">오늘 🔴 3문장 꺼내기는 이 세 문장으로 — 한국어 뜻만 보고 독일어로 말해 보세요.</p>
        <NewWords words={data.words} saved={prog.wordsSaved} userId={userId} month={month} onError={onError} onSaved={onWords} />
      </div>
    );
  }

  return (
    <div className="cr-body">
      <p className="cr-lead">오늘 외울 문장이에요. 고치고 싶으면 고친 뒤 DE 로 보내세요.</p>
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
function NewWords({ words, saved = [], userId, month, onError, onSaved }) {
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
