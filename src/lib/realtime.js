// 🎙 OpenAI Realtime 연결 — 브라우저 WebRTC (화면: screens/Talk.jsx · 순수 함수: lib/talk.js).
//
// 흐름:
//   1) /api/talk-token 에 "이 설정으로 세션 열어 줘" → 서버가 OpenAI 키로 **1분짜리 임시 열쇠(ek_…)** 를 받아 준다.
//      진짜 키는 브라우저에 오지 않는다 (api/tts.js 와 같은 이유).
//   2) 그 열쇠로 OpenAI 와 WebRTC 를 직접 잇는다. 마이크 소리는 올라가고, AI 목소리는 <audio> 로 바로 나온다.
//   3) 이벤트(받아쓰기·대답 글자·사용량)는 데이터 채널 "oai-events" 로 JSON 이 오간다.
//
// 말 차례(턴) 두 가지 — 기획 문서 "턴 감지와 잡음 처리":
//   auto : semantic VAD, eagerness low — 말의 내용을 보고 끝났는지 판단해서 "음…" 하는 동안 기다려 준다.
//   ptt  : 누르고 말하기 — 누르는 동안만 마이크를 열고, 떼면 그때 대답한다. 차 안·밖처럼 시끄러운 곳용.

import { supabase } from "./supabase";
import { isFiller } from "./talk.js";

const CALLS_URL = "https://api.openai.com/v1/realtime/calls";

/** 이 브라우저에서 되는가 */
export const rtSupported = () =>
  typeof window !== "undefined" && !!window.RTCPeerConnection && !!navigator.mediaDevices?.getUserMedia;

/** 서버에 임시 열쇠를 부탁한다 → { value, model, expires_at } */
async function fetchToken(body) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("로그인이 필요해요.");
  const res = await fetch("/api/talk-token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  let d;
  try {
    d = await res.json();
  } catch {
    throw new Error(`대화 서버 응답을 읽지 못했어요 (${res.status})`);
  }
  if (!res.ok) throw new Error(d?.error || `대화 서버 오류 ${res.status}`);
  return d;
}

/**
 * 턴 감지 설정 — 서버(api/talk-token.js)와 같은 값.
 * guard(추임새 무시, 기본): 말이 끝나도 서버가 바로 대답하지 않는다 → 받아쓰기를 보고 추임새만이면 지우고, 아니면 이 파일이 대답을 부탁한다.
 *   그리고 AI 가 말하는 중에 내가 "아~" 해도 AI 말을 끊지 않는다(interrupt_response false).
 */
export const turnDetection = (mode, guard = true) =>
  mode === "ptt" ? null : { type: "semantic_vad", eagerness: "low", create_response: !guard, interrupt_response: !guard };

/** 받아쓰기가 이만큼 안 오면 그냥 대답한다 (추임새 판정을 못 해도 대화가 멈추지 않게) */
const GUARD_WAIT_MS = 2500;

/**
 * 연결한다. 반환: 세션 객체 { model, press(), release(), setMode(), close(), mute() }
 * opts: { instructions, mode, noise: "near"|"far", lang: "de"|"mix", guard: 추임새 무시, onEvent(ev), onState(state), onError(msg) }
 *   state: "connecting" | "live" | "closed"
 */
