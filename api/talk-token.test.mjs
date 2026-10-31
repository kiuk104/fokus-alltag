// npm test — 서버 함수는 fetch 를 가짜로 바꿔 검사한다 (진짜 OpenAI·Supabase 를 부르지 않는다).
import { test } from "node:test";
import assert from "node:assert/strict";
import handler, { sessionConfig } from "./talk-token.js";

const fakeRes = () => {
  const r = { statusCode: 0, headers: {}, body: "" };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.end = (b) => { r.body = b; };
  return r;
};

test("세션 설정: 누르고 말하기는 턴 감지를 끄고, 자동은 semantic VAD(느긋하게)", () => {
  const opt = { model: "m", voice: "v", transcribe: "t" };
  const ptt = sessionConfig({ instructions: "x", mode: "ptt", noise: "far" }, opt);
  assert.equal(ptt.audio.input.turn_detection, null);
  assert.equal(ptt.audio.input.noise_reduction.type, "far_field");
  const auto = sessionConfig({ instructions: "x".repeat(9000), mode: "auto" }, opt);
  assert.deepEqual(auto.audio.input.turn_detection.type, "semantic_vad");
  assert.equal(auto.audio.input.turn_detection.eagerness, "low");
  assert.equal(auto.audio.input.noise_reduction.type, "near_field");
  assert.equal(auto.audio.input.transcription.language, undefined); // 한국어 섞인 말도 받아 적게
  assert.equal(auto.instructions.length, 6000);
  assert.equal(auto.model, "m");
});

test("로그인 토큰 없이는 열쇠를 주지 않는다", async () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon";
  const res = fakeRes();
  await handler({ method: "POST", headers: {}, body: "{}" }, res);
  assert.equal(res.statusCode, 401);
});

test("GET 은 405", async () => {
  const res = fakeRes();
  await handler({ method: "GET", headers: {} }, res);
  assert.equal(res.statusCode, 405);
});
