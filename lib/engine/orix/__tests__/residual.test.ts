import { describe, it, expect } from "vitest";
import { resolveOrixResidualRate, isKnownOrixModel } from "../residual";
import { calcOrixOperatingLease } from "../operating-lease";

/**
 * 잔가율 자동 조회 검증.
 * 정답지: 엑셀 `운용리스` 시트의 BN22("최대잔가") = X5.
 * S 500 4M / 48개월 / 20,000km → 0.47 (엑셀 BN22 실측).
 */
describe("오릭스 최대잔가 자동 조회", () => {
  it("S 500 4M / 48개월 / 20,000km = 0.47 (엑셀 BN22)", () =>
    expect(resolveOrixResidualRate("S 500 4M", 48, 20000)).toBe(0.47));
  it("주행거리 30,000km → −3% = 0.44", () =>
    expect(resolveOrixResidualRate("S 500 4M", 48, 30000)).toBe(0.44));
  it("주행거리 10,000km → +3% = 0.50", () =>
    expect(resolveOrixResidualRate("S 500 4M", 48, 10000)).toBe(0.5));
  it("60개월 = 0.34, 36개월 = 0.55", () => {
    expect(resolveOrixResidualRate("S 500 4M", 60)).toBe(0.34);
    expect(resolveOrixResidualRate("S 500 4M", 36)).toBe(0.55);
  });
  it("표에 없는 모델은 예외", () =>
    expect(() => resolveOrixResidualRate("없는차종", 48)).toThrow());
  it("isKnownOrixModel", () => {
    expect(isKnownOrixModel("S 500 4M")).toBe(true);
    expect(isKnownOrixModel("없는차종")).toBe(false);
  });
});

/**
 * 통합: 캡처에서 나온 차종·기간·주행거리로 최대잔가를 자동 산정해 월납입까지.
 * (잔가 조회는 엑셀 BN22로, PMT는 엑셀 저장값으로 각각 검증됨. 여기선 둘의 합성을 고정.)
 */
describe("운용리스 — 최대잔가 자동 적용", () => {
  it("S 500 4M / 213,600,000 / 48개월 / 20,000km → 잔가 0.47, 월납입 3,091,300", () => {
    const residualRate = resolveOrixResidualRate("S 500 4M", 48, 20000);
    const r = calcOrixOperatingLease({
      vehiclePrice: 213_600_000,
      termMonths: 48,
      annualRate: 0.052,
      residualRate,
      depositRate: 0.3,
    });
    expect(r.residualValue).toBe(100_392_000);
    expect(r.monthlyPayment).toBe(3_091_300);
  });
});
