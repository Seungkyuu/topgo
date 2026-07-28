/**
 * 예산 기반 차량 추천 — "월 예산으로 시작" 흐름의 계산부.
 *
 * v3: 통합 차량 인덱스 기반. 각 차량의 ref(소스 연결)별로 정확한 라벨·가격으로
 * 견적을 내고, 최저 월 납부액이 예산 이하인 차량을 예산에 가까운 순으로 돌려준다.
 * 금융사명은 결과 화면 전까지 노출하지 않으므로 여기서도 반환하지 않는다.
 *
 * 기준 조건(고객이 아직 세부 조건을 안 정한 단계): 보증금 30%, 선납 0, 연 2만km.
 */

import { type DealType } from "./capitals";
import {
  buildVehicleIndex,
  dealsForIndexed,
  quoteIndexed,
  type IndexedVehicle,
} from "./vehicle-index";

export const RECOMMEND_DEFAULTS = {
  depositRate: 0.3,
  annualMileageKm: 20_000,
} as const;

/**
 * 예산 추천이 실제로 계산할 수 있는 상품들 — 인덱스에 연결된 소스들이 계산하는
 * 상품의 합집합. UI는 이 목록만 선택지로 보여준다(빈 결과 거짓 응답 방지).
 */
export const RECOMMENDABLE_DEALS: DealType[] = (() => {
  const deals = new Set<DealType>();
  for (const v of buildVehicleIndex()) {
    dealsForIndexed(v).forEach((d) => deals.add(d));
  }
  return (["operatingLease", "financeLease", "longTermRental"] as DealType[]).filter((d) =>
    deals.has(d),
  );
})();

export interface Recommendation {
  vehicle: IndexedVehicle;
  /** 그 차량의 최저 월 납부액 (어느 금융사인지는 비교 화면에서 공개) */
  monthlyPayment: number;
}

export function recommendByBudget(
  monthlyBudget: number,
  deal: DealType,
  termMonths: number,
  limit = 12,
): Recommendation[] {
  if (monthlyBudget <= 0) return [];

  const out: Recommendation[] = [];
  for (const vehicle of buildVehicleIndex()) {
    if (!dealsForIndexed(vehicle).includes(deal)) continue;

    const rows = quoteIndexed(vehicle, deal, {
      termMonths,
      annualMileageKm: RECOMMEND_DEFAULTS.annualMileageKm,
      depositRate: RECOMMEND_DEFAULTS.depositRate,
      prepayment: 0,
    });
    const payments = rows
      .filter((r) => r.available && typeof r.monthlyPayment === "number" && r.monthlyPayment! > 0)
      .map((r) => r.monthlyPayment!);
    if (payments.length === 0) continue;

    const best = Math.min(...payments);
    if (best > monthlyBudget) continue;
    out.push({ vehicle, monthlyPayment: best });
  }

  // 예산에 가까운(비싼) 순 — "이 예산이면 이 정도까지 탈 수 있다"를 먼저 보여준다
  out.sort((a, b) => b.monthlyPayment - a.monthlyPayment);
  return out.slice(0, limit);
}
