// 아래 탭 세 개. 엄지가 닿는 자리에 둔다 — 배송 중에 한 손으로 여는 앱이다.
// 설정은 탭이 아니라 머리줄 ⚙ 에 있다. 매일 가는 곳이 아니다.

import { useT } from "../strings/useT";

// 이름은 strings 의 "tab.<id>"
const TABS = [
  { id: "today", icon: "☀" },
  { id: "entry", icon: "✎" },
  { id: "progress", icon: "▲" },
];

export default function TabBar({ tab, onTab }) {
  const t = useT();
  return (
    <nav className="tabbar" role="tablist">
      {TABS.map((tb) => (
        <button
          key={tb.id}
          role="tab"
          aria-selected={tab === tb.id}
          className={`tab ${tab === tb.id ? "on" : ""}`}
          onClick={() => onTab(tb.id)}
        >
          <span className="tab-icon" aria-hidden>{tb.icon}</span>
          <span className="tab-label">{t(`tab.${tb.id}`)}</span>
        </button>
      ))}
    </nav>
  );
}
