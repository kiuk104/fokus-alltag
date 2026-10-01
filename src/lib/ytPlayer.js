// YouTube IFrame Player API 불러오기 — 한 번만 받고 모두가 같은 약속(Promise)을 쓴다.
// 영상을 앱이 직접 조작(문장으로 이동 · 반복 · 속도)하려면 공식 플레이어 API 가 필요하다.
// 영상 파일을 내려받지 않는다 — 유튜브 임베드 안에서만 틀고, 시각 이동만 건다.

let loading = null;

export function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    s.onerror = () => {
      loading = null; // 다음에 다시 시도할 수 있게
      reject(new Error("유튜브 플레이어를 불러오지 못했어요. 인터넷 연결을 확인해 주세요."));
    };
    document.head.appendChild(s);
  });
  return loading;
}
