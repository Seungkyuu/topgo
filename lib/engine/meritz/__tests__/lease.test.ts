import { describe, it, expect } from "vitest";
import { quoteMeritzOperatingLease, resolveMeritzOperatingLeaseRate } from "../operating-lease";
import { quoteMeritzFinanceLease } from "../finance-lease";
import { findMeritzVehicle } from "../vehicle";
import { resolveMeritzResidual } from "../residual";

/**
 * 메리츠 운용리스 — 엑셀 `운용리스 내부` 저장값(2607_V1) 골든케이스.
 * Benz E 220d 4MATIC AMG Line / 차량가 81,000,000(입력) / 60개월 / 2만km
 * 보증금 0 / 장기선수금 10% / 잔가 APS 0.575 / 금리 6.5%(6.35+저보증금0.15)
 *  취득원가 86,234,540 / CM 2,587,030 / 제휴사 948,570 / 추가 862,340
 *  잔가보장수수료 1,053,000(APS 8구간) → 월리스료(H52) 976,700
 */
describe("메리츠 운용리스 — 골든 케이스 전체 사슬", () => {
  const q = quoteMeritzOperatingLease({
    model: "Benz E 220d 4MATIC AMG Line",
    vehiclePrice: 81_000_000, // 엑셀 시나리오 입력가 (마스터가 85,300,000과 별도)
    termMonths: 60,
    depositRate: 0,
    prepaymentRate: 0.1,
    annualMileageKm: 20000,
  });

  it("취득원가 = 86,234,540 (H8)", () =>
    expect(q.acquisitionCost).toBe(86_234_540));
  it("금리 = 6.5% (Benz 6.35% + 저보증금 0.15%)", () =>
    expect(q.annualRate).toBe(0.065));
  it("잔가율 = 0.575 (APS SA1@60 0.495 + 고잔가 8%)", () =>
    expect(q.residualRate).toBe(0.575));
  it("잔가 = 46,575,000 / 선수금 = 8,100,000", () => {
    expect(q.residualValue).toBe(46_575_000);
    expect(q.prepayment).toBe(8_100_000);
  });
  it("잔가보장수수료 = 1,053,000 (APS 8구간)", () => {
    expect(q.guaranteeFee).toBe(1_053_000);
    expect(q.residualProvider).toBe("aps");
  });
  it("★ 월리스료 = 976,700 (H52, 오차 0)", () =>
    expect(q.monthlyPayment).toBe(976_700));
});

describe("메리츠 금융리스 — 골든 케이스", () => {
  it("★ BYD DOLPHIN / 65,000,000 / 36개월 / 선수 20% / 6.3% → 1,589,020 (H18)", () => {
    const q = quoteMeritzFinanceLease({
      model: "BYD DOLPHIN",
      vehiclePrice: 65_000_000,
      termMonths: 36,
      prepaymentRate: 0.2,
    });
    expect(q.financedAmount).toBe(52_000_000);
    expect(q.monthlyPayment).toBe(1_589_020);
  });
});

describe("메리츠 금리 조립 (엑셀 H36)", () => {
  it("Benz 기본 6.35%, 보증금+선수 30% → 가산 없음", () =>
    expect(resolveMeritzOperatingLeaseRate("Benz", 0.3, 0)).toBe(0.0635));
  it("보증금+선수 10% (<11%) → +0.15%", () =>
    expect(resolveMeritzOperatingLeaseRate("Benz", 0, 0.1)).toBe(0.065));
  it("보증금+선수 45% (>40%) → +0.3%", () =>
    expect(resolveMeritzOperatingLeaseRate("Benz", 0.45, 0)).toBe(0.0665));
  it("24MY → +0.5%", () =>
    expect(resolveMeritzOperatingLeaseRate("Benz", 0.3, 0, true)).toBe(0.0685));
  it("Polestar 기본 8.05%", () =>
    expect(resolveMeritzOperatingLeaseRate("Polestar", 0.3, 0)).toBe(0.0805));
});

describe("메리츠 잔가 산정 — 잔가사 비교", () => {
  const v = findMeritzVehicle("Benz E 220d 4MATIC AMG Line")!;
  it("차종 마스터: West A / APS SA1", () => {
    expect(v.groups.west).toBe("A");
    expect(v.groups.aps).toBe("SA1");
  });
  it("60개월·2만km → APS 0.575 (West 0.46은 미달)", () => {
    const r = resolveMeritzResidual(v, 60, 20000)!;
    expect(r.provider).toBe("aps");
    expect(r.residualRate).toBe(0.575);
    expect(r.guaranteeFee).toBe(1_053_000);
  });
  it("3만km → 고잔가 불가·주행조정 -4% → 기본 0.455", () => {
    const r = resolveMeritzResidual(v, 60, 30000)!;
    expect(r.residualRate).toBe(0.455);
    expect(r.guaranteeFee).toBe(0);
  });
});
