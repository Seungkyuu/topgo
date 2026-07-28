import { describe, it, expect } from "vitest";
import { calcMeritzDomesticRental } from "../rental";

/**
 * 메리츠 국산차 장기렌트 — 엑셀 `견적조건`/`렌트_입력시트` 저장값 골든케이스.
 * 국산 35,000,000 / 36개월 / 잔가율 0.7 → 잔가 24,500,000
 * 원금 30,175,588.5 / 금리 5.2% / 공제 700,000
 * 자동차세 2,400 / 보험 51,700 / 정비 38,200
 *  → 금융분 355,130 / 공급가 448,700 / 부가세 44,870 / 월 493,570
 */
describe("메리츠 국산차 장기렌트 — 골든 케이스", () => {
  const q = calcMeritzDomesticRental({
    principal: 30_175_588.545454547,
    residualValue: 24_500_000,
    annualRate: 0.052,
    termMonths: 36,
    monthlyVehicleTax: 2_400,
    monthlyInsurance: 51_700,
    monthlyMaintenance: 38_200,
    financeDeduction: 700_000,
  });

  it("금융분 = 355,130 (M48, 오차 0)", () => expect(q.financePortion).toBe(355_130));
  it("공급가 = 448,700 (ROUNDUP 448,630 → -2)", () => expect(q.supplyPrice).toBe(448_700));
  it("부가세 = 44,870", () => expect(q.vat).toBe(44_870));
  it("★ 월 렌트료 = 493,570 (공급가+부가세, 오차 0)", () =>
    expect(q.monthlyPayment).toBe(493_570));
});

describe("메리츠 국산차 장기렌트 — 보험 별도(기본)", () => {
  it("보험 0이면 공급가에서 보험분이 빠진다", () => {
    const q = calcMeritzDomesticRental({
      principal: 30_175_588.545454547,
      residualValue: 24_500_000,
      annualRate: 0.052,
      termMonths: 36,
      monthlyVehicleTax: 2_400,
      monthlyMaintenance: 38_200,
      financeDeduction: 700_000,
    });
    // 448,630 - 51,700 = 396,930 → ROUNDUP(-2) = 396,900... 실제 396,930→397,000
    expect(q.supplyPrice).toBeLessThan(448_700);
    expect(q.monthlyPayment).toBeGreaterThan(0);
  });
});
