# Fokus Alltag 아이콘 (2026-09-30)

## 결정
**C 테라코타 · 해** — 배경 `#8a3f1c`, 흰 F `#f3ede2`, 해 `#f0c05a`.
Alltag = "하루"라서 해. 다른 Fokus 앱과 폰 홈 화면에서 한눈에 구분되게 배경색을 겹치지 않게 골랐다.

| 앱 | 배경 | 표시 |
|---|---|---|
| Fokus DE | 거의 검정 `#17110a` | F + 금색 막대 |
| Fokus Karten | 초록 `#1b3a26` | F + K + 금색 막대 |
| Fokus Lesen | 남색 `#23324f` | F + 금색 말풍선 |
| Fokus Hanja | 버건디 `#5b1f1a` | F + 字 + 금색 막대 |
| **Fokus Alltag** | **테라코타 `#8a3f1c`** | **F + 해** |

(예전 Alltag 아이콘은 Lesen 과 똑같은 남색 말풍선이었다.)

## 파일
- 실제로 쓰는 아이콘: `public/icons/` — `favicon.svg` 가 원본, PNG 5개는 여기서 뽑은 것
  - `icon-512.png` · `icon-192.png` 둥근 모서리 · `icon-maskable-512.png` 안드로이드용(가운데 80% 안) · `apple-touch-icon.png` 180px 네모 · `favicon-32.png`
- 스플래시 배경: `vite.config.js` manifest `background_color` = `#8a3f1c`
- 이 폴더: 비교했던 후보 3개(`alltag-icon-option-0~2.svg` = A 페트롤·마이크 / B 플럼·A / C 테라코타·해)와 비교 이미지
