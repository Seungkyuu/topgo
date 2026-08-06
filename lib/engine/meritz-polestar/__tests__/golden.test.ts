import { describe, expect, it } from "vitest";
import { quoteMeritzPolestarLease } from "../lease";

/**
 * 메리츠 Polestar 전용 운용리스 — 엑셀 `운용리스 내부` 실제 저장값 검증.
 * Polestar4 Long Range Dual Motor + PLDC (3차시) / 차량가 70,000,000
 * 할인율 13% + 추가할인 2,200,000 → 차량가최종 58,700,000 / 36개월 / IRR 7.9%
 */
describe("메리츠 Polestar 운용리스 — 골든 케이스", () => {
  const base = {
    model: "Polestar4 Long Range Dual Motor + PLDC (3차시)",
    vehiclePrice: 70_000_000,
    termMonths: 36,
  };

  it("취득세 = 2,335,450(등록세 7%감면 후 EV 140만 추가감면)", () => {
    const q = quoteMeritzPolestarLease(base);
    expect(q.acquisitionTax).toBe(2_335_450);
  });

  it("취득원가 = 61,309,850", () => {
    const q = quoteMeritzPolestarLease(base);
    expect(q.acquisitionCost).toBe(61_309_850);
  });

  it("잔가율 65% → 잔가 38,155,000", () => {
    const q = quoteMeritzPolestarLease(base);
    expect(q.residualRate).toBe(0.65);
    expect(q.residualValue).toBe(38_155_000);
  });

  it("★ 월리스료 = 976,100 (오차 0)", () => {
    const q = quoteMeritzPolestarLease(base);
    expect(q.monthlyPayment).toBe(976_100);
  });

  it("48개월 → 잔가율 60%, 60개월 → 잔가율 55%", () => {
    expect(quoteMeritzPolestarLease({ ...base, termMonths: 48 }).residualRate).toBe(0.6);
    expect(quoteMeritzPolestarLease({ ...base, termMonths: 60 }).residualRate).toBe(0.55);
  });

  it("모델 미연동은 명확히 에러", () => {
    expect(() =>
      quoteMeritzPolestarLease({ ...base, model: "존재하지않는모델" }),
    ).toThrow("모델 미연동");
  });

  it("36/48/60개월 외에는 잔가율 미등록 에러", () => {
    expect(() => quoteMeritzPolestarLease({ ...base, termMonths: 24 })).toThrow(
      "잔가율 미등록",
    );
  });

  it("보증금을 지정하면 월리스료가 낮아진다", () => {
    const noDeposit = quoteMeritzPolestarLease(base);
    const withDeposit = quoteMeritzPolestarLease({ ...base, depositRate: 0.3 });
    expect(withDeposit.monthlyPayment).toBeLessThan(noDeposit.monthlyPayment);
  });
});
