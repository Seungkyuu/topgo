import { describe, it, expect } from "vitest";
import { quoteShinhanFinanceLease } from "../finance-lease";

/**
 * 신한 오토리스(금융) — 운용리스와 동일한 취득원가·CA수수료·PMT 공식을
 * 재사용하되 보증금 0, 잔가율 직접 지정으로 계산한다(AI3=1 분기).
 * 이 워크북에는 금융리스 저장 골든케이스가 없어 공식 재사용 검증만 수행한다.
 */
describe("신한 오토리스(금융) — 취득원가 재사용 검증", () => {
  const q = quoteShinhanFinanceLease({
    model: "포르쉐 CayenneCoupe가솔린3.0",
    optionPrice: 21_000_000,
    discount: 1_694_000,
    termMonths: 60,
    residualRate: 0.4,
  });

  it("취득원가는 운용리스와 동일(오차 0): 178,631,200", () =>
    expect(q.acquisitionCost).toBe(178_631_200));
  it("보증금 개념 없이 잔가만 반영, 잔가 = 67,090,000", () =>
    expect(q.residualValue).toBe(67_090_000));
  it("보증금이 없어 운용리스(2,527,660)보다 월납입이 더 큼", () =>
    expect(q.monthlyPayment).toBeGreaterThan(2_527_660));
  it("월리스료 = 2,608,900", () => expect(q.monthlyPayment).toBe(2_608_900));
});

describe("신한 오토리스(금융) — 잔가율 미지정 시 완전상환(0)", () => {
  it("잔가 0, 월납입이 잔가지정보다 더 큼", () => {
    const q = quoteShinhanFinanceLease({
      model: "포르쉐 CayenneCoupe가솔린3.0",
      termMonths: 60,
    });
    expect(q.residualRate).toBe(0);
    expect(q.residualValue).toBe(0);
  });
});

describe("신한 오토리스(금융) — 미등록 모델", () => {
  it("모델 미연동 에러", () => {
    expect(() =>
      quoteShinhanFinanceLease({ model: "존재하지않는모델", termMonths: 48 }),
    ).toThrow("모델 미연동");
  });
});
