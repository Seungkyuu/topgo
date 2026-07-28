import realPricesImportJson from "./data/real-prices-import.json";
import importOfferKeyJson from "./data/import-offer-key.json";

const REAL_PRICES_IMPORT: Record<string, number> = realPricesImportJson;
const IMPORT_OFFER_KEY: Record<string, string> = importOfferKeyJson;

/**
 * 수입차 겟챠 실가격 조회. rawKey는 각 소스 카탈로그 JSON의 "원본 키"
 * 그대로여야 한다(match_import_prices.py가 그 키 기준으로 매칭했다) —
 * 오릭스는 vehicles.json 키, 신한은 "브랜드 모델명", 메리츠 수입차는
 * splitMeritzBrand 이전의 원본 키.
 *
 * 매칭이 없으면 fallback(캐피탈사 엑셀 자체 가격)을 그대로 쓴다. 현재
 * 매칭률은 약 27%(504/1855) — 벤츠·랜드로버·포르쉐·미니는 클래스 별칭
 * 테이블로 연결했고, 나머지 브랜드는 후속 작업이다.
 */
export function importRealPrice(rawKey: string, fallback: number): number {
  const real = REAL_PRICES_IMPORT[rawKey];
  return real !== undefined ? real : fallback;
}

/**
 * rawKey가 겟챠의 어떤 등급("브랜드|모델|등급")에 매칭됐는지 조회.
 * 오릭스·신한·메리츠 세 카탈로그가 같은 실차를 서로 다른 텍스트로
 * 표기해도, 셋 다 같은 겟챠 등급에 매칭됐다면 사실상 같은 차라는 뜻이다
 * — vehicle-index.ts가 이 값으로 소스 간 병합에 쓴다.
 */
export function importOfferKey(rawKey: string): string | undefined {
  return IMPORT_OFFER_KEY[rawKey];
}
