"use client";

import { createContext, useContext, useEffect, useState } from "react";
import {
  type QuoteDisplaySettings,
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
} from "@/lib/quote-settings";

interface SettingsCtx {
  settings: QuoteDisplaySettings;
  update: (patch: Partial<QuoteDisplaySettings>) => void;
}

const Ctx = createContext<SettingsCtx>({
  settings: DEFAULT_SETTINGS,
  update: () => {},
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<QuoteDisplaySettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  const update = (patch: Partial<QuoteDisplaySettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  };

  return <Ctx.Provider value={{ settings, update }}>{children}</Ctx.Provider>;
}

export function useQuoteSettings() {
  return useContext(Ctx);
}
