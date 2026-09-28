// 음성 인식 — 브라우저 내장 Web Speech API (무료, 기획서 결정 4).
//
// 알아 둘 것:
//  · Chrome(안드로이드·PC)과 Safari 14.5+ 에 있다. Firefox 에는 없다 → supported() 가 false 면 🎤 를 숨긴다.
//  · 안드로이드 Chrome 은 continuous 를 무시하고 말이 몇 초 끊기면 스스로 멈춘다.
//    사용자가 끄지 않았는데 onend 가 오면 다시 켠다 — 말하다 숨 고르는 사이에 꺼지면 짜증 난다.
//  · 결과는 "잠정(interim)"과 "확정(final)" 두 가지로 온다. 확정만 칸에 붙이고, 잠정은 회색으로 보여 주기만 한다.
//  · 한 번에 마이크 하나. 다른 칸의 🎤 를 누르면 앞의 것은 멈춘다.

const Recognition =
  typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : undefined;

export const supported = () => !!Recognition;

let current = null; // 지금 듣고 있는 세션 (한 번에 하나)

/**
 * 듣기 시작. 반환값의 stop() 으로 끈다.
 * lang: "de-DE" | "ko-KR"
 * onFinal(text)   — 확정된 조각 (칸 끝에 붙인다)
 * onInterim(text) — 아직 바뀔 수 있는 조각 (보여 주기만)
 * onState(on)     — 듣는 중인지
 * onError(msg)
 */
export function listen({ lang = "de-DE", onFinal, onInterim, onState, onError }) {
  if (!Recognition) {
    onError?.("이 브라우저는 음성 인식을 지원하지 않아요. Chrome 에서 열어 주세요.");
    return { stop() {} };
  }
  current?.stop();

  let wanted = true; // 사용자가 끄기 전까지는 켜 둔다
  let rec = null;
  let restarts = 0;

  const session = {
    stop() {
      wanted = false;
      try { rec?.stop(); } catch { /* 이미 멈춤 */ }
      onInterim?.("");
      onState?.(false);
      if (current === session) current = null;
    },
  };

  const start = () => {
    rec = new Recognition();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const t = r[0].transcript;
        if (r.isFinal) onFinal?.(t.trim());
        else interim += t;
      }
      onInterim?.(interim.trim());
      restarts = 0; // 말이 들어오고 있으면 재시작 횟수를 되돌린다
    };

    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return; // 조용했을 뿐 — onend 에서 다시 켠다
      wanted = false;
      const msg = {
        "not-allowed": "마이크 권한이 꺼져 있어요. 주소창 왼쪽 자물쇠 → 마이크 허용.",
        "service-not-allowed": "마이크 권한이 꺼져 있어요. 주소창 왼쪽 자물쇠 → 마이크 허용.",
        network: "음성 인식은 인터넷이 필요해요 (브라우저가 서버로 보냅니다).",
        "audio-capture": "마이크를 찾을 수 없어요.",
      }[e.error] || `음성 인식 오류: ${e.error}`;
      onError?.(msg);
    };

    rec.onend = () => {
      // 안드로이드의 "혼자 멈춤" — 사용자가 끄지 않았으면 다시 켠다. 무한 반복은 막는다.
      if (wanted && restarts < 30) {
        restarts++;
        try { start(); return; } catch { /* 아래로 */ }
      }
      onInterim?.("");
      onState?.(false);
      if (current === session) current = null;
    };

    rec.start();
  };

  try {
    start();
    current = session;
    onState?.(true);
  } catch (e) {
    onError?.(e.message);
  }
  return session;
}

export const stopListening = () => current?.stop();

/** 확정 조각을 칸 끝에 붙인다 — 띄어쓰기 한 칸, 문장 첫 글자는 대문자(독일어일 때). */
export function appendSpoken(prev, piece, lang) {
  let t = piece.trim();
  if (!t) return prev;
  const base = (prev || "").replace(/\s+$/, "");
  const sentenceStart = !base || /[.!?]$/.test(base);
  if (lang === "de-DE" && sentenceStart) t = t[0].toUpperCase() + t.slice(1);
  return base ? `${base} ${t}` : t;
}
