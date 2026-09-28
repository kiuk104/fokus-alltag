// 기록 칸 하나 — 글상자 + 🎤 + (있으면) 앞 칸 이어 쓰기 · 단어 수.
// 화면(Entry)은 칸 정의(lib/templates.js)를 넘기기만 하고, 칸 안의 일은 여기서 끝낸다.

import { wordCount } from "../lib/templates";

export default function FieldInput({
  field, value, onChange, carryText, listening, interim, onMic, micOk, korean, extra,
}) {
  const words = field.words ? wordCount(value) : null;
  const [lo, hi] = field.words || [];

  return (
    <div className={`fi ${listening ? "listening" : ""}`}>
      <div className="fi-head">
        <label className="fi-label" htmlFor={`fi-${field.key}`}>{field.label}</label>
        {extra}
        {field.carry && carryText && !value.trim() && (
          <button type="button" className="fi-carry" onClick={() => onChange(carryText)}>
            ↓ 앞 칸 가져와 늘리기
          </button>
        )}
      </div>
      {field.hint && <div className="fi-hint">{field.hint}</div>}
      <div className="fi-box">
        <textarea
          id={`fi-${field.key}`}
          className="input fi-area"
          rows={field.rows || 2}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={korean ? "" : field.placeholder}
          lang={korean ? "ko" : "de"}
          spellCheck={false}
          autoCapitalize="sentences"
        />
        {micOk && (
          <button
            type="button"
            className={`mic ${listening ? "on" : ""}`}
            onClick={onMic}
            aria-pressed={listening}
            aria-label={listening ? "듣기 멈추기" : "말해서 입력"}
          >
            {listening ? "■" : "🎤"}
          </button>
        )}
      </div>
      {listening && (
        <div className="fi-interim">{interim || (korean ? "듣는 중… 한국어로 말하세요" : "듣는 중… Sprich jetzt")}</div>
      )}
      {words != null && (
        <div className={`fi-words ${words >= lo && words <= hi ? "ok" : ""}`}>
          {words}단어 · 목표 {lo}~{hi}
        </div>
      )}
    </div>
  );
}
