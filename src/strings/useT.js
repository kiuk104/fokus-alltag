// 화면에서 문구 읽기: const t = useT();  →  t("today.routine")
// 언어는 App 이 프로필 · 설정에서 정해 LangContext 로 내려 준다(profiles/index.js profileFor().uiLang).

import { createContext, useContext } from "react";
import { makeT, DEFAULT_LANG } from "./t.js";

export const LangContext = createContext(DEFAULT_LANG);
export const useT = () => makeT(useContext(LangContext));
