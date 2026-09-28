// /api/listen 호출 — 같은 날 같은 출처는 한 번만 받는다(세션 캐시).
// 앱을 닫았다 열면 다시 받는다: 뉴스는 하루에도 새 편이 올라오고, 서버(Vercel)가 30분 캐시를 이미 한다.

const key = (src, item, day) => `fa-listen-${day}-${src}-${item || ""}`;

export async function fetchListen(src, { item, day }) {
  const k = key(src, item, day);
  try {
    const hit = sessionStorage.getItem(k);
    if (hit) return JSON.parse(hit);
  } catch {
    /* 캐시 없이 간다 */
  }
  const q = new URLSearchParams({ src });
  if (item) q.set("item", item);
  const r = await fetch(`/api/listen?${q}`);
  let data;
  try {
    data = await r.json();
  } catch {
    throw new Error(r.ok ? "응답을 읽지 못했어요" : `서버 오류 ${r.status}`);
  }
  if (!r.ok) throw new Error(data?.error || `서버 오류 ${r.status}`);
  try {
    sessionStorage.setItem(k, JSON.stringify(data));
  } catch {
    /* 무시 */
  }
  return data;
}

/** 앱 안에서 틀 수 있는 출처인가 (내 링크는 밖으로 연다) */
export const IN_APP = new Set(["leicht", "dw", "tagesschau", "easy"]);

export const fmtTime = (s) => {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};
