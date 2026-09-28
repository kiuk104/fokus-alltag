// PWA 배선 — 서비스 워커를 언제 등록하고 언제 갈아끼울지.
//
// 워커 자체는 vite-plugin-pwa(Workbox)가 빌드할 때 만든다. 손으로 쓰지 않는 이유는
// 캐시 목록 때문이다: Vite 산출물은 index-a1b2c3.js 처럼 이름에 해시가 붙어 빌드마다 바뀌는데,
// 직접 쓴 워커는 그 목록을 알 수 없어 매번 사람이 맞춰줘야 한다. 한 번만 어긋나도
// "고쳤는데 반영이 안 되는" 버그가 되고, 원인을 찾기가 아주 어렵다.
//
// 홈 화면 설치는 브라우저 기본 메뉴에 맡긴다 — 앱 안에 설치 버튼을 두지 않는다.
// (Chrome 주소창의 설치 아이콘, iOS Safari의 공유 → 홈 화면에 추가)

import { registerSW } from "virtual:pwa-register";

let updateSW = null; // 대기 중인 새 버전으로 교체하는 함수

/** 서비스 워커 등록. 새 버전이 준비되면 onUpdateReady()가 불린다. */
export function registerServiceWorker(onUpdateReady) {
  // dev에서는 등록하지 않는다 (vite.config.js의 devOptions.enabled = false).
  // 이미 등록했으면 두 번 하지 않는다 — StrictMode에서 effect가 두 번 도는 경우 대비.
  if (!import.meta.env.PROD || updateSW) return;

  updateSW = registerSW({
    // 새 워커가 설치를 마치고 대기 중 — 사용자가 "새로고침"을 누를 때까지 기다린다.
    onNeedRefresh() {
      onUpdateReady?.();
    },
    onRegisterError() {
      /* 등록 실패해도 앱은 그냥 온라인 웹앱으로 돌아간다 */
    },
  });
}

/** 대기 중인 새 버전으로 교체하고 새로고침한다. */
export function applyUpdate() {
  if (updateSW) updateSW(true);
  else window.location.reload();
}
