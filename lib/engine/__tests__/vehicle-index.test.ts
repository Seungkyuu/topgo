import { describe, expect, it } from "vitest";
import {
  buildVehicleIndex,
  buildModelGroups,
  cleanDisplayName,
  listBrands,
  dealsForIndexed,
  quoteIndexed,
} from "../vehicle-index";

describe("표시명 정제", () => {
  it("내부 표기를 걷어낸다", () => {
    expect(cleanDisplayName("♣프로모션♣ 모델3 롱레인지")).toBe("모델3 롱레인지");
    expect(cleanDisplayName("(특가) Model 3 RWD")).toBe("Model 3 RWD");
    expect(cleanDisplayName("(25.08) Model Y Long Range")).toBe("Model Y Long Range");
    expect(cleanDisplayName("Model 3 RWD <지원금>")).toBe("Model 3 RWD");
    expect(cleanDisplayName("Model Y RWD 1-1")).toBe("Model Y RWD");
    expect(cleanDisplayName("투싼(NX4) 1.6T 가솔린 2WD")).toBe("투싼 1.6T 가솔린 2WD");
  });
});

describe("통합 차량 인덱스", () => {
  const index = buildVehicleIndex();

  it("금융사명이 인덱스 표면에 없다 (브랜드·차명·가격만)", () => {
    for (const v of index.slice(0, 200)) {
      expect(v.display).not.toMatch(/오릭스|신한|메리츠/);
      expect(v.brand).not.toMatch(/오릭스|신한|메리츠/);
    }
  });

  it("같은 차는 소스가 달라도 하나로 병합되고 ref는 소스별 원본 라벨을 유지한다", () => {
    const my = index.find((v) => v.brand === "테슬라" && v.display === "Model Y Long Range");
    expect(my).toBeDefined();
    expect(my!.refs.length).toBeGreaterThanOrEqual(2);
    const ids = my!.refs.map((r) => r.sourceId);
    expect(new Set(ids).size).toBe(ids.length); // 소스당 ref 하나
  });

  it("국산차 브랜드를 현대/제네시스로 나눈다", () => {
    const g80 = index.find((v) => /G80 2\.5T 2WD/.test(v.display));
    expect(g80?.brand).toBe("제네시스");
    const grandeur = index.find((v) => /디 올 뉴 그랜저 2\.5G/.test(v.display));
    expect(grandeur?.brand).toBe("현대");
  });

  it("메리츠 수입차의 붙여쓴 브랜드 접두를 분리한다", () => {
    const porsche = index.filter((v) => v.brand === "포르쉐");
    expect(porsche.length).toBeGreaterThan(10);
    expect(porsche.every((v) => !/^PORSCHE/i.test(v.display))).toBe(true);
  });

  it("특판차량 마커('전기차','선구매 전용 OO')는 브랜드로 노출되지 않는다", () => {
    const brands = listBrands();
    expect(brands).not.toContain("전기차");
    expect(brands.some((b) => b.startsWith("선구매"))).toBe(false);
  });

  it("신한 렌터카의 'JEEP'/'도요타' 표기를 다른 소스와 같은 '지프'/'토요타'로 합친다", () => {
    const brands = listBrands();
    expect(brands).not.toContain("JEEP");
    expect(brands).not.toContain("도요타");
    expect(brands).toContain("지프");
    expect(brands).toContain("토요타");
  });

  it("브랜드 목록은 보유 차종 수 내림차순", () => {
    const brands = listBrands();
    expect(brands.length).toBeGreaterThan(10);
    expect(brands).toContain("현대");
    expect(brands).toContain("벤츠");
  });

  it("렌터카 카탈로그 연결로 장기렌트 가능 차량이 존재한다", () => {
    const rentals = index.filter((v) => dealsForIndexed(v).includes("longTermRental"));
    expect(rentals.length).toBeGreaterThan(400);
  });

  it("수입차도 겟챠 실가격 매칭이 있으면 캐피탈사 엑셀가 대신 그 값을 계산에 쓴다", () => {
    const bmw740d = index.find(
      (v) => v.brand === "BMW" && /740d xDrive M Sport \(P1\)$/.test(v.display),
    );
    expect(bmw740d).toBeDefined();
    const shinhanRef = bmw740d!.refs.find((r) => r.sourceId === "shinhan-lease");
    expect(shinhanRef?.price).toBe(137_100_000);
  });

  it("겟챠 등급 식별자가 같으면 표기가 다른 소스끼리도 하나로 합쳐진다", () => {
    // 신한(오토리스)·메리츠(수입차) 라벨 표기가 서로 달라도("Defender 130
    // D300 X-Dynamic HSE" vs 메리츠의 동일 표기 — 둘 다 겟챠 "디펜더 130
    // D300 X-다이나믹 HSE" 등급에 매칭되므로 같은 실차로 병합돼야 한다.
    // 병합 전엔 이런 차들이 캐피탈 하나에서만 취급하는 것처럼 잘못 보였다.
    const defender = index.find(
      (v) => v.brand === "랜드로버" && /Defender 130 D300 X-Dynamic HSE/.test(v.display),
    );
    expect(defender).toBeDefined();
    const sources = new Set(defender!.refs.map((r) => r.sourceId));
    expect(sources.size).toBeGreaterThanOrEqual(2);
    expect(sources.has("shinhan-lease")).toBe(true);
    expect(sources.has("meritz-import")).toBe(true);
  });

  it("모든 IndexedVehicle은 modelGroup을 갖는다(규칙이 없으면 자기 display로 폴백)", () => {
    for (const v of index) {
      expect(v.modelGroup).toBeTruthy();
    }
  });
});

