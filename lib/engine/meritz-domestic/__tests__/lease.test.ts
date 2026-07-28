import { describe, it, expect } from "vitest";
import { quoteMeritzDomesticLease } from "../lease";
import { findDomesticVehicle, resolveDomesticResidual } from "../vehicle";

/**
 * 메리츠 국산차 운용리스 — 엑셀 `리스수식` AA48 저장값 골든케이스.
 * 더 뉴 그랜저 1.6T HEV / 판매가 51,430,000 / 할인 1,001,000
 * 60개월 / 2만km / 탁송 350,000 + 비과세 359,500(엑셀 L2)
 *  → 원금 50,429,000 / 취득원가 54,369,890 / 잔가 27,232,000 / 월 703,050
 */
describe("메리츠 국산차 운용리스 — 골든 케이스 (그랜저)", () => {
  const q = quoteMeritzDomesticLease({
    model: "더 뉴 그랜저 1.6T HEV",
    vehiclePrice: 51_430_000,
    discount: 1_001_000,
    termMonths: 60,
    annualMileageKm: 20000,
    deliveryFee: 350_000,
    nonTaxableFee: 359_500, // 엑셀 L2 재현
  });

  it("원금 = 50,429,000 (W2)", () => expect(q.principal).toBe(50_429_000));
  it("취득원가(이용금액) = 54,369,890 (W15)", () =>
    expect(q.acquisitionCost).toBe(54_369_890));
  it("잔가 = 27,232,000 (AA29)", () => expect(q.residualValue).toBe(27_232_000));
  it("잔가율 자동 = 0.54 (60개월·2만km)", () => expect(q.residualRate).toBe(0.54));
  it("금리 = 6%", () => expect(q.annualRate).toBe(0.06));
  it("★ 월리스료 = 703,050 (AA48, 오차 0)", () =>
    expect(q.monthlyPayment).toBe(703_050));
});

describe("국산차 잔가율 조회 (차량정보 표)", () => {
  const g = findDomesticVehicle("더 뉴 그랜저 1.6T HEV")!;
  it("모델 조회 — 현대", () => expect(g.brand).toBe("현대"));
  it("60개월·2만km → 0.54", () =>
    expect(resolveDomesticResidual(g, 60, 20000)).toBe(0.54));
  it("60개월·1만km → 표의 10,000km 구간", () =>
    expect(resolveDomesticResidual(g, 60, 10000)).toBeGreaterThan(0.54));
});

describe("국산차 — 사업 규칙(제품 기본값: 탁송 350,000, 비과세 0)", () => {
  it("비과세 미포함(제품 기본) 시 엑셀과 이용금액이 359,500 작아짐", () => {
    const q = quoteMeritzDomesticLease({
      model: "더 뉴 그랜저 1.6T HEV",
      vehiclePrice: 51_430_000,
      discount: 1_001_000,
      termMonths: 60,
      annualMileageKm: 20000,
    });
    expect(q.acquisitionCost).toBe(54_369_890 - 359_500);
    expect(q.monthlyPayment).toBeGreaterThan(0);
  });

  it("미등록 모델 → 모델 미연동", () => {
    expect(() =>
      quoteMeritzDomesticLease({
        model: "없는국산차",
        vehiclePrice: 30_000_000,
        termMonths: 60,
        annualMileageKm: 20000,
      }),
    ).toThrow("모델 미연동");
  });
});

describe("보증금은 만기 환급금이라 늘어날수록 월 리스료가 내려가야 한다", () => {
  const base = {
    model: "더 뉴 그랜저 1.6T HEV",
    vehiclePrice: 51_430_000,
    discount: 1_001_000,
    termMonths: 60,
    annualMileageKm: 20000,
  };
  it("보증금 0% > 10% > 30% 순으로 월 리스료가 낮아진다", () => {
    const d0 = quoteMeritzDomesticLease({ ...base, depositRate: 0 }).monthlyPayment;
    const d10 = quoteMeritzDomesticLease({ ...base, depositRate: 0.1 }).monthlyPayment;
    const d30 = quoteMeritzDomesticLease({ ...base, depositRate: 0.3 }).monthlyPayment;
    expect(d10).toBeLessThan(d0);
    expect(d30).toBeLessThan(d10);
  });
});
