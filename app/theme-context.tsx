"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";
const STORAGE_KEY = "rento-theme";

interface ThemeCtx {
  theme: Theme;
  toggle: () => void;
}

const Ctx = createContext<ThemeCtx>({ theme: "light", toggle: () => {} });

/**
 * 라이트/다크 수동 토글. 시스템 설정은 최초 1회 기본값으로만 참고하고,
 * 이후엔 사용자가 고른 값을 localStorage에 저장해 그대로 유지한다 —
 * "시스템이 다크면 무조건 다크"가 아니라 사용자가 직접 고르게 한다.
 * layout.tsx의 인라인 스크립트가 하이드레이션 전에 미리
 * documentElement에 data-theme를 심어둬서 깜빡임(FOUC)이 없다.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme") as Theme | null;
    setTheme(current === "dark" ? "dark" : "light");
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const toggle = () => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // 저장 실패해도(프라이빗 모드 등) 이번 세션 토글 자체는 동작하게 둔다
      }
      return next;
    });
  };

  return <Ctx.Provider value={{ theme, toggle }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  return useContext(Ctx);
}
