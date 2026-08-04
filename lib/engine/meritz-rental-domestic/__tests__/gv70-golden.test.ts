import { describe, expect, it } from "vitest";
import { quoteMeritzDomesticRental } from "../index";

describe("메리츠 국산 렌트 — GV70 실제 견적 검증", () => {
  it("취득원가·잔가는 엑셀과 정확히 일치(오차 0)", () => {
    const q = quoteMeritzDomesticRental({
      model: "GV70 2.5T 가솔린",
      vehiclePrice: 54_000_000,
      optionPrice: 2_950_000,
      discount: 0,
      termMonths: 60,
      annualMileageKm: 20_000,
      // 엑셀 예시의 1차 메이커 탁송료(제휴탁송사 선택 시나리오)·용품비 그대로
      deliveryFee1: 350_000,
      accessoryFee: 80_000,
    });
    // 엑셀 견적조건!H21
    expect(q.principal).toBeCloseTo(54_593_688.818, 2);
    // 엑셀 렌트_출력시트 "만기時 인수 예상 가격"
    expect(q.residualValue).toBe(31_323_000);
    // 26.08 V1 갱신분에서 전략T(금리 5.4%) → 전략C(금리 5.2%)로 재분류
    // (취득원가·잔가는 원래 예시와 그대로 일치 — 데이터 갱신은 등급·금리에만
    // 영향, 계산 사슬 자체는 안 바뀜). 금리가 낮아졌으니 매회납부렌트료도
    // 예전 실제 견적(전략T 기준 859,540원)보다 낮게 나오는 게 정상이라, 그
    // 비교는 더 이상 유효하지 않다 — 전략C 기준 새 실제 견적을 받으면 그 값으로
    // "낮게 보이면 안 된다" 하한 검증을 다시 세운다.
    expect(q.strategyGrade).toBe("전략C");
  });
});
