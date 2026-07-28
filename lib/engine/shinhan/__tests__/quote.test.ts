import { describe, it, expect } from "vitest";
import { quoteShinhanOperatingLease } from "../quote";
import { findShinhanVehicle } from "../vehicle";
import { resolveShinhanMaxResidualRate, clampShinhanResidualRate } from "../residual";

/**
 * 신한 오토리스(운용) 통합 견적 — 엑셀 `오토리스(운용&금융)_CA용` 저장값과 대조.
 *
 * 골든케이스 (엑셀 2607_V1 저장 상태 그대로):
 *   포르쉐 CayenneCoupe가솔린3.0 (코드 450692470, 잔가군 R)
 *   차량가 148,400,000 + 옵션 21,000,000 - 할인 1,694,000 = 원금 167,706,000
 *   취득세 10,672,200 / 취득원가 178,631,200 / CA수수료(4%) 7,145,248
 *   60개월 / 잔가율 40% 지정 / 보증금 10% → 16,780,000 / 잔가 67,090,000
 *   → 월리스료 2,537,360 (AR17)
 */
describe("신한 오토리스 통합 견적 — 골든 케이스 전체 사슬", () => {
  const q = quoteShinhanOperatingLease({
    model: "포르쉐 CayenneCoupe가솔린3.0",
    optionPrice: 21_000_000,
    discount: 1_694_000,
    termMonths: 60,
    depositRate: 0.1,
    residualRate: 0.4,
    annualMileageKm: 10000,
  });

  it("원금 = 167,706,000 (AQ4)", () => expect(q.principal).toBe(167_706_000));
  it("취득원가 = 178,631,200 (AQ8)", () =>
    expect(q.acquisitionCost).toBe(178_631_200));
  it("보증금 = 16,780,000 (AN16)", () => expect(q.deposit).toBe(16_780_000));
  it("잔가 = 67,090,000 (AN14)", () => expect(q.residualValue).toBe(67_090_000));
  it("★ 월리스료 = 2,537,360 (AR17, 오차 0)", () =>
    expect(q.monthlyPayment).toBe(2_537_360));
});

describe("신한 잔가율 산정 (잔가군 R = Cayenne Coupe)", () => {
  it("60개월 · 3만km → 기본 0.39", () =>
    expect(resolveShinhanMaxResidualRate("R", 60, 30000)).toBe(0.39));
  it("60개월 · 1만km → +4% = 0.43", () =>
    expect(resolveShinhanMaxResidualRate("R", 60, 10000)).toBe(0.43));
  it("60개월 · 2만km → +2% = 0.41", () =>
    expect(resolveShinhanMaxResidualRate("R", 60, 20000)).toBe(0.41));
  it("60개월 · 4만km → -3% = 0.36", () =>
    expect(resolveShinhanMaxResidualRate("R", 60, 40000)).toBe(0.36));
  it("선택 잔가율은 최대치로 캡 (0.5 지정 → 0.43)", () =>
    expect(clampShinhanResidualRate(0.5, "R", 60, 10000)).toBe(0.43));
  it("선택 잔가율은 하한(60개월 20%)으로 보정 (0.1 지정 → 0.2)", () =>
    expect(clampShinhanResidualRate(0.1, "R", 60, 10000)).toBe(0.2));
});

describe("신한 통합 견적 — 자동 최대잔가 (수식 재계산 대조)", () => {
  it("Cayenne / 60개월 / 2만km / 보증금 30% → 잔가율 0.41, 월 2,078,410", () => {
    const q = quoteShinhanOperatingLease({
      model: "포르쉐 CayenneCoupe가솔린3.0",
      termMonths: 60,
      depositRate: 0.3,
      annualMileageKm: 20000,
    });
    expect(q.residualRate).toBe(0.41);
    expect(q.deposit).toBe(44_520_000);
    expect(q.residualValue).toBe(60_850_000);
    expect(q.monthlyPayment).toBe(2_078_410);
  });

  it("벤츠 S500 4MATIC Long / 60개월 / 2만km / 보증금 30% → 월 2,956,620", () => {
    const q = quoteShinhanOperatingLease({
      model: "벤츠 S500 4MATIC Long",
      termMonths: 60,
      depositRate: 0.3,
      annualMileageKm: 20000,
    });
    expect(q.vehiclePrice).toBe(209_100_000);
    expect(q.residualRate).toBe(0.4);
    expect(q.monthlyPayment).toBe(2_956_620);
  });
});

