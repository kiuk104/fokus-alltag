import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyEvent, cleanLines, linesToText, myLines, rtCost, transcribeCost, sumUsage, parseReview, keepRows, talkEntry,
  defaultPicked, talkInstructions, TOPICS, clock,
} from "./talk.js";
import { collectItems } from "./drill.js";
import { keptSentences } from "./recall.js";

const run = (evs) => evs.reduce(applyEvent, []);

test("대화록: 내 말 자리를 먼저 잡아 두면 받아쓰기가 늦게 와도 순서가 맞다", () => {
  const lines = run([
    { type: "response.output_item.added", item: { id: "a1", role: "assistant" } },
    { type: "response.output_audio_transcript.delta", item_id: "a1", delta: "Hallo, wie " },
    { type: "response.output_audio_transcript.done", item_id: "a1", transcript: "Hallo, wie war dein Tag?" },
    { type: "input_audio_buffer.committed", item_id: "u1" },
    { type: "response.output_item.added", item: { id: "a2", role: "assistant" } },
    { type: "response.output_audio_transcript.done", item_id: "a2", transcript: "Schön!" },
    { type: "conversation.item.input_audio_transcription.completed", item_id: "u1", transcript: " Ich habe viel Paket geliefert. " },
  ]);
  assert.deepEqual(lines.map((l) => [l.who, l.text]), [
    ["ai", "Hallo, wie war dein Tag?"], ["me", "Ich habe viel Paket geliefert."], ["ai", "Schön!"],
  ]);
});

test("대화록: 받아쓰기 delta 를 이어 붙이고, 모르는 이벤트·빈 줄은 무시", () => {
  const lines = run([
    { type: "input_audio_buffer.committed", item_id: "u1" },
    { type: "conversation.item.input_audio_transcription.delta", item_id: "u1", delta: "Ich möchte " },
    { type: "conversation.item.input_audio_transcription.delta", item_id: "u1", delta: "소포 abholen" },
    { type: "session.updated" },
    { type: "input_audio_buffer.committed", item_id: "u2" },
    { type: "conversation.item.input_audio_transcription.failed", item_id: "u2" },
    { type: "response.output_item.added", item: { id: "x", role: "tool" } },
  ]);
  assert.equal(lines[0].text, "Ich möchte 소포 abholen");
  assert.equal(lines.length, 2);
  assert.equal(cleanLines(lines).length, 1);
  assert.deepEqual(myLines(lines), ["Ich möchte 소포 abholen"]);
  assert.equal(linesToText([{ who: "ai", text: "Hi" }, ...lines]), "KI: Hi\nICH: Ich möchte 소포 abholen");
});

test("비용: 캐시된 입력은 싸게, 모르는 모델은 비싼 쪽으로", () => {
  const usage = {
    input_tokens: 1600, output_tokens: 1200,
    input_token_details: { text_tokens: 1000, audio_tokens: 600, cached_tokens_details: { text_tokens: 500, audio_tokens: 0 } },
    output_token_details: { text_tokens: 0, audio_tokens: 1200 },
  };
  const mini = rtCost("gpt-realtime-2.1-mini", usage);
  // 600*10 + 500*0.6 + 500*0.06 + 1200*20 = 6000+300+30+24000 = 30330 / 1e6
  assert.ok(Math.abs(mini - 0.03033) < 1e-9);
  assert.ok(rtCost("??", usage) > mini);
  assert.equal(rtCost("gpt-realtime-2.1-mini", null), 0);
  assert.ok(Math.abs(transcribeCost({ type: "duration", seconds: 60 }) - 0.006) < 1e-12);
  assert.deepEqual(sumUsage([{ input_tokens: 1, output_tokens: 2 }, { input_tokens: 3 }]), { input_tokens: 4, output_tokens: 2 });
});

const REVIEW = `여기 결과:
{"summary":"배송 이야기를 했어요.",
 "fixes":[
   {"said":"Ich habe viel Paket geliefert.","from":"viel Paket","to":"viele Pakete","better":"Ich habe viele Pakete geliefert.","ko":"택배를 많이 배달했어요.","type":"Plural","hint":"복수형","why":"셀 수 있는 명사는 viele + 복수."},
   {"said":"Gestern ich bin müde.","from":"없는 말","to":"x","better":"Gestern war ich müde.","ko":"어제 피곤했어요.","type":"Verbstellung","hint":"","why":""},
   {"said":"Gut.","from":"Gut","to":"Gut","better":"Gut.","type":"x"}
 ],
 "korean":[{"said":"Ich möchte 소포 abholen","ko":"소포","de":"das Paket","better":"Ich möchte das Paket abholen.","koSentence":"소포를 찾고 싶어요."},{"ko":"","de":"x"}],
 "phrases":[{"de":"Das kann passieren.","ko":"그럴 수 있죠.","note":"위로할 때"},{"de":"Keine Ursache.","ko":"천만에요."},{"de":"A"},{"de":"B"}]
}`;

test("정리: JSON 을 읽고, said 에 없는 from 은 비우고, 바뀐 게 없는 문장은 뺀다", () => {
  const r = parseReview(REVIEW);
  assert.equal(r.summary, "배송 이야기를 했어요.");
  assert.equal(r.fixes.length, 2);
  assert.equal(r.fixes[0].from, "viel Paket");
  assert.equal(r.fixes[1].from, "");
  assert.equal(r.korean.length, 1);
  assert.equal(r.phrases.length, 4);
  assert.throws(() => parseReview("미안해요"), /JSON/);
  assert.throws(() => parseReview('{"fixes":[ {"said": '), /JSON/);
});

