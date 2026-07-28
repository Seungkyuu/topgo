import { describe, it, expect } from "vitest";
import { orixAnnualVehicleTax, orixMonthlyVehicleTax } from "../vehicle-tax";

/**
 * 자동차세 검증 — 엑셀 `운용리스` BB8/P26 실측.
 * S 500 4M(3,982cc) → 1,035,320/년, 86,300/월.
 */
describe("오릭스 자동차세 (승용 비영업용)", () => {
  it("S 500 4M 3,982cc → 연 1,035,320 / 월 86,300 (엑셀)", () => {
    expect(orixAnnualVehicleTax(3982)).toBe(1_035_320);
    expect(orixMonthlyVehicleTax(3982)).toBe(86_300);
  });
  it("A 220 1,991cc → 연 517,660 / 월 43,200", () => {
    expect(orixAnnualVehicleTax(1991)).toBe(517_660);
    expect(orixMonthlyVehicleTax(1991)).toBe(43_200);
  });
  it("세율 구간: 1000cc 104원, 1600cc 182원", () => {
    expect(orixAnnualVehicleTax(1000)).toBe(104_000);
    expect(orixAnnualVehicleTax(1600)).toBe(291_200);
  });
  it("전기차(배기량 없음) → 잠정 EV 정액", () =>
    expect(orixAnnualVehicleTax(undefined)).toBe(130_000));
});
