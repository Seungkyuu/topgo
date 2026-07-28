export interface QuoteDisplaySettings {
  /** 금리 고객 표시 */
  showRate: boolean;
  /** 잔가 고객 표시 */
  showResidual: boolean;
  /** 보증금 금액 고객 표시 */
  showDeposit: boolean;
  /** 이용금액(이용원가) 고객 표시 */
  showFinancedAmount: boolean;
  /** 고객 화면에 표시할 금융사 목록 (빈 배열 = 모두) */
  enabledCapitals: string[];
}

export const DEFAULT_SETTINGS: QuoteDisplaySettings = {
  showRate: false,
  showResidual: false,
  showDeposit: true,
  showFinancedAmount: false,
  enabledCapitals: [],
};

export const SETTINGS_KEY = "unidia_quote_settings";

export function loadSettings(): QuoteDisplaySettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: QuoteDisplaySettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}
