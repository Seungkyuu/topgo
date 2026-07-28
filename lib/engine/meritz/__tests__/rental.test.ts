import { describe, it, expect } from "vitest";
import { calcMeritzRental } from "../rental";

/**
 * 골든 케이스 — 실제 메리츠 렌터카 엑셀의 저장 당시 계산값.
 * 차량가 45,000,000 / 36개월 / 잔가율 57% / 금리 6%
 * 원금 39,431,000, 잔가 25,650,000, 자동차세 2,000, 보험 58,400, 정비 106,000
 * 엑셀 실측: 금융분 606,800 / 공급가 774,400 / 부가세 77,440 / 매회납부 851,840
 */
describe("메리츠 렌터카 엔진 — 골든 케이스 (차량가 4,500만, 36개월)", () => {
  const r = calcMeritzRental({
    principal: 39_431_000,
    residualValue: 25_650_000,
    annualRate: 0.06,
    termMonths: 36,
    monthlyVehicleTax: 2_000,
    monthlyInsurance: 58_400,
    monthlyMaintenance: 106_000,
  });

  it("금융분 = 606,800", () => expect(r.financePortion).toBe(606_800));
  it("공급가 = 774,400", () => expect(r.supplyPrice).toBe(774_400));
  it("부가세 = 77,440", () => expect(r.vat).toBe(77_440));
  it("★ 매회납부 렌트료(월, VAT포함) = 851,840", () =>
    expect(r.monthlyPayment).toBe(851_840));
});
