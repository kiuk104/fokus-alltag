// 지난 영상 — 자막을 붙여 둔 영상을 다시 골라 듣는다. 영상 하나를 며칠 두고 듣는 게 보통이라 "최신"만 열면 불편하다.
// 목록은 계정(alltag_captions)에서 온다. 열 때마다 새로 받는다(PC 에서 붙인 영상이 폰에 바로 보이게).

import { useEffect, useState } from "react";
import { listCaptionVideos } from "../lib/captionsRepo";

export default function PastVideos({ current, refreshKey, onPick }) {
  const [list, setList] = useState([]);

  useEffect(() => {
    let alive = true;
    listCaptionVideos().then((l) => alive && setList(l));
    return () => { alive = false; };
  }, [refreshKey]);

  if (list.length === 0) return null;
  return (
    <details className="lsn-paste">
      <summary>지난 영상 다시 듣기 · {list.length}개</summary>
      <div className="lsn-paste-body">
        {list.map((x) => (
          <button
            key={x.id}
            className={`lsn-past ${x.id === current ? "on" : ""}`}
            onClick={() => onPick(x.id)}
            aria-current={x.id === current}
          >
            <span className="lsn-past-t">{x.title || `영상 ${x.id}`}</span>
            <span className="muted tiny">{new Date(x.at).toLocaleDateString("ko-KR", { month: "long", day: "numeric" })}{x.id === current ? " · 지금" : ""}</span>
          </button>
        ))}
      </div>
    </details>
  );
}
