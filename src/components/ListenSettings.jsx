// 설정 시트의 "듣기" 부분 — 요일별로 어디를 들을지, 내 링크 하나.
// "기본"으로 두면 lib/listening.js 의 순환표를 따른다(1~2개월은 쉬운 쪽, 3개월부터 원어민 속도 뉴스).

import { useState } from "react";
import { SOURCES, DOW_SHORT, defaultRotation, looksLikeUrl } from "../lib/listening";

export default function ListenSettings({ program, month, onSave }) {
  const listen = program.settings?.listen || {};
  const [rotation, setRotation] = useState(listen.rotation || {});
  const [cName, setCName] = useState(listen.custom?.name || "");
  const [cUrl, setCUrl] = useState(listen.custom?.url || "");
  const [msg, setMsg] = useState("");

  const base = defaultRotation(month);
  const urlOk = !cUrl.trim() || looksLikeUrl(cUrl);

  const save = async () => {
    const clean = Object.fromEntries(Object.entries(rotation).filter(([, v]) => v));
    const custom = cUrl.trim() ? { name: cName.trim() || "내 링크", url: cUrl.trim() } : undefined;
    // 내 링크를 지웠는데 요일에 "custom" 이 남아 있으면 기본으로 되돌린다
    for (const k of Object.keys(clean)) if (clean[k] === "custom" && !custom) delete clean[k];
    await onSave({ ...program.settings, listen: { rotation: clean, ...(custom ? { custom } : {}) } });
    setMsg("저장됨 ✓");
    setTimeout(() => setMsg(""), 1500);
  };

  return (
    <div className="ls">
      <div className="ls-grid">
        {[1, 2, 3, 4, 5, 6].map((wd) => (
          <label key={wd} className="ls-row">
            <span className="ls-dow">{DOW_SHORT[wd]}</span>
            <select
              className="input ls-sel"
              value={rotation[wd] || ""}
              onChange={(e) => setRotation((r) => ({ ...r, [wd]: e.target.value }))}
            >
              <option value="">기본 · {SOURCES[base[wd]].name}</option>
              {Object.entries(SOURCES).map(([id, s]) => (
                <option key={id} value={id}>{s.name} ({s.level})</option>
              ))}
              {cUrl.trim() && urlOk && <option value="custom">{cName.trim() || "내 링크"}</option>}
            </select>
          </label>
        ))}
      </div>

      <div className="ls-custom">
        <input className="input" value={cName} onChange={(e) => setCName(e.target.value)} placeholder="내 링크 이름 (예: Deutschlandfunk Nova)" />
        <input
          className="input"
          value={cUrl}
          onChange={(e) => setCUrl(e.target.value)}
          placeholder="https://…"
          inputMode="url"
          autoCapitalize="none"
        />
        {!urlOk && <p className="tiny ls-bad">https:// 로 시작하는 주소를 넣어 주세요.</p>}
      </div>

      <div className="row">
        <span className="muted tiny grow">{msg || "요일마다 다른 곳을 들으면 한 가지 목소리에만 익숙해지지 않아요."}</span>
        <button className="btn" disabled={!urlOk} onClick={save}>저장</button>
      </div>
    </div>
  );
}
