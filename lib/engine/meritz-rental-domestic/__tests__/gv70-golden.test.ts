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
    // 엑셀 견적조건!H21 — 계산 사슬(원금)은 기간·주행거리·차량가 조건이 같으면
    // 엑셀 갱신과 무관하게 그대로 일치해야 한다(사슬 자체는 안 바뀜).
    expect(q.principal).toBeCloseTo(54_593_688.818, 2);
    // 2608_V2 갱신분 — 잔가율표가 갱신되며 60개월·2만km 잔가율이 바뀌어
    // "만기時 인수 예상 가격"도 같이 바뀐다(엑셀 렌트_출력시트 재확인값).
    expect(q.residualValue).toBe(29_045_000);
    // 2608_V2 갱신분에서 전략C → 특판C로 재분류(등급명만 변경, 계산 사슬 무관).
    expect(q.strategyGrade).toBe("특판C");
  });
});
