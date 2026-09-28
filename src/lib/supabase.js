import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error(
    ".env 에 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 가 없습니다. " +
    "Fokus DE(E:\\Coding\\Basiswortschatz)의 .env 에서 같은 값을 복사하세요."
  );
}

export const supabase = createClient(url, key);
