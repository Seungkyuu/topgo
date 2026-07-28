import { describe, it, expect } from "vitest";
import { quoteShinhanRental, quoteShinhanRentalByModel } from "../rental";

/**
 * 신한 장기렌트 — 엑셀 `렌터카_일반` 시트 저장값(2607_V1) 골든케이스.
 * BMW 120i sport / 50,000,000 / 60개월 / 잔가율 50% / 고객금리 7.1%
 * 배기량 1998cc: 자동차세 37,960/년, 보험료 1,349,600/년, 분담금 15,000, 정비 4,770/월
 * → 취득원가 47,342,525 / 잔가 22,730,000 / 잔가보장수수료 750,000
 *   표시금리 7.6% / 월 렌트료(F22) 836,000원
 */
describe("신한 장기렌트 — 골든 케이스 (BMW 120i sport)", () => {
  const q = quoteShinhanRental({
    vehiclePrice: 50_000_000,
    termMonths: 60,
    residualRate: 0.5,
    annualVehicleTax: 37_960,
    annualInsurance: 1_349_600,
    allocationFee: 15_000,
    monthlyMaintenance: 4_770,
  });

  it("공급가 = 45,454,545 (AZ26)", () => expect(q.supplyPrice).toBe(45_454_545));
  it("취득원가 = 47,342,525 (BA48)", () => expect(q.acquisitionCost).toBe(47_342_525));
  it("잔가 = 22,730,000 (BH6)", () => expect(q.residualValue).toBe(22_730_000));
  it("잔가보장수수료 = 750,000 (BD22)", () => expect(q.guaranteeFee).toBe(750_000));
  it("기본 고객금리 = 7.1% (60개월 가산 포함)", () => expect(q.annualRate).toBe(0.071));
  it("표시금리 = 7.6% (BH18, RATE 역산)", () => expect(q.displayRate).toBe(0.076));
  it("공급가액(월) = 760,000 (BI4)", () => expect(q.monthlySupply).toBe(760_000));
  it("★ 월 렌트료 = 836,000 (F22, 오차 0)", () => expect(q.monthlyPayment).toBe(836_000));
});

describe("신한 장기렌트 — 고객금리 직접 지정 시 그대로 사용", () => {
  it("annualRate 지정 시 기본금리 계산을 건너뜀", () => {
    const q = quoteShinhanRental({
      vehiclePrice: 50_000_000,
      termMonths: 60,
      residualRate: 0.5,
      annualRate: 0.071,
    });
    expect(q.annualRate).toBe(0.071);
    expect(q.monthlySupply).toBe(638_300); // 보험·자동차세·정비 0 시나리오
    expect(q.monthlyPayment).toBe(702_130); // 부가세 포함
  });
});

describe("신한 장기렌트 — 36개월(60개월 가산 없음)", () => {
  it("기본금리는 60개월 가산 0.3%가 빠져 6.8%", () => {
    const q = quoteShinhanRental({
      vehiclePrice: 50_000_000,
      termMonths: 36,
      residualRate: 0.6,
    });
    expect(q.annualRate).toBe(0.068);
    expect(q.monthlyPayment).toBeGreaterThan(0);
  });
});

describe("신한 장기렌트 — 모델 자동조회 (차량모델기준 515개)", () => {
  it("BMW 120i sport / 60개월 → 마스터 차량가·잔가율 자동 적용", () => {
    const q = quoteShinhanRentalByModel({ model: "BMW 120i sport", termMonths: 60 });
    expect(q.vehiclePrice).toBe(47_300_000);
    expect(q.residualRate).toBe(0.5);
    expect(q.monthlyPayment).toBe(664_400);
  });

  it("잔가율 직접 지정 시 마스터 값 대신 사용", () => {
    const q = quoteShinhanRentalByModel({
      model: "BMW 120i sport",
      termMonths: 60,
      residualRate: 0.4,
    });
    expect(q.residualRate).toBe(0.4);
  });

  it("미등록 모델 → 모델 미연동 에러", () => {
    expect(() =>
      quoteShinhanRentalByModel({ model: "존재하지않는모델", termMonths: 60 }),
    ).toThrow("모델 미연동");
  });

  it("마스터에 없는 기간(예: 12개월) → 잔가율 미등록 에러", () => {
    expect(() =>
      quoteShinhanRentalByModel({ model: "BMW 120i sport", termMonths: 12 }),
    ).toThrow("해당 기간 잔가율 미등록");
  });
});
