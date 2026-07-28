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
    expect(q.strategyGrade).toBe("전략T");
    // 엑셀 렌트_출력시트 "매회납부렌트료" 859,540원 — 자동차세·보험료·
    // 지급수수료는 근사치라 완전히 같지는 않지만, "낮게 보이면 안 된다"는
    // 원칙에 따라 실제보다 낮아지지 않아야 한다(여기선 +1,650원 높게 나옴).
    expect(q.monthlyPayment).toBeGreaterThanOrEqual(859_540);
  });
});
