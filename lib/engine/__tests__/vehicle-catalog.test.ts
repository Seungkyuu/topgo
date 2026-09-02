import { describe, expect, it } from "vitest";
import { buildVehicleCatalog } from "../vehicle-catalog";
import { approxPrice } from "../approx-prices";
import realPricesJson from "../data/real-prices.json";

const REAL_PRICES: Record<string, number> = realPricesJson;
import { RECOMMENDABLE_DEALS } from "../recommend";

describe("개략 시세 (approx-prices)", () => {
  // real-prices.json은 겟챠 스크래핑이 매일 갱신하는 실시간 시세라, 기대값을
  // 숫자로 박아두면 시세가 움직일 때마다 테스트가 깨진다(엑셀에서 뽑은 골든
  // 케이스와 성격이 다르다 — 그쪽은 계약 금액이라 고정이어야 한다).
  // 그래서 "얼마인가" 대신 "실가격 경로가 실제로 선택됐는가"를 검증한다.
  it("겟챠 실가격(real-prices.json)에 있으면 그 값을 우선 쓴다 (할인 있으면 할인가)", () => {
    const SENTINEL = -1; // fallback이 쓰이면 이 값이 그대로 나온다
    for (const label of [
      "디 올 뉴 그랜저 2.5G",
      "디 올 뉴 팰리세이드 2.5 HEV 7인승 2WD",
      "Model Y Long Range",
      "♣프로모션♣ 모델3 롱레인지",
      "BYD Dolphin",
    ]) {
      const expected = REAL_PRICES[label];
      // 라벨이 실가격 표에서 통째로 빠졌다면 매칭 파이프라인이 깨진 것이다.
      expect(expected, `실가격 표에 없는 라벨: ${label}`).toBeDefined();
      expect(approxPrice(label, SENTINEL)).toBe(expected);
      expect(approxPrice(label, SENTINEL)).not.toBe(SENTINEL);
    }
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
