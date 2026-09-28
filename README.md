# Fokus Alltag

하루 20분, 내 하루를 독일어로 — B1→B2 6개월 프로그램 앱.
기획서: [`docs/FokusAlltag_기획서.md`](docs/FokusAlltag_기획서.md) — 원본은 `E:\Coding\Basiswortschatz\FokusAlltag_기획서_2026-09-23.md`. 고칠 때는 두 곳을 같이.

Fokus 패밀리에서 **산출**(말하기·쓰기·교정)과 6개월 진도를 맡는다.
문장 창고는 Fokus DE, 암기 복습은 Fokus Karten — 여기서 다시 만들지 않는다.

## 처음 한 번
1. `.env.example` → `.env` 로 복사하고 Fokus DE 의 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` 를 그대로 넣는다
2. Supabase 대시보드 → SQL Editor 에서 `supabase/migrations/20260923_alltag.sql` 실행
3. `npm install` → `npm run dev` (http://localhost:5175)

## AI 비용
- 교정은 Fokus DE 의 Supabase 함수 `anthropic` 을 같이 쓴다 — 키 설정 필요 없음
- 기록은 DE `ai_usage_log`(kind `alltag-…`) → DE 관리자 📊 AI 사용량 탭에 같이 보임
- 월 $3 상한 · 80% 넘으면 Haiku(절약 모드) · 하루 20회. Claude Console 에도 월 한도 $5 를 걸어 둘 것

## 커밋 전에
- `npm run check` — 가드레일(DE 학습 기록 쓰기 금지 · 공유 문장은 넣기만)
- `npm test` — 달력 계산(몇 개월차 · 연속 일수)
- `npm run build`

## 규칙 (Karten 과 같음)
- 파일당 800줄 상한, CSS 는 `src/styles/*.css`
- localStorage 키 `fa-` 접두사, dev 포트 5175 (DE 5173 · Karten 5174)
- `index.html` 의 `interactive-widget=resizes-content` 를 지우지 않는다

## 진행
| CP | 내용 | 상태 |
|---|---|---|
| CP0 | 로그인 · 시작일 · 오늘(루틴 체크·연속 일수) · 진도(로드맵) · 기록 징검다리(교정 요청 복사) | ✅ 2026-09-23 |
| CP1 | 기록: 형식별 입력 칸 + 음성 인식 + 한국어 모드 + 교차 규칙(섞는 날) + alltag_entries 저장 | ✅ 2026-09-28 |
| CP2 | AI 교정(DE `anthropic` 함수, 단계별 공개 5단계) + 외울 3문장 → DE `user_sentences`(단어장 Alltag, 기존 태그 맞춤) | ✅ 2026-09-28 |
| (듣기) | 🟢 앱 안 듣기 1단계 — 4개 출처 · 원고 · 문장 이동 · Tandem 식 비교 | ✅ 2026-09-28 |
| CP3 | 따라 말하기 · 새 단어 → custom_words | |
| CP4 | 진도 숫자(문법 8개 · 100문장 · 자주 틀리는 것) · 오늘의 미션 단어 | |
| CP5 | 6개월차 요일 루틴 · 이메일 · 월말 말하기 점검 | |
