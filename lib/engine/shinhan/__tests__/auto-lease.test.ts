import { describe, it, expect } from "vitest";
import { calcShinhanAutoLease } from "../auto-lease";

/**
 * 골든 케이스 — 실제 신한 오토리스 엑셀(오토리스(운용&금융)_CA용)의 저장값.
 * 차종: Cayenne Coupe 3.0 / 차량가 148,400,000 / 60개월 / 운용리스
 * 취득원가 178,631,200, 부대 7,145,248, 잔가 67,090,000, 보증금 16,780,000, 금리 5.9%
 * 엑셀 실측(AR17): 월리스료 2,537,360
 */
describe("신한 오토리스(운용) 엔진 — 골든 케이스 (Cayenne Coupe)", () => {
  it("★ 월리스료 = 2,537,360 (엑셀 AR17, 오차 0)", () => {
    const r = calcShinhanAutoLease({
      acquisitionCost: 178_631_200,
      incidentalCost: 7_145_248,
      residualValue: 67_090_000,
      deposit: 16_780_000,
      annualRate: 0.059,
      termMonths: 60,
    });
    expect(r.monthlyPayment).toBe(2_537_360);
  });
});
