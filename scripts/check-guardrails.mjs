// Fokus DE 의 데이터를 이 앱이 망가뜨리지 않는지 기계적으로 검사한다. 커밋 전에: npm run check
//
// fokus-karten/scripts/check-guardrails.mjs 와 같은 생각에서 출발했고, 규칙은 기획서 4절이다.
//
//   ① 학습 기록(user_srs 등) — 쓰기 금지. 읽기는 src/lib/deAdapter.js 한 파일에서만(CP4 미션 단어).
//      이 앱이 복습 일정을 건드리는 순간 DE 의 통계·트로피가 조용히 망가진다.
//   ② 공유 콘텐츠(user_sentences, custom_words) — 읽기와 새로 넣기만. 고치기·지우기 금지.
//      문장을 고치는 곳은 DE·Karten 이다. 여기는 "만들어서 보내는" 앱이다.
//      넣기는 src/lib/deWrite.js 한 파일에서만(CP2).
//   ③ ai_usage_log — src/lib/ai.js 한 파일에서만, 넣기와 조회만(CP2).
//   ④ 기본 단어장(generated_words · word_tags) — 읽기만, deWrite.js 에서(새 단어가 DE 에 이미 있는지 볼 때, CP3).
//   ⑤ card_meta — src/lib/audio.js 한 파일에서만, upsert 만(발음 붙이기, CP3). 지우기는 DE·Karten 몫.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const P = (...s) => join("src", "lib", ...s);

const RULES = [
  // [테이블들, 허용 파일, 허용하는 쓰기 호출]
  { tables: ["user_srs", "user_progress", "study_events", "study_logs", "user_badges"], file: P("deAdapter.js"), allow: [] },
  { tables: ["user_sentences", "custom_words"], file: P("deWrite.js"), allow: ["insert"] },
  { tables: ["ai_usage_log"], file: P("ai.js"), allow: ["insert"] },
  { tables: ["generated_words", "word_tags"], file: P("deWrite.js"), allow: ["insert"] }, // deWrite 의 insert 는 문장·단어용
  { tables: ["card_meta"], file: P("audio.js"), allow: ["upsert"] },
];

const WRITE = /\.(insert|update|upsert|delete|rpc)\s*\(/g;
const EXT = new Set([".js", ".jsx", ".mjs"]);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (EXT.has(extname(p)) && !p.endsWith(".test.mjs")) out.push(p);
  }
  return out;
}

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const errors = [];

for (const file of walk("src")) {
  const src = stripComments(readFileSync(file, "utf8"));
  const lines = src.split("\n");
  for (const rule of RULES) {
    for (const table of rule.tables) {
      lines.forEach((line, i) => {
        if (!line.includes(`"${table}"`) && !line.includes(`'${table}'`) && !line.includes(`\`${table}\``)) return;
        if (file !== rule.file) errors.push(`${file}:${i + 1}  [${table}] 는 ${rule.file} 에서만 다룹니다`);
      });
    }
  }
}

// 허용 파일 안에서는 쓰기 호출 종류를 검사한다 (from(...) 과 다른 줄에 있는 체인까지 잡으려고 파일 전체로)
for (const rule of RULES) {
  let src;
  try {
    src = stripComments(readFileSync(rule.file, "utf8"));
  } catch {
    continue; // 아직 없는 파일 — CP 가 진행되면 생긴다
  }
  for (const m of src.matchAll(WRITE)) {
    if (!rule.allow.includes(m[1])) {
      errors.push(`${rule.file}  .${m[1]}() 금지 — [${rule.tables.join(", ")}] 는 ${rule.allow.length ? rule.allow.join("·") + " 만" : "읽기만"} 허용`);
    }
  }
}

if (errors.length) {
  console.error("\n❌ 가드레일 위반:\n");
  for (const e of errors) console.error("  " + e);
  console.error("\nFokus DE 의 학습 기록은 읽기만, 공유 문장·단어는 넣기만 합니다 (기획서 4절).\n");
  process.exit(1);
}

console.log("✅ 가드레일 통과 — DE 학습 기록 쓰기 없음 · 공유 콘텐츠는 넣기만 · AI 기록은 ai.js 에서만");
