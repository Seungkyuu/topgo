import { describe, it, expect } from "vitest";
import { calcOrixOperatingLease } from "../operating-lease";
import { excelPmt, roundUp, roundDown } from "../../finance";

/**
 * 골든 케이스 — 실제 오릭스 운용리스 엑셀의 저장 당시 계산값에서 추출.
 * 모델: S 500 4M / 차량가 213,600,000 / 48개월 / 금리 5.2% / 잔가율 45% / 보증금율 30%
 * 엑셀 실측: 월리스료 3,171,600원, 이용금액 227,292,720, 보증금 64,080,000, 잔가 96,120,000
 */
describe("오릭스 운용리스 엔진 — 골든 케이스 (S 500 4M)", () => {
  const r = calcOrixOperatingLease({
    vehiclePrice: 213_600_000,
    termMonths: 48,
    annualRate: 0.052,
    residualRate: 0.45,
    depositRate: 0.3,
  });

  it("과세표준 = 194,181,800", () => expect(r.taxBase).toBe(194_181_800));
  it("취득세 = 13,592,720", () => expect(r.acquisitionTax).toBe(13_592_720));
  it("이용금액 = 227,292,720", () => expect(r.financedAmount).toBe(227_292_720));
  it("보증금 = 64,080,000", () => expect(r.deposit).toBe(64_080_000));
  it("잔가 = 96,120,000", () => expect(r.residualValue).toBe(96_120_000));
  it("★ 월 리스료 = 3,171,600 (엑셀과 오차 0)", () =>
    expect(r.monthlyPayment).toBe(3_171_600));
});

describe("Excel 호환 함수", () => {
  it("ROUNDDOWN(213600000/1.1, -2) = 194,181,800", () =>
    expect(roundDown(213_600_000 / 1.1, -2)).toBe(194_181_800));
  it("ROUNDUP(3171553.48, -2) = 3,171,600", () =>
    expect(roundUp(3_171_553.48, -2)).toBe(3_171_600));
  it("PMT: rate=0 이면 단순 분할", () =>
    expect(excelPmt(0, 10, -1000, 0)).toBeCloseTo(100));
});
