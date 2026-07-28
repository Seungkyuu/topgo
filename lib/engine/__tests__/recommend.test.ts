import { describe, expect, it } from "vitest";
import { recommendByBudget, RECOMMEND_DEFAULTS, RECOMMENDABLE_DEALS } from "../recommend";
import { quoteIndexed } from "../vehicle-index";

describe("recommendByBudget (통합 인덱스 기반)", () => {
  it("예산 이하 차량만, 예산에 가까운 순으로 돌려준다", () => {
    const recs = recommendByBudget(1_500_000, "operatingLease", 48);
    expect(recs.length).toBeGreaterThan(0);
    for (const r of recs) {
      expect(r.monthlyPayment).toBeLessThanOrEqual(1_500_000);
      expect(r.monthlyPayment).toBeGreaterThan(0);
    }
    for (let i = 1; i < recs.length; i++) {
      expect(recs[i].monthlyPayment).toBeLessThanOrEqual(recs[i - 1].monthlyPayment);
    }
  });

  it("추천 월 납부액은 동일 조건 quoteIndexed의 최저값과 일치한다", () => {
    const [top] = recommendByBudget(1_000_000, "operatingLease", 48, 1);
    expect(top).toBeDefined();
    const rows = quoteIndexed(top.vehicle, "operatingLease", {
      termMonths: 48,
      annualMileageKm: RECOMMEND_DEFAULTS.annualMileageKm,
      depositRate: RECOMMEND_DEFAULTS.depositRate,
      prepayment: 0,
    });
    const best = Math.min(
      ...rows
        .filter((r) => r.available && typeof r.monthlyPayment === "number")
        .map((r) => r.monthlyPayment!),
    );
    expect(best).toBe(top.monthlyPayment);
  });

  it("예산 0 이하면 빈 배열", () => {
    expect(recommendByBudget(0, "operatingLease", 48)).toEqual([]);
    expect(recommendByBudget(-100, "operatingLease", 48)).toEqual([]);
  });

  it("장기렌트도 추천 가능 (신한 렌터카 인덱스 연결)", () => {
    expect(RECOMMENDABLE_DEALS).toContain("longTermRental");
    const recs = recommendByBudget(2_000_000, "longTermRental", 48);
    expect(recs.length).toBeGreaterThan(0);
    for (const r of recs) {
      expect(r.monthlyPayment).toBeLessThanOrEqual(2_000_000);
    }
  });
});