test("저장: 고른 틀린 곳은 오답 노트로, 보낸 문장은 3문장 꺼내기로 이어진다", () => {
  const review = parseReview(REVIEW);
  const picked = defaultPicked(review);
  assert.deepEqual(picked.phrases, [true, true, true, false]);
  const rows = keepRows(review, picked);
  assert.deepEqual(rows.map((r) => r.kind), ["fix", "fix", "korean", "phrase", "phrase", "phrase"]);

  const lines = [{ who: "ai", text: "Na?" }, { who: "me", text: "Ich habe viel Paket geliefert." }, { who: "me", text: "Gestern ich bin müde." }];
  const e = talkEntry({ day: "2026-10-31", month: 1, topic: "kunde", lines, review, picked, seconds: 300, cost: 0.1, model: "m" });
  assert.equal(e.template, "talk");
  assert.equal(e.raw_text, "Ich habe viel Paket geliefert.\nGestern ich bin müde.");
  // from 이 없는 둘째 문장은 오답 노트에 안 들어간다 (밑줄을 못 긋는다)
  assert.equal(e.correction.data.b1.fixes.length, 1);
  assert.equal(e.correction.talk.fixes.length, 2);

  const items = collectItems([{ id: 7, ...e }]);
  assert.equal(items.length, 1);
  assert.equal(items[0].before, "Ich habe viel Paket geliefert.");
  assert.equal(items[0].after, "Ich habe viele Pakete geliefert.");

  // DE 로 보낸 뒤 (TalkReview 가 progress 를 채운다)
  const sent = { id: 7, ...e, correction: { ...e.correction, progress: { saved: true, sentIds: ["u1", "u2"], keepEdited: rows.slice(0, 2).map((r) => ({ de: r.de, ko: r.ko, on: true })) } } };
  const kept = keptSentences([sent]);
  assert.deepEqual(kept.map((k) => k.de), ["Ich habe viele Pakete geliefert.", "Gestern war ich müde."]);
});

test("지시문: 주제 상황과 '대화 중 교정하지 않기'가 들어간다", () => {
  const s = talkInstructions("kunde", { month: 4 });
  assert.match(s, /REWE-Fahrer/);
  assert.match(s, /Unterbrich den Gesprächsfluss nicht/);
  assert.match(s, /B1\+\/B2/);
  assert.match(talkInstructions("없는주제"), new RegExp(TOPICS[0].scene.slice(0, 20)));
  assert.equal(clock(125.9), "2:05");
  assert.doesNotMatch(s, /LEHRER-MODUS/);
  const teach = talkInstructions("tag", { style: "teacher" });
  assert.match(teach, /LEHRER-MODUS/);
  assert.match(teach, /혹시 이 말 하려던 거예요/);
  assert.doesNotMatch(teach, /Unterbrich den Gesprächsfluss nicht/);
  assert.ok(!teach.includes("\\n"));
  assert.match(talkInstructions("tag", { tone: "sachlich" }), /Tonfall: Sprich höflich, sachlich/);
  assert.match(talkInstructions("tag"), /Tonfall: Sprich warm/);
});

test("운전 모드 · 이어서: 짧게 말하라는 규칙, 앞 대화 끝부분만 붙인다", async () => {
  const { DRIVE, DRIVE_RULE, continueRule } = await import("./talk.js");
  assert.equal(DRIVE.mode, "auto"); // 누르고 말하기는 화면을 눌러야 해서 운전 중엔 안 됨
  assert.equal(DRIVE.style, "flow");
  assert.match(talkInstructions("tag", { extra: DRIVE_RULE }), /fährt gerade Auto/);
  const lines = Array.from({ length: 20 }, (_, i) => ({ who: i % 2 ? "me" : "ai", text: `Satz ${i}` }));
  const r = continueRule(lines, 4);
  assert.match(r, /Begrüße ihn NICHT neu/);
  assert.match(r, /KI: Satz 16\nICH: Satz 17\nKI: Satz 18\nICH: Satz 19$/);
  assert.doesNotMatch(r, /Satz 15/);
  assert.equal(continueRule([]), "");
});

test("추임새: 음·아·ähm 만 있으면 추임새, 대답(ja·응)이나 문장은 아님", async () => {
  const { isFiller } = await import("./talk.js");
  for (const t of ["음", "으음…", "아~", "어...", "Ähm.", "hmm", "Mhm", "ähm, äh", "", "…", "흠", "으으음"]) assert.ok(isFiller(t), t);
  for (const t of ["ja", "응", "Okay", "Ich habe ähm", "아니요", "Nein.", "Also gut", "음 Ich weiß nicht"]) assert.ok(!isFiller(t), t);
});

test("대화록: 지운 내 말(추임새)은 화면에서도 빠진다", () => {
  const lines = run([
    { type: "input_audio_buffer.committed", item_id: "u1" },
    { type: "conversation.item.input_audio_transcription.completed", item_id: "u1", transcript: "음…" },
    { type: "conversation.item.deleted", item_id: "u1" },
  ]);
  assert.equal(lines.length, 0);
});
