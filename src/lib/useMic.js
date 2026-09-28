// 🎤 한 칸짜리 음성 입력 훅 — 꺼내기 화면·되살리기 카드가 같이 쓴다 (기록 화면은 칸이 여럿이라 따로).
import { useCallback, useEffect, useRef, useState } from "react";
import { listen, stopListening, supported, appendSpoken } from "./speech";

export function useMic(value, setValue, lang = "de-DE") {
  const [on, setOn] = useState(false);
  const [interim, setInterim] = useState("");
  const [err, setErr] = useState("");
  const ref = useRef(value);
  ref.current = value;

  useEffect(() => () => stopListening(), []);

  const toggle = useCallback(() => {
    if (on) return stopListening();
    setErr("");
    listen({
      lang,
      onFinal: (t) => setValue(appendSpoken(ref.current || "", t, lang)),
      onInterim: setInterim,
      onState: setOn,
      onError: setErr,
    });
  }, [on, lang, setValue]);

  return { on, interim, err, toggle, ok: supported(), stop: stopListening };
}
