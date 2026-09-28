// AI 호출 통로 — Fokus DE 의 Supabase 함수 `anthropic` 을 같이 쓴다 (기획서 3절).
//
// 키는 여기 없다: 그 함수가 Supabase 비밀값으로 들고 있고, 요청 본문을 그대로 Anthropic 에 넘긴다.
// 그래서 이 앱이 할 일은 (1) 어떤 모델을 쓸지 정하고 (2) 쓴 만큼 기록하고 (3) 상한을 지키는 것.
//
// 기록은 DE 의 ai_usage_log 에 kind "alltag-…" 로 남긴다 → DE 관리자 "📊 AI 사용량" 탭에 같이 보인다.
// ⚠ ai_usage_log 는 이 파일에서만 다룬다(가드레일). 넣기와 조회만.
//
// 상한 (기획서 3-1절):
//   · 하루 20회 — 실수로 버튼을 연타해도 돈이 새지 않게
//   · 이번 달 비용이 상한의 80% 를 넘으면 Haiku 4.5 로 (절약 모드)
//   · 상한에 닿으면 멈춤 → 화면은 "교정 요청 복사"(Claude 앱) 로 돌아간다
// Edge Function 자체에는 상한이 없다. 최후 방어선은 Claude Console 의 월 한도($5 권장).

import { supabase } from "./supabase";

export const MODEL_MAIN = import.meta.env.VITE_ALLTAG_AI_MODEL || "claude-sonnet-5";
export const MODEL_SAVE = "claude-haiku-4-5-20251001";
export const MONTHLY_CAP = Number(import.meta.env.VITE_ALLTAG_MONTHLY_CAP_USD) || 3;
export const DAILY_CALLS = 20;

// USD per 1M tokens — 2026-09-23 요금표 (platform.claude.com/docs/en/about-claude/pricing)
export const PRICING = {
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
};

export const costOf = (model, usage) => {
  const p = PRICING[model];
  if (!p || !usage) return 0;
  return ((usage.input_tokens || 0) * p.input + (usage.output_tokens || 0) * p.output) / 1_000_000;
};

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/anthropic`;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

// 로컬 날짜 기준 이번 달 1일 · 오늘 0시 (ISO)
const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString(); };
const dayStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString(); };

/** 이번 달 Alltag AI 비용 · 오늘 호출 수 */
export async function usageNow(userId) {
  const { data, error } = await supabase
    .from("ai_usage_log")
    .select("cost_usd, created_at")
    .eq("user_id", userId)
    .like("kind", "alltag-%")
    .gte("created_at", monthStart());
  if (error) throw new Error(error.message);
  const rows = data || [];
  const today = dayStart();
  return {
    spent: rows.reduce((s, r) => s + Number(r.cost_usd || 0), 0),
    todayCalls: rows.filter((r) => r.created_at >= today).length,
  };
}

/**
 * 지금 쓸 모델. null 이면 멈춤(이유는 reason).
 * main 이 false 면 처음부터 Haiku (자기 설명 확인처럼 짧은 일).
 */
export function pickModel({ spent, todayCalls }, { main = true } = {}) {
  if (todayCalls >= DAILY_CALLS) return { model: null, reason: `오늘 AI 호출 ${DAILY_CALLS}회를 다 썼어요. 내일 다시 열려요.` };
  if (spent >= MONTHLY_CAP) return { model: null, reason: `이번 달 AI 상한 $${MONTHLY_CAP} 에 닿았어요. 다음 달 1일에 다시 열려요.` };
  if (!main) return { model: MODEL_SAVE, saving: false };
  if (spent >= MONTHLY_CAP * 0.8) return { model: MODEL_SAVE, saving: true };
  return { model: MODEL_MAIN, saving: false };
}

async function record(userId, model, usage, kind) {
  if (!usage) return;
  try {
    await supabase.from("ai_usage_log").insert({
      user_id: userId,
      provider: "anthropic",
      model,
      kind,
      input_tokens: usage.input_tokens || 0,
      output_tokens: usage.output_tokens || 0,
      image_count: 0,
      cost_usd: costOf(model, usage),
    });
  } catch {
    /* 기록 실패가 교정을 막지 않게 — DE 의 recordAnthropicUsage 와 같은 태도 */
  }
}

/**
 * 한 번 부른다. 상한을 먼저 확인하고, 끝나면 기록한다.
 * 반환: { text, model, saving }  — 막혔으면 throw (err.capped = true)
 */
export async function askClaude(userId, { system, prompt, maxTokens = 2000, kind, main = true }) {
  const u = await usageNow(userId);
  const pick = pickModel(u, { main });
  if (!pick.model) {
    const e = new Error(pick.reason);
    e.capped = true;
    throw e;
  }
  const res = await fetch(EDGE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON}` },
    body: JSON.stringify({
      model: pick.model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  let d;
  try {
    d = await res.json();
  } catch {
    throw new Error(`AI 응답을 읽지 못했어요 (${res.status})`);
  }
  if (!res.ok) throw new Error(d?.error?.message || `AI 오류 ${res.status}`);
  await record(userId, pick.model, d.usage, kind);
  const text = (d.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
  return { text, model: pick.model, saving: pick.saving, spent: u.spent + costOf(pick.model, d.usage) };
}
