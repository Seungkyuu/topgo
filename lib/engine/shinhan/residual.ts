/**
 * 신한카드 오토리스 잔가율 산정.
 *
 * 엑셀 사슬:
 *   최대잔가율(AD25) = 잔가군표[모델.잔가군][기간] + 주행거리조정(AN15)
 *   주행거리조정: 1만km +4% / 2만km +2% / 3만km 0%(표 기준) / 4만km -3%
 *   하한(AN7:AN13): 12→54% 24→44% 36→34% 42→29% 44→29% 48→24% 60→20%
 *   적용잔가율(H17) = clamp(선택잔가율, 하한, 최대)
 *
 * 데이터: data/residual-groups.json (잔가군 76개 × 기간 7개), data/rates.json
 */

import groupsJson from "./data/residual-groups.json";
import ratesJson from "./data/rates.json";

type GroupMap = Record<string, Record<string, number> | string>;
const GROUPS = groupsJson as GroupMap;

const RATES = ratesJson as unknown as {
  mileageResidualAdj: Record<string, number>;
  residualFloorByTerm: Record<string, number>;
};

/** 약정 주행거리 → 잔가율 조정 (표는 3만km 기준) */
export function shinhanMileageAdjustment(annualMileageKm: number): number {
  if (annualMileageKm <= 10000) return RATES.mileageResidualAdj["10000"];
  if (annualMileageKm <= 20000) return RATES.mileageResidualAdj["20000"];
  if (annualMileageKm <= 30000) return RATES.mileageResidualAdj["30000"];
  return RATES.mileageResidualAdj["40000"];
}

/** 잔가군·기간·주행거리 → 최대잔가율. 데이터 없으면 null */
export function resolveShinhanMaxResidualRate(
  residualGroup: string,
  termMonths: number,
  annualMileageKm = 20000,
): number | null {
  const entry = GROUPS[residualGroup];
  if (!entry || typeof entry === "string") return null;
  const base = entry[String(termMonths)];
  if (base === undefined) return null;
  return Math.round((base + shinhanMileageAdjustment(annualMileageKm)) * 1e4) / 1e4;
}

/** 기간별 잔가율 하한 (미만 선택 불가) */
export function shinhanResidualFloor(termMonths: number): number | null {
  return RATES.residualFloorByTerm[String(termMonths)] ?? null;
}

/** 선택잔가율을 [하한, 최대]로 보정 (엑셀 H17) */
export function clampShinhanResidualRate(
  selected: number,
  residualGroup: string,
  termMonths: number,
  annualMileageKm = 20000,
): number | null {
  const max = resolveShinhanMaxResidualRate(residualGroup, termMonths, annualMileageKm);
  const floor = shinhanResidualFloor(termMonths);
  if (max === null || floor === null) return null;
  if (selected >= max) return max;
  if (selected <= floor) return floor;
  return selected;
}