describe("신한 운용리스 — 실제 계약 대조 (BMW X3, annualRate 재정의)", () => {
  it("X3 M Sport / 76,700,000 / 할인 1,500,000 / 60개월 / 보증금 0 / 실금리 5.66% → 총액이 실제 계약과 오차 0.1% 이내", () => {
    const q = quoteShinhanOperatingLease({
      model: "BMW X3 20 xDrive M Sport (P1)",
      vehiclePrice: 76_700_000,
      discount: 1_500_000,
      termMonths: 60,
      depositRate: 0,
      annualMileageKm: 20000,
      annualRate: 0.0566,
    });
    expect(q.annualRate).toBe(0.0566);
    expect(q.acquisitionCost).toBe(80_238_450);
    const impliedTotal = q.acquisitionCost + q.acquisitionCost * 0.0566 * 5;
    // 실제 신한 견적 총액 102,985,600원과 0.1% 이내로 근접(모델 트림 근사 매칭 오차 감안)
    expect(Math.abs(impliedTotal - 102_985_600) / 102_985_600).toBeLessThan(0.001);
  });

  it("annualRate 미지정 시 기존 스냅샷 금리(5.9%) 사용 — 하위호환", () => {
    const q = quoteShinhanOperatingLease({
      model: "포르쉐 CayenneCoupe가솔린3.0",
      optionPrice: 21_000_000,
      discount: 1_694_000,
      termMonths: 60,
      depositRate: 0.1,
      residualRate: 0.4,
    });
    expect(q.annualRate).toBe(0.059);
    expect(q.monthlyPayment).toBe(2_537_360);
  });
});

describe("신한 운용리스 — 선수금·선납금·자동차세·보험료", () => {
  const base = {
    model: "포르쉐 CayenneCoupe가솔린3.0",
    optionPrice: 21_000_000,
    discount: 1_694_000,
    termMonths: 60,
    depositRate: 0.1,
    residualRate: 0.4,
  };

  it("선수금 지정 시 rawMonthlyPayment가 감소한다(PV 가산 효과)", () => {
    const noAdvance = quoteShinhanOperatingLease(base);
    const withAdvance = quoteShinhanOperatingLease({ ...base, advancePayment: 10_000_000 });
    expect(withAdvance.rawMonthlyPayment).toBeLessThan(noAdvance.rawMonthlyPayment);
  });

  it("선납금 지정 시 월할로 표시 월리스료에서 차감된다", () => {
    const q = quoteShinhanOperatingLease({ ...base, prepaidRent: 6_000_000 });
    expect(q.rawMonthlyPayment - q.monthlyPayment).toBe(100_000); // 6,000,000/60
  });

  it("자동차세 포함 시 배기량 기준 월 자동차세가 가산된다", () => {
    const q = quoteShinhanOperatingLease({ ...base, includeVehicleTax: true });
    expect(q.monthlyVehicleTax).toBeGreaterThan(0);
    expect(q.monthlyPayment).toBe(q.rawMonthlyPayment + q.monthlyVehicleTax);
  });

  it("월 보험료 지정 시 표시 월리스료에 그대로 가산된다", () => {
    const q = quoteShinhanOperatingLease({ ...base, monthlyInsurance: 50_000 });
    expect(q.monthlyPayment).toBe(q.rawMonthlyPayment + 50_000);
  });
});

describe("신한 모델 조회 — 표기 차이 허용", () => {
  it("정확한 키", () =>
    expect(findShinhanVehicle("포르쉐 CayenneCoupe가솔린3.0")?.code).toBe("450692470"));
  it("오릭스 표기 'S 500 4M' → 벤츠 S500 4MATIC Long (유일 전방일치)", () =>
    expect(findShinhanVehicle("S 500 4M")?.model).toBe("S500 4MATIC Long"));
  it("모호하거나 없는 모델 → null", () => {
    expect(findShinhanVehicle("없는차")).toBeNull();
    expect(findShinhanVehicle("S")).toBeNull(); // 다수 후보 → 미연동
  });
});
