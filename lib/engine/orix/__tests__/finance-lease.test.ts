import { describe, it, expect } from "vitest";
import { calcOrixFinanceLease } from "../finance-lease";

/**
 * 골든 케이스 — 실제 오릭스 금융리스 엑셀의 저장 당시 계산값.
 * 모델: G 400d / 차량가 181,600,000 / 60개월 / 금리 5.5% / 선납 100,000,000 (취득세 고객별도부담)
 * 엑셀 실측: 이용금액 81,600,000, 월리스료 1,558,700
 */
describe("오릭스 금융리스 엔진 — 골든 케이스 (G 400d)", () => {
  const r = calcOrixFinanceLease({
    vehiclePrice: 181_600_000,
    termMonths: 60,
    annualRate: 0.055,
    prepayment: 100_000_000,
  });

  it("이용금액 = 81,600,000", () => expect(r.financedAmount).toBe(81_600_000));
  it("★ 월 리스료 = 1,558,700 (엑셀과 오차 0)", () =>
    expect(r.monthlyPayment).toBe(1_558_700));
});
