// fokus-karten/src/components/Auth.jsx 를 옮겨왔다. 다른 점은 로고 문구뿐이다.
//
// 참고: Fokus DE와 같은 계정을 쓰므로 실제로 회원가입 탭을 쓸 일은 없다.
// 그래도 남겨둔 이유는 resetPasswordForEmail의 redirectTo가 origin별로 달라야 하고,
// 나중에 별도 계정을 팔 가능성이 있어서다.

import { useState } from "react";
import { supabase } from "../lib/supabase";
import "../styles/auth.css";

export default function Auth() {
  const [mode, setMode] = useState("login"); // login | signup | forgot
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);

  const go = (m) => {
    setMode(m);
    setError(null);
    setMessage(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    if (mode === "forgot") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (error) setError(error.message);
      else setMessage("비밀번호 재설정 링크를 보냈어요. 메일함을 확인하세요.");
    } else if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setError(error.message);
      else setMessage("확인 메일을 보냈어요. 메일함을 확인하세요.");
    }

    setLoading(false);
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          Fokus <em>Alltag</em>
        </div>
        <div className="auth-sub">하루 20분 · B1 → B2</div>

        {mode !== "forgot" && (
          <div className="auth-toggle">
            <button
              className={`auth-tab ${mode === "login" ? "active" : ""}`}
              onClick={() => go("login")}
            >
              로그인
            </button>
            <button
              className={`auth-tab ${mode === "signup" ? "active" : ""}`}
              onClick={() => go("signup")}
            >
              회원가입
            </button>
          </div>
        )}

        {error && <div className="auth-error">{error}</div>}
        {message && <div className="auth-msg">{message}</div>}

        {mode === "forgot" && (
          <p style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", margin: "0 0 14px" }}>
            이메일 주소를 입력하면 재설정 링크를 보내드려요.
          </p>
        )}

        <form onSubmit={handleSubmit}>
          <div className="auth-field">
            <label className="auth-label">이메일</label>
            <input
              className="auth-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          {mode !== "forgot" && (
            <div className="auth-field">
              <label className="auth-label">비밀번호</label>
              <input
                className="auth-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
            </div>
          )}

          {mode === "login" && (
            <div style={{ textAlign: "right", marginBottom: 8 }}>
              <button type="button" className="auth-link" onClick={() => go("forgot")}>
                비밀번호를 잊으셨나요?
              </button>
            </div>
          )}

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading
              ? "…"
              : mode === "forgot"
                ? "재설정 링크 보내기"
                : mode === "login"
                  ? "로그인"
                  : "계정 만들기"}
          </button>
        </form>

        {mode === "forgot" && (
          <div style={{ textAlign: "center", marginTop: 12 }}>
            <button type="button" className="auth-link" onClick={() => go("login")}>
              ← 로그인으로 돌아가기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