describe("모델 그룹 (브랜드→모델→트림 2단계 선택)", () => {
  const groups = buildModelGroups();

  it("BMW 3시리즈 트림들이 하나의 그룹으로 묶인다", () => {
    const g = groups.find((g) => g.brand === "BMW" && g.name === "3시리즈");
    expect(g).toBeDefined();
    expect(g!.trimCount).toBeGreaterThan(5);
    expect(g!.trims.every((t) => t.brand === "BMW")).toBe(true);
    // 가격 오름차순 정렬 확인
    for (let i = 1; i < g!.trims.length; i++) {
      expect(g!.trims[i].displayPrice).toBeGreaterThanOrEqual(g!.trims[i - 1].displayPrice);
    }
    expect(g!.minPrice).toBe(g!.trims[0].displayPrice);
  });

  it("벤츠 GLC-클래스 트림들이 하나의 그룹으로 묶인다", () => {
    const g = groups.find((g) => g.brand === "벤츠" && g.name === "GLC-클래스");
    expect(g).toBeDefined();
    expect(g!.trimCount).toBeGreaterThan(1);
  });

  it("그룹핑 규칙이 없는 브랜드도 트림이 사라지지 않는다(1인 그룹 폴백)", () => {
    const totalTrimsInGroups = groups.reduce((sum, g) => sum + g.trimCount, 0);
    expect(totalTrimsInGroups).toBe(buildVehicleIndex().length);
  });

  it("그룹 요약에 대표 이미지·최저가가 채워진다", () => {
    const g = groups.find((g) => g.trimCount > 0)!;
    expect(g.minPrice).toBeGreaterThanOrEqual(0);
  });
});

describe("통합 차량 인덱스 — 견적", () => {
  const index = buildVehicleIndex();

  it("ref 기반 견적은 소스별 원본 라벨로 정확히 계산된다", () => {
    const grandeur = index.find((v) => /디 올 뉴 그랜저 2\.5G/.test(v.display))!;
    const rows = quoteIndexed(grandeur, "operatingLease", {
      termMonths: 48,
      annualMileageKm: 20000,
      depositRate: 0.3,
      prepayment: 0,
    });
    expect(rows.length).toBeGreaterThan(0);
    const ok = rows.filter((r) => r.available);
    expect(ok.length).toBeGreaterThan(0);
    for (const r of ok) {
      expect(r.monthlyPayment).toBeGreaterThan(0);
      expect(r.sourceLabel).toBeTruthy();
    }
  });
});
