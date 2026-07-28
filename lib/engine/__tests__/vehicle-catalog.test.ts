import { describe, expect, it } from "vitest";
import { buildVehicleCatalog } from "../vehicle-catalog";
import { approxPrice } from "../approx-prices";
import { RECOMMENDABLE_DEALS } from "../recommend";

describe("개략 시세 (approx-prices)", () => {
  it("겟챠 실가격(real-prices.json)에 있으면 그 값을 우선 쓴다 (할인 있으면 할인가)", () => {
    expect(approxPrice("디 올 뉴 그랜저 2.5G", 0)).toBe(41_613_889);
    expect(approxPrice("디 올 뉴 팰리세이드 2.5 HEV 7인승 2WD", 0)).toBe(49_655_477);
    expect(approxPrice("Model Y Long Range", 0)).toBe(66_990_000);
    expect(approxPrice("♣프로모션♣ 모델3 롱레인지", 0)).toBe(59_990_000);
    expect(approxPrice("BYD Dolphin", 0)).toBe(24_500_000);
  });

  it("실가격 매칭이 없으면 정규식 개략가로 폴백한다", () => {
    // 트림이 너무 많아(10개+) 실가격 매칭에서 의도적으로 제외된 라벨들
    expect(approxPrice("더 뉴 그랜저 1.6T HEV", 0)).toBe(46_000_000);
    expect(approxPrice("캐스퍼 1.0 가솔린", 0)).toBe(16_500_000);
  });

  it("정규식도 안 맞으면 fallback을 쓴다", () => {
    expect(approxPrice("존재하지 않는 차", 12_345)).toBe(12_345);
  });
});

describe("통합 차량 카탈로그", () => {
  const catalog = buildVehicleCatalog();

  it("국산차 그룹이 단일가가 아니라 모델별로 다른 예상가를 가진다", () => {
    const domestic = catalog.filter((c) => c.group === "국산차 (메리츠)");
    const prices = new Set(domestic.map((c) => c.defaultPrice));
    expect(prices.size).toBeGreaterThan(5);
    const casper = domestic.find((c) => c.label.includes("캐스퍼 1.0"));
    const palisade = domestic.find((c) => c.label.includes("팰리세이드 2.5 가솔린 7인승 2WD"));
    expect(casper!.defaultPrice).toBeLessThan(palisade!.defaultPrice);
  });

  it("엑셀 헤더 찌꺼기('차종')는 카탈로그에 없다", () => {
    expect(catalog.find((c) => c.label.trim() === "차종")).toBeUndefined();
  });
});

describe("예산 추천 가능 상품", () => {
  it("인덱스에 연결된 소스가 계산하는 상품을 모두 포함한다", () => {
    expect(RECOMMENDABLE_DEALS).toContain("operatingLease");
    expect(RECOMMENDABLE_DEALS).toContain("financeLease");
    expect(RECOMMENDABLE_DEALS).toContain("longTermRental");
  });
});
