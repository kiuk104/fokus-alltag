// 자막 붙여넣기 — 유튜브 "스크립트 표시"를 복사해 붙이면 문장 이동·반복이 켜진다.
// 서버가 유튜브 자막을 직접 받을 수 없어서(봇 확인) 사용자가 한 번 붙여넣는다. 영상마다 한 번, 이 기기에 저장된다.
// 접어 두는 이유: 붙여넣는 순간 원고가 보이므로, 원고 없이 듣는 1단계가 끝난 뒤나 다음 영상 준비 때 쓰도록.

import { useState } from "react";
import { parseCaptionText } from "../lib/captions";

export default function CaptionPaste({ count, onSave, onClear }) {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");

  const run = () => {
    const s = parseCaptionText(text);
    if (s.length < 2) {
      setMsg("시각이 들어 있는 스크립트를 찾지 못했어요. '0:05' 같은 시각 줄이 함께 복사됐는지 확인해 주세요.");
      return;
    }
    onSave(s);
    setText("");
    setMsg(`문장 ${s.length}개로 나눴어요.`);
  };

  return (
    <details className="lsn-paste">
      <summary>{count > 0 ? `✓ 문장 이동 켜짐 · ${count}문장` : "문장 이동 켜기 · 자막 붙여넣기"}</summary>
      <div className="lsn-paste-body">
        <ol className="muted tiny">
          <li>유튜브 영상 설명란 아래 <b>스크립트 표시</b>를 누릅니다 (폰은 영상 제목 아래 더보기).</li>
          <li>목록을 모두 복사해서(시각이 함께 복사돼야 해요) 아래에 붙여넣습니다.</li>
          <li>이 영상은 이 기기에 저장돼서 다음부터는 다시 붙이지 않아도 돼요.</li>
        </ol>
        <textarea
          className="input"
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"0:00\nHallo und willkommen …\n0:03\n…"}
          lang="de"
          spellCheck={false}
        />
        <div className="lsn-paste-row">
          <button className="btn small" disabled={!text.trim()} onClick={run}>문장으로 나누기</button>
          {count > 0 && (
            <button className="btn small" onClick={() => { onClear(); setMsg("지웠어요."); }}>지우기</button>
          )}
        </div>
        {msg && <p className="muted tiny">{msg}</p>}
      </div>
    </details>
  );
}
