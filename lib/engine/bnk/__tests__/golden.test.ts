import { describe, expect, it } from "vitest";
import { quoteBnkOperatingLease } from "../index";

describe("BNK 운용리스 — BMW 520i 실제 견적 검증 (Es1 시트 셀 단위 대조)", () => {
  const base = {
    model: "The New 5 Series 가솔린 2.0 520i 2026년형",
    vehiclePrice: 110_000_000,
    termMonths: 60,
    annualMileageKm: 20_000,
  };

  it("취득원가·잔가·잔가율·잔가사 선택은 딜러 금리와 무관하게 엑셀과 정확히 일치", () => {
    const q = quoteBnkOperatingLease(base);
    expect(q.acquisitionCost).toBe(117_000_000); // Es1!B134
    expect(q.residualValue).toBe(68_750_000); // Es1!B139 / 운용리스견적!H19
    expect(q.residualRate).toBeCloseTo(0.625, 5); // 운용리스견적!I19
    expect(q.guarantor).toBe("JY"); // 7개 잔가사 중 최댓값
  });

  it("실제 제휴 딜러 금리(BMW-동성모터스 5.41%)를 지정하면 월리스료가 엑셀 저장값과 근접(오차 0.1% 이내)", () => {
    const q = quoteBnkOperatingLease({ ...base, annualRate: 0.0541 });
    // 엑셀 저장값 1,260,000원 — PMT의 지급수수료(공채/마케팅비 등 소액 조정항)
    // 일부는 미이식이라 완전 오차 0은 아니지만 0.1% 이내로 근접해야 한다.
    expect(Math.abs(q.monthlyPayment - 1_260_000) / 1_260_000).toBeLessThan(0.001);
  });

  it("annualRate 미지정 시 '비제휴' 최고금리(7.41%)를 안전한 기본값으로 사용 — 딜러 몰라도 낮게 보이지 않음", () => {
    const q = quoteBnkOperatingLease(base);
    expect(q.annualRate).toBe(0.0741);
    const withPartnerRate = quoteBnkOperatingLease({ ...base, annualRate: 0.0541 });
    expect(q.monthlyPayment).toBeGreaterThan(withPartnerRate.monthlyPayment);
  });

  it("모델 미연동은 명확히 에러", () => {
    expect(() =>
      quoteBnkOperatingLease({ ...base, model: "존재하지않는모델" }),
    ).toThrow("모델 미연동");
  });

  it("보증금을 지정하면 월리스료가 낮아진다", () => {
    const noDeposit = quoteBnkOperatingLease(base);
    const withDeposit = quoteBnkOperatingLease({ ...base, depositRate: 0.3 });
    expect(withDeposit.deposit).toBeGreaterThan(0);
    expect(withDeposit.monthlyPayment).toBeLessThan(noDeposit.monthlyPayment);
  });
});
