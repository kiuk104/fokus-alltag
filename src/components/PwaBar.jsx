// PWA 알림 줄 — 새 버전 · 오프라인.
//
// 둘 다 "지금 당장 학습을 막지는 않는" 정보라서 화면 위쪽에 얇게만 둔다.
// 한 번에 하나만 보여준다 — 알림이 겹치면 둘 다 안 읽힌다.
//
// 홈 화면 설치 버튼은 일부러 없다. 브라우저가 이미 그 UI를 갖고 있고
// (Chrome 주소창의 설치 아이콘, iOS Safari 공유 시트), 앱 안에 하나 더 두면
// 학습 화면으로 가는 길에 배너만 늘어난다.

import { applyUpdate } from "../lib/pwa";

export default function PwaBar({ state }) {
  const { updateReady, offline } = state;

  if (updateReady) {
    return (
      <div className="pwa-bar update">
        <span>새 버전이 준비됐습니다.</span>
        <button className="pwa-go" onClick={applyUpdate}>
          새로고침
        </button>
      </div>
    );
  }

  if (offline) {
    return (
      <div className="pwa-bar offline">
        <span>오프라인: 카드를 새로 불러오거나 저장할 수 없습니다.</span>
      </div>
    );
  }

  return null;
}