export async function connectTalk({ instructions, mode = "auto", noise = "near", lang = "de", guard = true, voice, speed, onEvent, onState, onError }) {
  onState?.("connecting");
  const tk = await fetchToken({ instructions, mode, noise, lang, guard, voice, speed });

  let mic;
  try {
    mic = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (e) {
    throw new Error(
      e?.name === "NotAllowedError"
        ? "마이크 권한이 꺼져 있어요. 주소창 왼쪽 자물쇠 → 마이크 허용."
        : `마이크를 열지 못했어요: ${e?.message || e}`
    );
  }
  const track = mic.getAudioTracks()[0];

  const pc = new RTCPeerConnection();
  const audio = new Audio();
  audio.autoplay = true;
  pc.ontrack = (e) => { audio.srcObject = e.streams[0]; };
  pc.addTrack(track, mic);

  const dc = pc.createDataChannel("oai-events");
  let curMode = mode;
  let closed = false;
  let pressedAt = 0;
  let session = null; // 아래에서 채운다 — 그 전에 연결이 끊겨도 터지지 않게

  const send = (obj) => {
    if (dc.readyState === "open") dc.send(JSON.stringify(obj));
  };

  // 누르고 말하기는 누르기 전까지 마이크를 막아 둔다 (막힌 트랙은 조용한 소리를 보낸다)
  track.enabled = curMode !== "ptt";

  dc.onopen = () => {
    onState?.("live");
    // AI 가 먼저 말을 건다 (지시문의 "Beginne das Gespräch selbst")
    send({ type: "response.create" });
  };
  // ── 추임새 무시 (자동 차례에서만) ──
  // 대답 중에 또 대답을 부탁하면 서버가 거절한다 → 대답 중이면 끝난 뒤에 부탁한다.
  let active = false;
  let pending = false;
  const waits = new Map(); // item_id → 받아쓰기 기다리는 타이머
  const reply = () => {
    if (active) { pending = true; return; }
    active = true; // response.created 가 오기 전에 또 부탁하지 않게
    send({ type: "response.create" });
  };
  const guarding = () => guard && curMode !== "ptt";
  const settle = (id, filler) => {
    if (!waits.has(id)) return;
    clearTimeout(waits.get(id));
    waits.delete(id);
    if (filler) send({ type: "conversation.item.delete", item_id: id }); // AI 가 앞 대화로도 보지 않게
    else reply();
  };
  const guardEvent = (ev) => {
    switch (ev.type) {
      case "response.created": active = true; break;
      case "response.done":
        active = false;
        if (pending) { pending = false; reply(); }
        break;
      case "input_audio_buffer.committed":
        if (guarding() && ev.item_id) waits.set(ev.item_id, setTimeout(() => settle(ev.item_id, false), GUARD_WAIT_MS));
        break;
      case "conversation.item.input_audio_transcription.completed":
        settle(ev.item_id, isFiller(ev.transcript));
        break;
      case "conversation.item.input_audio_transcription.failed":
        settle(ev.item_id, false);
        break;
      default:
    }
  };

  dc.onmessage = (m) => {
    let ev;
    try { ev = JSON.parse(m.data); } catch { return; }
    guardEvent(ev);
    if (ev.type === "error") {
      const msg = ev.error?.message || "알 수 없는 오류";
      // 너무 짧게 누르고 뗀 경우 — 무시해도 된다
      if (/buffer too small|buffer is empty/i.test(msg)) return;
      onError?.(`대화 오류: ${msg}`);
    }
    onEvent?.(ev);
  };
  pc.onconnectionstatechange = () => {
    if (["failed", "disconnected"].includes(pc.connectionState) && !closed) {
      onError?.("연결이 끊겼어요. 신호가 약한 곳일 수 있어요.");
      session?.close();
    }
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  const sdp = await fetch(CALLS_URL, {
    method: "POST",
    body: offer.sdp,
    headers: { Authorization: `Bearer ${tk.value}`, "Content-Type": "application/sdp" },
  });
  if (!sdp.ok) {
    const txt = await sdp.text().catch(() => "");
    mic.getTracks().forEach((t) => t.stop());
    pc.close();
    throw new Error(`OpenAI 연결 실패 (${sdp.status}) ${txt.slice(0, 160)}`);
  }
  await pc.setRemoteDescription({ type: "answer", sdp: await sdp.text() });

  session = {
    model: tk.model,
    get mode() { return curMode; },

    /** 누르고 말하기 — 누름 */
    press() {
      if (curMode !== "ptt" || closed) return;
      // AI 가 말하는 중이면 끊고 내 차례로
      send({ type: "response.cancel" });
      send({ type: "output_audio_buffer.clear" });
      send({ type: "input_audio_buffer.clear" });
      pressedAt = Date.now();
      track.enabled = true;
    },
    /** 누르고 말하기 — 뗌. 말끝이 잘리지 않게 조금 더 듣고 닫는다 */
    release() {
      if (curMode !== "ptt" || closed || !pressedAt) return;
      const held = Date.now() - pressedAt;
      pressedAt = 0;
      setTimeout(() => {
        track.enabled = false;
        if (held < 350) { send({ type: "input_audio_buffer.clear" }); return; } // 실수로 톡 누른 것
        send({ type: "input_audio_buffer.commit" });
        send({ type: "response.create" });
      }, 250);
    },
    /** 말 차례 방식 바꾸기 (대화 중에도) */
    setMode(next) {
      curMode = next;
      track.enabled = next !== "ptt";
      send({ type: "session.update", session: { type: "realtime", audio: { input: { turn_detection: turnDetection(next, guard) } } } });
    },
    /** 지시문 바꾸기 — 교정 방식(흐름 유지 ↔ 선생님)을 대화 중에 바꿀 때 */
    setInstructions(text) {
      send({ type: "session.update", session: { type: "realtime", instructions: text } });
    },
    /** 잠깐 마이크 끄기 (자동 모드에서) */
    mute(on) {
      if (curMode === "ptt") return;
      track.enabled = !on;
    },
    close() {
      if (closed) return;
      closed = true;
      waits.forEach((t) => clearTimeout(t));
      try { dc.close(); } catch { /* 이미 닫힘 */ }
      try { pc.close(); } catch { /* 이미 닫힘 */ }
      mic.getTracks().forEach((t) => t.stop());
      audio.srcObject = null;
      onState?.("closed");
    },
  };
  return session;
}
