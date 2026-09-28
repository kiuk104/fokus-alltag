// 아래 탭 세 개. 엄지가 닿는 자리에 둔다 — 배송 중에 한 손으로 여는 앱이다.
// 설정은 탭이 아니라 머리줄 ⚙ 에 있다. 매일 가는 곳이 아니다.

const TABS = [
  { id: "today", label: "오늘", icon: "☀" },
  { id: "entry", label: "기록", icon: "✎" },
  { id: "progress", label: "진도", icon: "▲" },
];

export default function TabBar({ tab, onTab }) {
  return (
    <nav className="tabbar" role="tablist">
      {TABS.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={tab === t.id}
          className={`tab ${tab === t.id ? "on" : ""}`}
          onClick={() => onTab(t.id)}
        >
          <span className="tab-icon" aria-hidden>{t.icon}</span>
          <span className="tab-label">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
