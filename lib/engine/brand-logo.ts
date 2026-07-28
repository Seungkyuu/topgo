import brandLogosJson from "./data/brand-logos.json";

const BRAND_LOGOS: Record<string, string> = brandLogosJson;

/** 겟챠 브랜드 로고(정사각 트리밍 버전) — 없으면 undefined(모노그램 폴백) */
export function logoForBrand(brand: string): string | undefined {
  return BRAND_LOGOS[brand];
}
