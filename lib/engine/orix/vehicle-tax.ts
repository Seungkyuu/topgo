/**
 * 자동차세(승용 비영업용) 산정.
 *
 * 엑셀 `운용리스` 시트 자동차세 표(AX8:BB…)를 이식:
 *   세율(원/cc, 지방교육세 30% 포함): ≤1000cc 104, ≤1600cc 182, 초과 260
 *   자동차세(연) BB8 = ROUNDDOWN(배기량 × 세율, -1)
 *   자동차세(월) P26 = ROUNDUP(연자동차세 / 12, -2)
 *
 * 검증: S 500 4M(3,982cc) → 1,035,320/년, 86,300/월 (엑셀 실측).
 */

import { roundUp, roundDown } from "../finance";

/**
 * 전기차 등 배기량이 없는 차량의 연 자동차세(비영업용 승용, 지방교육세 포함).
 * ⚠ 정책·시트로 재확인 필요 — 잠정값.
 */
export const ORIX_EV_ANNUAL_TAX = 130_000;

function taxRatePerCc(displacementCc: number): number {
  if (displacementCc <= 1000) return 104;
  if (displacementCc <= 1600) return 182;
  return 260;
}

/** 연 자동차세. 배기량이 없으면(전기차) 잠정 EV 정액. */
export function orixAnnualVehicleTax(displacementCc?: number): number {
  if (!displacementCc || displacementCc <= 0) return ORIX_EV_ANNUAL_TAX;
  return roundDown(displacementCc * taxRatePerCc(displacementCc), -1);
}

/** 월 자동차세 = ROUNDUP(연/12, -2). */
export function orixMonthlyVehicleTax(displacementCc?: number): number {
  return roundUp(orixAnnualVehicleTax(displacementCc) / 12, -2);
}
