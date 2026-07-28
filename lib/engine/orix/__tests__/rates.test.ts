import { describe, it, expect } from "vitest";
import {
  resolveOrixOperatingLeaseRate,
  resolveOrixFinanceLeaseRate,
} from "../rates";

/**
 * 금리 자동 산정 검증 — 엑셀 각 상품 시트의 저장 금리와 대조.
 */
describe("오릭스 적용금리 자동 산정", () => {
  it("운용리스: 보증금 30% / 선수 없음 → 5.2% (엑셀 X40)", () =>
    expect(resolveOrixOperatingLeaseRate(48, 0.3, false)).toBe(0.052));

  it("운용리스: 보증금 30% 미만(20%) → 추가 0.2% = 5.4%", () =>
    expect(resolveOrixOperatingLeaseRate(48, 0.2, false)).toBe(0.054));

  it("운용리스: 보증금 30% + 선수 있음 → +0.2% = 5.4%", () =>
    expect(resolveOrixOperatingLeaseRate(48, 0.3, true)).toBe(0.054));

  it("운용리스: 보증금 50% → 추가 0.2% = 5.4%", () =>
    expect(resolveOrixOperatingLeaseRate(48, 0.5, false)).toBe(0.054));

  it("금융리스 → 5.5% (엑셀 Z40)", () =>
    expect(resolveOrixFinanceLeaseRate(60)).toBe(0.055));

  // 구간 경계 테스트
  it("보증금 10% 미만(9%) → 추가 0.2%", () =>
    expect(resolveOrixOperatingLeaseRate(48, 0.09, false)).toBe(0.054));

  it("보증금 정확히 10% → 다음 구간(10% 이상 30% 미만) 적용 → 추가 0.2%", () =>
    expect(resolveOrixOperatingLeaseRate(48, 0.10, false)).toBe(0.054));

  it("보증금 44% → 30% 이상 45% 미만 구간 → 추가 0.0% = 5.2%", () =>
    expect(resolveOrixOperatingLeaseRate(48, 0.44, false)).toBe(0.052));

  it("보증금 정확히 45% → 45% 이상 50% 미만 구간 → 추가 0.2% = 5.4%", () =>
    expect(resolveOrixOperatingLeaseRate(48, 0.45, false)).toBe(0.054));

  it("보증금 60% 이상(70%) → 마지막 구간 추가금리 적용 (throw 없음)", () =>
    expect(resolveOrixOperatingLeaseRate(48, 0.7, false)).toBe(0.054));
});
