import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// 개발 중에도 /api/listen 이 돌게 한다 (fokus-karten 의 apiDev 와 같은 방식).
// 배포(Vercel)에서는 api/ 폴더가 저절로 서버 함수가 되지만, `npm run dev` 는 vite 혼자라 /api 가 404 다.
// 같은 파일(api/listen.js)을 그대로 불러 쓴다 — 코드를 두 벌 두지 않는다.
function apiDev() {
  return {
    name: "fa-api-dev",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/api/listen", async (req, res) => {
        try {
          // ssrLoadModule 이라 파일을 고치면 다시 읽는다. 미들웨어가 경로 앞부분을 떼므로 원래 주소로 되돌린다.
          const { default: handler } = await server.ssrLoadModule("/api/listen.js");
          req.url = req.originalUrl || req.url;
          await handler(req, res);
        } catch (e) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ error: e?.message || String(e) }));
        }
      });
      // 원어민 발음 (api/tts.js — Fokus DE 와 같은 파일). Vercel 처럼 본문을 미리 읽어 req.body 로 준다.
      server.middlewares.use("/api/tts", async (req, res) => {
        try {
          const { default: handler } = await server.ssrLoadModule("/api/tts.js");
          if (req.method === "POST") {
            const chunks = [];
            for await (const c of req) chunks.push(c);
            req.body = Buffer.concat(chunks).toString("utf8");
          }
          await handler(req, res);
        } catch (e) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ error: e?.message || String(e) }));
        }
      });
    },
  };
}

// 설정은 fokus-karten/vite.config.js 를 따랐다. 다른 점:
//  · dev 포트 5175 — Fokus DE(5173)·Karten(5174)과 origin 이 달라야
//    localStorage 의 Supabase 세션·설정이 섞이지 않는다.
//  · /api 는 듣기(listen)와 발음(tts) — AI 교정은 Fokus DE 의 Supabase 함수를 부른다(lib/ai.js, CP2).
//  · .env 의 VITE_ 가 아닌 값(TTS 키)도 process.env 로 올린다 — 개발 서버 안의 api/tts.js 만 읽고 브라우저로는 안 간다.
export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));
  return {
  plugins: [
    apiDev(),
    react(),
    VitePWA({
      // "prompt": 기록을 쓰는 도중에 새 버전으로 리로드되면 적던 글이 날아간다.
      registerType: "prompt",
      injectRegister: null, // 등록은 src/lib/pwa.js 가 직접 한다
      devOptions: { enabled: false },
      includeAssets: ["icons/apple-touch-icon.png", "icons/favicon.svg", "icons/favicon-32.png"],
      manifest: {
        name: "Fokus Alltag",
        short_name: "Alltag",
        description: "하루 20분, 내 하루를 독일어로 — B1→B2 6개월 프로그램.",
        lang: "ko",
        start_url: "/",
        scope: "/",
        id: "/",
        display: "standalone",
        orientation: "portrait",
        // 스플래시 배경 = 아이콘 배경. 다르면 켜는 순간 아이콘 둘레에 네모 테두리가 보인다.
        background_color: "#8a3f1c", // 아이콘: 테라코타 + 해(하루) — 2026-09-30, Lesen·Hanja 와 구분
        theme_color: "#101214",
        categories: ["education"],
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: { port: 5175, strictPort: true },
  };
});
