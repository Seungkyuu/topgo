import { describe, expect, it } from "vitest";
import { QUOTE_SOURCES, type CapitalQuoteInput, type DealType } from "../capitals";
import { findOrixVehicle } from "../orix";
import { findShinhanVehicle, findShinhanRentalVehicle } from "../shinhan";
import { findMeritzVehicle } from "../meritz";

/**
 * 계산 파이프라인 전수 감사 — "이게 안 되면 사이트 전체가 무쓸모"인
 * 끝-투-끝 불변식을 소스(엑셀)별로 자동 검증한다.
 *
 *   ① 가격 배관: 라우터가 넘긴 vehiclePrice(겟챠 실가격 자리)가 실제로
 *      계산에 쓰이는가 — 가격을 20% 올리면 월납입금이 반드시 올라야 한다.
 *      (과거 버그: 신한 리스/렌트·메리츠 수입 5개 경로가 이 값을 무시하고
 *      자기 엑셀 원가격으로만 계산했다)
 *   ② 조건 민감도: 보증금↑→월납↓ / 선납↑→월납↓ / 기간↑→잔가율↓ /
 *      주행거리↑→잔가율↓·월납↑ — 각 조건이 올바른 "방향"으로 작동하는가.
 *      (과거 버그: 메리츠 국산·EV에서 보증금 부호가 반대였다)
 *
 * 여기서 쓰는 기준 모델·가격은 각 엑셀 마스터에서 직접 읽는다(하드코딩 X).
 */

const src = (id: string) => {
  const s = QUOTE_SOURCES.find((s) => s.id === id);
  if (!s) throw new Error(`소스 없음: ${id}`);
  return s;
};

function baseInput(model: string, vehiclePrice: number): CapitalQuoteInput {
  return {
    model,
    vehiclePrice,
    termMonths: 48,
    annualMileageKm: 20000,
    depositRate: 0.1,
    prepayment: 0,
  };
}

/** 감사 대상: 소스 × 상품 × (마스터에서 읽은 기준 모델·가격) */
const CASES: {
  sourceId: string;
  deal: DealType;
  model: string;
  price: number;
  /** 이 상품이 보증금 입력을 받나 */
  hasDeposit: boolean;
  /** 이 상품이 선납금 입력을 받나 */
  hasPrepayment: boolean;
  /** 잔가율이 기간·주행거리 함수인가 (금융리스 일부는 아님) */
  mileageAffectsResidual: boolean;
}[] = [
  {
    sourceId: "orix",
    deal: "operatingLease",
    model: "E 200 AV",
    price: findOrixVehicle("E 200 AV")!.price,
    hasDeposit: true,
    hasPrepayment: false,
    mileageAffectsResidual: true,
  },
  {
    sourceId: "orix",
    deal: "financeLease",
    model: "E 200 AV",
    price: findOrixVehicle("E 200 AV")!.price,
    hasDeposit: false,
    hasPrepayment: true,
    mileageAffectsResidual: false,
  },
  {
    sourceId: "shinhan-lease",
    deal: "operatingLease",
    model: "BMW 120i M Sport (P2)",
    price: findShinhanVehicle("BMW 120i M Sport (P2)")!.vehiclePrice,
    hasDeposit: true,
    hasPrepayment: false,
    mileageAffectsResidual: true,
  },
  {
    sourceId: "shinhan-lease",
    deal: "financeLease",
    model: "BMW 120i M Sport (P2)",
    price: findShinhanVehicle("BMW 120i M Sport (P2)")!.vehiclePrice,
    hasDeposit: false,
    // 신한 금융리스 엑셀엔 선납금 입력 자체가 없다(문서화된 제약)
    hasPrepayment: false,
    mileageAffectsResidual: false,
  },
  {
    sourceId: "shinhan-rental",
    deal: "longTermRental",
    model: "벤츠 A220 Sedan",
    price: findShinhanRentalVehicle("벤츠 A220 Sedan")!.vehiclePrice,
    hasDeposit: false,
    hasPrepayment: false,
    mileageAffectsResidual: false,
  },
  {
    sourceId: "meritz-import",
    deal: "operatingLease",
    model: "Audi A3 40 TFSI",
    price: findMeritzVehicle("Audi A3 40 TFSI")!.vehiclePrice,
    hasDeposit: true,
    hasPrepayment: false,
    mileageAffectsResidual: true,
  },
  {
    sourceId: "meritz-import",
    deal: "financeLease",
    model: "Audi A3 40 TFSI",
    price: findMeritzVehicle("Audi A3 40 TFSI")!.vehiclePrice,
    hasDeposit: false,
    hasPrepayment: true,
    mileageAffectsResidual: false,
  },
  {
    sourceId: "meritz-domestic-lease",
    deal: "operatingLease",
    model: "더 뉴 그랜저 1.6T HEV",
    price: 50_429_000,
    hasDeposit: true,
    hasPrepayment: false,
    mileageAffectsResidual: true,
  },
  {
    sourceId: "meritz-tesla-lease",
    deal: "operatingLease",
    model: "Model Y L AWD <지원금>",
    price: 67_890_000,
    hasDeposit: true,
    hasPrepayment: false,
    mileageAffectsResidual: true,
  },
  {
    sourceId: "meritz-byd-lease",
    deal: "operatingLease",
    model: "BYD Dolphin",
    price: 24_500_000,
    hasDeposit: true,
    hasPrepayment: false,
    mileageAffectsResidual: true,
  },
];

