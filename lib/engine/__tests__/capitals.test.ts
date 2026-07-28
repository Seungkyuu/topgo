import { describe, it, expect } from "vitest";
import {
  quoteVehicle,
  sourcesForVehicle,
  dealsForVehicle,
  lowestCapital,
  QUOTE_SOURCES,
  ALL_CAPITALS,
} from "../capitals";

const input = {
  model: "S 500 4M",
  vehiclePrice: 213_600_000,
  termMonths: 48,
  annualMileageKm: 20000,
  depositRate: 0.3,
  prepayment: 0,
};

describe("소스(엑셀) 레지스트리 — 근본 원칙", () => {
  it("등록된 소스는 추출·검증된 엑셀만 (오릭스·신한 오토리스·신한 렌터카·메리츠 수입차·메리츠 국산 리스/렌트)", () => {
    expect(QUOTE_SOURCES.map((s) => s.id)).toEqual([
      "orix",
      "shinhan-lease",
      "shinhan-rental",
      "meritz-import",
      "meritz-domestic-lease",
      "meritz-rental-domestic",
      "meritz-tesla-lease",
      "meritz-byd-lease",
    ]);
  });
  it("캐피탈 목록은 소스에서 중복 제거해 도출", () => {
    expect(ALL_CAPITALS).toEqual(["오릭스", "신한카드", "메리츠"]);
  });
});

describe("1차 필터 — 차량이 든 소스만 (엑셀에 없으면 미취급)", () => {
  it("S 500 4M → 오릭스·신한(오토리스/렌터카)·메리츠 카탈로그에 모두 있음", () => {
    const ids = sourcesForVehicle("S 500 4M").map((s) => s.id);
    expect(ids).toContain("orix");
    expect(ids).toContain("shinhan-lease");
    expect(ids).toContain("meritz-import");
  });
  it("어느 엑셀에도 없는 차 → 취급 소스 0개", () => {
    expect(sourcesForVehicle("존재하지않는차XYZ")).toHaveLength(0);
  });
});

describe("2차 필터 — 상품별 소스", () => {
  it("S 500 4M의 가능한 상품 = 운용·금융·장기렌트", () => {
    const deals = dealsForVehicle("S 500 4M");
    expect(deals).toContain("operatingLease");
    expect(deals).toContain("financeLease");
    expect(deals).toContain("longTermRental");
  });
});

describe("견적 — 차량→상품→연산", () => {
  it("운용리스 → 오릭스 3,091,300(최저), 신한 3,370,600, 메리츠 3,334,800", () => {
    // 신한 3,370,600·메리츠 3,334,800은 둘 다 input.vehiclePrice(213,600,000 — 오릭스
    // 엑셀 골든케이스 원가)를 그대로 넘겼을 때의 결과다. 과거엔 신한·메리츠-수입 라우팅
    // 경로가 vehiclePrice를 무시하고 각자 마스터 카탈로그 가격
    // (신한 209,100,000 "S500 4MATIC Long" / 메리츠 199,100,000 "Benz S 500 4MATIC Long")
    // 으로만 계산하는 버그가 있어 각각 3,299,810·3,110,300이 나왔었다 — capitals.ts의
    // priceOverride 배관 수정으로 세 캐피탈 모두 "같은 겟챠 실가격"을 받아 계산하는 것이
    // 이제 실제로 보장된다.
    const rows = quoteVehicle("S 500 4M", "operatingLease", input);
    const orix = rows.find((r) => r.capital === "오릭스")!;
    expect(orix.monthlyPayment).toBe(3_091_300);
    const shinhan = rows.find((r) => r.capital === "신한카드")!;
    expect(shinhan.available).toBe(true);
    expect(shinhan.monthlyPayment).toBe(3_370_600);
    const meritz = rows.find((r) => r.capital === "메리츠")!;
    expect(meritz.available).toBe(true);
    expect(meritz.monthlyPayment).toBe(3_334_800);
    expect(lowestCapital(rows)).toBe("오릭스");
  });

  it("장기렌트 → 오릭스는 소스 자체가 없음(운용·금융만), 신한 렌터카만 계산", () => {
    const rows = quoteVehicle("S 500 4M", "longTermRental", input);
    expect(rows.some((r) => r.capital === "오릭스")).toBe(false);
    const shinhan = rows.find((r) => r.capital === "신한카드");
    expect(shinhan?.available).toBe(true);
  });

  it("장기렌트 → 잔가율 직접 지정 시 신한 렌터카가 그 값으로 계산", () => {
    const rows = quoteVehicle("S 500 4M", "longTermRental", { ...input, residualRate: 0.4 });
    const shinhan = rows.find((r) => r.capital === "신한카드")!;
    expect(shinhan.residualRate).toBe(0.4);
  });
});
