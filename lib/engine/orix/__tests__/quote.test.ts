import { describe, it, expect } from "vitest";
import { quoteOrixOperatingLease } from "../quote";

/**
 * 통합 견적 — 캡처 필드만으로 월납입 자동.
 * S 500 4M / 213,600,000 / 48개월 / 20,000km / 보증금 30% / 선납·선수 0
 *  → 잔가 자동 0.47, 금리 자동 5.2%, 월납입 3,091,300
 */
describe("오릭스 운용리스 통합 견적 (캡처 → 월납입 자동)", () => {
  const q = quoteOrixOperatingLease({
    model: "S 500 4M",
    vehiclePrice: 213_600_000,
    termMonths: 48,
    annualMileageKm: 20000,
    depositRate: 0.3,
  });

  it("최대잔가 자동 = 0.47", () => expect(q.residualRate).toBe(0.47));
  it("적용금리 자동 = 5.2%", () => expect(q.annualRate).toBe(0.052));
  it("★ 순수리스료 = 3,091,300 (엑셀 골든케이스)", () => expect(q.monthlyPayment).toBe(3_091_300));
  it("자동차세 미포함 시 총리스료 = 순수리스료", () =>
    expect(q.totalMonthlyPayment).toBe(3_091_300));
});

describe("운용리스 통합 견적 — 자동차세 포함 총리스료", () => {
  it("S 500 4M 자동차세 포함 → 총리스료 3,091,300 + 86,300 = 3,177,600", () => {
    const q = quoteOrixOperatingLease({
      model: "S 500 4M",
      vehiclePrice: 213_600_000,
      termMonths: 48,
      annualMileageKm: 20000,
      depositRate: 0.3,
      includeVehicleTax: true,
    });
    expect(q.monthlyVehicleTax).toBe(86_300);
    expect(q.totalMonthlyPayment).toBe(3_177_600);
  });
});

/**
 * 36m / 60m 시나리오 — 엑셀 미검증. 계산 오류 없음 및 범위 합리성만 확인.
 * TODO: 엑셀 36개월·60개월 시트 실측 후 정확한 기대값으로 교체.
 */
describe("운용리스 기간별 계산 (36m / 60m) — 엑셀 미검증 범위 테스트", () => {
  it("36개월: 계산 오류 없이 합리적 범위 (2,000,000~5,000,000)", () => {
    const q = quoteOrixOperatingLease({
      model: "S 500 4M",
      vehiclePrice: 213_600_000,
      termMonths: 36,
      annualMileageKm: 20000,
      depositRate: 0.3,
    });
    expect(q.monthlyPayment).toBeGreaterThan(2_000_000);
    expect(q.monthlyPayment).toBeLessThan(5_000_000);
  });

  it("60개월: 계산 오류 없이 합리적 범위 (1,500,000~4,000,000)", () => {
    const q = quoteOrixOperatingLease({
      model: "S 500 4M",
      vehiclePrice: 213_600_000,
      termMonths: 60,
      annualMileageKm: 20000,
      depositRate: 0.3,
    });
    expect(q.monthlyPayment).toBeGreaterThan(1_500_000);
    expect(q.monthlyPayment).toBeLessThan(4_000_000);
  });
});
