/**
 * 오릭스 잔가율 자동 조회 (최대잔가 정책).
 *
 * 엑셀 `운용리스` 시트의 최대잔가 산출을 이식:
 *   X5 = INDEX(잔가율표 AA110:AD238, MATCH(모델), MATCH(기간)) + 주행거리조정(AB18)
 *   BN22("최대잔가") = X5
 *
 * 잔가율표는 `data/residual-rates.json` 으로 추출(모델 93종, 기간 60/48/36개월).
 * 담당자가 수동으로 잔가율을 넣는 대신, 모델+기간+약정주행거리로 최대잔가를 자동 조회한다.
 */

import residualRates from "./data/residual-rates.json";

const TABLE = residualRates as Record<string, Record<string, number>>;

/**
 * 약정 주행거리(연간 km)별 잔가율 조정.
 * 엑셀: 10,000km → +3%, 20,000km → 0, 30,000km → −3%.
 */
export const ORIX_MILEAGE_ADJUSTMENT: Record<number, number> = {
  10000: 0.03,
  20000: 0,
  30000: -0.03,
};

export function isKnownOrixModel(model: string): boolean {
  return model in TABLE;
}

/**
 * 최대잔가율 조회 = 잔가율표(모델, 기간) + 약정주행거리 조정.
 * 표/기간/주행거리에 없으면 예외를 던진다(오발행 방지).
 */
export function resolveOrixResidualRate(
  model: string,
  termMonths: number,
  annualMileageKm = 20000,
): number {
  const row = TABLE[model];
  if (!row) throw new Error(`잔가율표에 없는 모델: ${model}`);

  const base = row[String(termMonths)];
  if (base === undefined) {
    throw new Error(`${model}: ${termMonths}개월 잔가율 없음 (지원: ${Object.keys(row).join("/")})`);
  }

  const adjustment = ORIX_MILEAGE_ADJUSTMENT[annualMileageKm];
  if (adjustment === undefined) {
    throw new Error(`지원하지 않는 약정주행거리: ${annualMileageKm}km/년`);
  }

  // 부동소수 잡음 제거 (0.47 + 0.03 = 0.5 등)
  return Math.round((base + adjustment) * 10000) / 10000;
}
