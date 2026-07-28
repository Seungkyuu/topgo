import { describe, it, expect } from "vitest";
import { quoteMeritzTeslaLease, findTeslaVehicle } from "../../meritz-tesla";
import { quoteMeritzBydLease, findBydVehicle } from "../../meritz-byd";

/**
 * 메리츠 전기차 운용리스 — 엑셀 `리스수식` AA48 저장값 골든케이스.
 * EV 취득세(7%−140만 감면), 수수료 10,000 고정, 자동차세 월포함(130,000/년→10,840).
 */
describe("메리츠 테슬라 운용리스 — 골든 (Model Y L AWD)", () => {
  const q = quoteMeritzTeslaLease({
    model: "Model Y L AWD <지원금>",
    vehiclePrice: 69_990_000,
    discount: 2_100_000,
    termMonths: 36,
    annualMileageKm: 20000,
    deliveryFee: 0,
    nonTaxableFee: 295_500,
  });
  it("이용금액 = 71,105,770", () => expect(q.acquisitionCost).toBe(71_105_770));
  it("잔가 = 38,698,000 (잔가율 0.57)", () => {
    expect(q.residualRate).toBe(0.57);
    expect(q.residualValue).toBe(38_698_000);
  });
  it("차량분 = 1,179,710 / 차세분 = 10,840", () => {
    expect(q.vehiclePortion).toBe(1_179_710);
    expect(q.vehicleTaxPortion).toBe(10_840);
  });
  it("★ 월리스료 = 1,190,550 (오차 0)", () => expect(q.monthlyPayment).toBe(1_190_550));
});

describe("메리츠 BYD 운용리스 — 골든 (Dolphin)", () => {
  const q = quoteMeritzBydLease({
    model: "BYD Dolphin",
    vehiclePrice: 24_500_000,
    termMonths: 36,
    annualMileageKm: 20000,
    deliveryFee: 0,
    nonTaxableFee: 0,
  });
  it("이용금액 = 24,659,090 (EV 취득세 159,090)", () =>
    expect(q.acquisitionCost).toBe(24_659_090));
  it("잔가 = 13,475,000 (잔가율 0.55)", () => {
    expect(q.residualRate).toBe(0.55);
    expect(q.residualValue).toBe(13_475_000);
  });
  it("★ 월리스료 = 418,770 (차량 407,930 + 차세 10,840, 오차 0)", () =>
    expect(q.monthlyPayment).toBe(418_770));
});

describe("보증금은 만기 환급금이라 늘어날수록 월 리스료가 내려가야 한다", () => {
  const base = {
    model: "Model Y L AWD <지원금>",
    vehiclePrice: 69_990_000,
    discount: 2_100_000,
    termMonths: 36,
    annualMileageKm: 20000,
  };
  it("보증금 0% > 10% > 30% 순으로 월 리스료가 낮아진다", () => {
    const d0 = quoteMeritzTeslaLease({ ...base, depositRate: 0 }).monthlyPayment;
    const d10 = quoteMeritzTeslaLease({ ...base, depositRate: 0.1 }).monthlyPayment;
    const d30 = quoteMeritzTeslaLease({ ...base, depositRate: 0.3 }).monthlyPayment;
    expect(d10).toBeLessThan(d0);
    expect(d30).toBeLessThan(d10);
  });
});

describe("EV 카탈로그 조회", () => {
  it("테슬라 Model Y 조회", () =>
    expect(findTeslaVehicle("Model Y L AWD <지원금>")?.annualTax).toBe(130_000));
  it("BYD Dolphin 조회", () =>
    expect(findBydVehicle("BYD Dolphin")?.annualTax).toBe(130_000));
  it("미등록 모델 → null", () =>
    expect(findTeslaVehicle("없는테슬라")).toBeNull());
});
