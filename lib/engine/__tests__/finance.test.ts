import { describe, it, expect } from "vitest";
import { impliedCustomerRate, excelRate } from "../finance";

/**
 * 고객 실효금리(표시용) — 카랩 등 비교 플랫폼이 쓰는 단순(비복리) 근사식.
 * 신한 Cayenne 골든케이스로 검증: 월 2,537,360 / 60개월 / 잔가 67,090,000
 * / 취득원가 178,631,200.
 */
describe("impliedCustomerRate — 고객 실효금리(단순 근사)", () => {
  it("신한 Cayenne 골든케이스 → 약 4.56%", () => {
    const rate = impliedCustomerRate(2_537_360, 60, 67_090_000, 178_631_200);
    expect(rate).toBeCloseTo(0.0456, 3);
  });

  it("취득원가 0이면 0 반환 (0나눔 방지)", () => {
    expect(impliedCustomerRate(100_000, 36, 0, 0)).toBe(0);
  });

  it("월납입이 클수록 실효금리도 커진다", () => {
    const low = impliedCustomerRate(1_000_000, 60, 30_000_000, 80_000_000);
    const high = impliedCustomerRate(1_200_000, 60, 30_000_000, 80_000_000);
    expect(high).toBeGreaterThan(low);
  });
});

describe("excelRate — Excel RATE() 뉴턴법 재현 (신한 IRR적용금리 AB36과 대조)", () => {
  it("Cayenne 골든케이스 → 6.42% (엑셀 AB36 실측 6.43%와 근접)", () => {
    const periodic = excelRate(60, 2_537_360, -178_631_200, 67_090_000);
    expect(periodic * 12).toBeCloseTo(0.0642, 3);
  });
});
