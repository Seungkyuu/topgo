"use client";

import { SettingsProvider } from "./settings-context";
import { ThemeProvider } from "./theme-context";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <SettingsProvider>{children}</SettingsProvider>
    </ThemeProvider>
  );
}