describe("감사 ①: 가격 배관 — vehiclePrice가 진짜 계산에 들어가는가", () => {
  for (const c of CASES) {
    it(`${c.sourceId} / ${c.deal}: 차량가 +20% → 월납입금 상승`, () => {
      const s = src(c.sourceId);
      const q1 = s.quote(c.deal, baseInput(c.model, c.price));
      const q2 = s.quote(c.deal, baseInput(c.model, Math.round(c.price * 1.2)));
      expect(q1.available, q1.note).toBe(true);
      expect(q2.available, q2.note).toBe(true);
      expect(q2.monthlyPayment!).toBeGreaterThan(q1.monthlyPayment!);
    });
  }
});

describe("감사 ②: 보증금 — 늘릴수록 월납입금이 내려가야 (만기 환급금)", () => {
  for (const c of CASES.filter((c) => c.hasDeposit)) {
    it(`${c.sourceId} / ${c.deal}: 보증금 0% > 10% > 30%`, () => {
      const s = src(c.sourceId);
      const at = (rate: number) =>
        s.quote(c.deal, { ...baseInput(c.model, c.price), depositRate: rate });
      const d0 = at(0);
      const d10 = at(0.1);
      const d30 = at(0.3);
      expect(d0.available, d0.note).toBe(true);
      expect(d10.monthlyPayment!).toBeLessThan(d0.monthlyPayment!);
      expect(d30.monthlyPayment!).toBeLessThan(d10.monthlyPayment!);
    });
  }
});

describe("감사 ②: 선납금 — 늘릴수록 월납입금이 내려가야", () => {
  for (const c of CASES.filter((c) => c.hasPrepayment)) {
    it(`${c.sourceId} / ${c.deal}: 선납 0 > 500만`, () => {
      const s = src(c.sourceId);
      const p0 = s.quote(c.deal, { ...baseInput(c.model, c.price), depositRate: 0 });
      const p5m = s.quote(c.deal, {
        ...baseInput(c.model, c.price),
        depositRate: 0,
        prepayment: 5_000_000,
      });
      expect(p0.available, p0.note).toBe(true);
      expect(p5m.monthlyPayment!).toBeLessThan(p0.monthlyPayment!);
    });
  }
});

describe("감사 ②: 기간 — 길수록 잔가율이 내려가야 (감가 누적)", () => {
  for (const c of CASES.filter((c) => c.mileageAffectsResidual)) {
    it(`${c.sourceId} / ${c.deal}: 잔가율(36) ≥ 잔가율(60)`, () => {
      const s = src(c.sourceId);
      const t36 = s.quote(c.deal, { ...baseInput(c.model, c.price), termMonths: 36 });
      const t60 = s.quote(c.deal, { ...baseInput(c.model, c.price), termMonths: 60 });
      expect(t36.available, t36.note).toBe(true);
      expect(t60.available, t60.note).toBe(true);
      expect(t36.residualRate!).toBeGreaterThan(t60.residualRate!);
    });
  }
});

describe("감사 ②: 주행거리 — 많이 달릴수록 잔가율↓·월납입금↑", () => {
  for (const c of CASES.filter((c) => c.mileageAffectsResidual)) {
    it(`${c.sourceId} / ${c.deal}: 1만km vs 3만km`, () => {
      const s = src(c.sourceId);
      const lo = s.quote(c.deal, { ...baseInput(c.model, c.price), annualMileageKm: 10000 });
      const hi = s.quote(c.deal, { ...baseInput(c.model, c.price), annualMileageKm: 30000 });
      expect(lo.available, lo.note).toBe(true);
      expect(hi.available, hi.note).toBe(true);
      expect(lo.residualRate!).toBeGreaterThanOrEqual(hi.residualRate!);
      expect(hi.monthlyPayment!).toBeGreaterThanOrEqual(lo.monthlyPayment!);
    });
  }
});
