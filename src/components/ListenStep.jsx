// 🟢 듣기 칸 — 오늘 들을 곳을 열고, 들은 내용을 독일어 한 줄로 남긴다.
//
// 한 줄 요약이 있는 이유: 틀어 놓기만 하면 "들었다"는 느낌만 남는다(수행). 들은 것을 한 줄로 꺼내야
// 실제로 무엇을 알아들었는지가 드러난다(인출, 기획서 0-2절). 한 줄을 저장하면 듣기 칸이 저절로 켜진다.
// 한 줄은 alltag_days.note 에 들어간다.

import { useEffect, useState } from "react";
import { openApp } from "../lib/links";
import { IN_APP } from "../lib/listenApi";
import { useT } from "../strings/useT";

export default function ListenStep({ source, row, skipped, onToggle, onPatch, onOpenInApp }) {
  const t = useT();
  const on = !!row.listen;
  const [line, setLine] = useState(row.note || "");
  const [open, setOpen] = useState(false); // 한 줄 칸은 열어 본 뒤에만 펼친다 — 처음부터 칸이 있으면 부담스럽다
  const saved = (row.note || "") === line.trim() && !!line.trim();

  // 하루 기록이 늦게 불러와지면(앱을 막 열었을 때) 저장된 한 줄로 채운다 — 치고 있던 글은 덮지 않는다
  useEffect(() => {
    if (row.note) setLine((cur) => cur || row.note);
  }, [row.note]);

  // 앱 안에서 틀 수 있는 출처는 듣기 화면으로, 내 링크는 새 탭으로
  const inApp = source && IN_APP.has(source.id);
  const go = () => {
    if (inApp) return onOpenInApp();
    if (source) openApp(source.url);
    setOpen(true);
  };

  const save = () => {
    const text = line.trim();
    if (!text) return;
    onPatch({ note: text, listen: true });
  };

  return (
    <li className={`step listen ${on ? "done" : ""} ${skipped ? "skip" : ""}`}>
      <div className="listen-top">
        <button className="step-check" onClick={onToggle} aria-pressed={on} aria-label={t("today.check", { title: t("today.step.listen.title") })}>
          <span className="dot g">{on ? "✓" : ""}</span>
        </button>
        <div className="step-body" onClick={() => setOpen((o) => !o)}>
          <div className="step-title">
            {t("today.step.listen.title")} <span className="step-min">{t("today.step.listen.min")}</span>
            {skipped && <span className="step-min">{t("today.skipped")}</span>}
          </div>
          {source ? (
            <div className="step-desc">
              <b className="listen-name">{source.name}</b> <span className="listen-lv">{source.level}</span>
              <br />
              {source.how}
            </div>
          ) : (
            <div className="step-desc">{t("today.listen.sunday")}</div>
          )}
        </div>
        {source && (
          <button className="btn small" onClick={go}>
            {inApp ? t("today.listen.play") : t("today.listen.open")}
          </button>
        )}
      </div>

      {((open && !inApp) || row.note) && (
        <div className="listen-line">
          <input
            className="input"
            value={line}
            onChange={(e) => setLine(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder={t("today.listen.line")}
            lang="de"
            spellCheck={false}
          />
          <button className="btn small" disabled={!line.trim() || saved} onClick={save}>
            {saved ? "✓" : t("today.listen.save")}
          </button>
        </div>
      )}
    </li>
  );
}
