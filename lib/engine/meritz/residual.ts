/**
 * 메리츠 운용리스 잔가 산정 — 엑셀 `잔가` 시트 이식.
 *
 * 잔가사(West/AJ/APS/VGS/자체) 5곳을 비교해 최대잔가를 고르는 구조:
 *   기본잔가  = 매트릭스[잔가군][기간] + 주행거리조정(3만km: -4%, 자체 -15%)
 *   고잔가    = 기본 + 8%(West/AJ/APS) / +6%(VGS)  [기간 12~60 · 주행 2만 이하 · 고잔가불가 아님]
 *              + AJ·자체 모델별 추가(주행 2만 미만 / 1.5만 미만)
 *   계약잔가  = max(잔가사별 고잔가)
 *   잔가보장수수료 = 계약잔가를 달성 가능한 잔가사 중 최저 수수료
 *     (구간 = 계약잔가 - 기본잔가, 1%p당 1구간, 수수료표에서 조회)
 */

import leaseDataJson from "./data/lease-data.json";
import type { MeritzVehicle } from "./vehicle";

const DATA = leaseDataJson as unknown as {
  providerMatrices: Record<
    string,
    { rates: Record<string, Record<string, number>>; highResidualBonus: number }
  >;
  guaranteeFees: Record<string, Record<string, number | null>>;
  residualFloorByTerm: Record<string, number>;
  mileageAdj: Record<string, number>;
  mileageAdjSelf: Record<string, number>;
};

function mileageBand(km: number): string {
  if (km <= 10000) return "10000";
  if (km <= 15000) return "15000";
  if (km <= 20000) return "20000";
  return "30000";
}

export interface MeritzResidualResult {
  /** 계약잔가율 (최대잔가) */
  residualRate: number;
  /** 잔가보장수수료 (원) */
  guaranteeFee: number;
  /** 선택된 잔가사 */
  provider: string;
}

/** 잔가사별 (기본잔가, 최대잔가) 계산 */
function providerRates(
  vehicle: MeritzVehicle,
  termMonths: number,
  annualMileageKm: number,
): { provider: string; base: number; max: number }[] {
  const band = mileageBand(annualMileageKm);
  const out: { provider: string; base: number; max: number }[] = [];
  for (const [provider, group] of Object.entries(vehicle.groups)) {
    const matrix = DATA.providerMatrices[provider];
    if (!matrix) continue;
    const raw = matrix.rates[group]?.[String(termMonths)];
    if (raw === undefined || raw <= 0) continue;
    const adj = provider === "self" ? DATA.mileageAdjSelf[band] : DATA.mileageAdj[band];
    const base = raw + adj;
    let max = base;
    const hrAllowed =
      !vehicle.highResidualBan && annualMileageKm <= 20000 && termMonths <= 60;
    if (hrAllowed) {
      max += matrix.highResidualBonus;
      if (provider === "aj" || provider === "self") {
        if (annualMileageKm < 20000) max += vehicle.hrBonus15k;
        if (annualMileageKm < 15000) max += vehicle.hrBonus10k;
      }
    }
    out.push({
      provider,
      base: Math.round(base * 1e4) / 1e4,
      max: Math.round(max * 1e4) / 1e4,
    });
  }
  return out;
}

/** 계약잔가(최대) + 최저 잔가보장수수료. 산정 불가면 null */
export function resolveMeritzResidual(
  vehicle: MeritzVehicle,
  termMonths: number,
  annualMileageKm: number,
): MeritzResidualResult | null {
  const rates = providerRates(vehicle, termMonths, annualMileageKm);
  if (rates.length === 0) return null;

  const contract = Math.max(...rates.map((r) => r.max));
  let best: MeritzResidualResult | null = null;
  for (const r of rates) {
    if (r.max < contract) continue;
    const band = Math.round((contract - r.base) * 100);
    let fee: number | null = 0;
    if (band > 0) {
      fee = DATA.guaranteeFees[r.provider]?.[String(band)] ?? null;
      if (fee === null) continue; // 해당 구간 수수료 없음 → 이 잔가사로는 불가
    }
    if (best === null || fee < best.guaranteeFee) {
      best = { residualRate: contract, guaranteeFee: fee, provider: r.provider };
    }
  }
  return best;
}

/** 기간별 최소잔가율 */
export function meritzResidualFloor(termMonths: number): number | null {
  return DATA.residualFloorByTerm[String(termMonths)] ?? null;
}
