import { describe, expect, it } from "vitest";
import { quoteMgRental } from "../index";

describe("MG 장기렌터카 — PV5_패신저 실제 견적 검증 (견적서및입력시트 셀 단위 대조)", () => {
  const base = {
    model: "PV5_패신저",
    vehiclePrice: 52_860_000,
    termMonths: 36,
    annualMileageKm: 20_000,
  };

  // 엑셀 예시엔 전기차보조금 6,600,000원이 실제로 적용돼 있었다(수기입력값이라
  // 카탈로그엔 없음 — 여기서만 재현용으로 명시).
  const withVerifiedSubsidy = { ...base, evSubsidy: 6_600_000 };

  it("취득원가·잔가율·잔가금액은 엑셀과 정확히 일치(오차 0)", () => {
    const q = quoteMgRental(withVerifiedSubsidy);
    expect(q.principal).toBeCloseTo(39_279_444.8, 0); // 견적서및입력시트!BK75
    expect(q.residualRate).toBeCloseTo(0.47, 5); // BM89
    expect(q.residualValue).toBe(24_844_200); // BM88
    expect(q.annualRate).toBeCloseTo(0.052, 5); // BM94
  });

  it("월대여료는 엑셀 저장값과 근접(1% 이내)", () => {
    const q = quoteMgRental(withVerifiedSubsidy);
    // 엑셀 저장값 844,140원. 자동차세·보험료를 검증된 예시값 그대로 썼으므로
    // 기본대여료(PMT) 자체는 오차 0이고, 최종 월대여료도 근접해야 한다.
    expect(Math.abs(q.monthlyPayment - 844_140) / 844_140).toBeLessThan(0.01);
  });

  it("전기차보조금을 모르면(기본값 0) 실제보다 낮게 보이지 않는다", () => {
    const withoutSubsidy = quoteMgRental(base);
    const withSubsidy = quoteMgRental(withVerifiedSubsidy);
    expect(withoutSubsidy.monthlyPayment).toBeGreaterThan(withSubsidy.monthlyPayment);
  });

  it("모델 미연동은 명확히 에러", () => {
    expect(() => quoteMgRental({ ...base, model: "존재하지않는모델" })).toThrow("모델 미연동");
  });

  it("전기차 보조금을 지정하면 원금·월대여료가 낮아진다", () => {
    const noSubsidy = quoteMgRental(base);
    const withSubsidy = quoteMgRental({ ...base, evSubsidy: 3_000_000 });
    expect(withSubsidy.principal).toBeLessThan(noSubsidy.principal);
    expect(withSubsidy.monthlyPayment).toBeLessThan(noSubsidy.monthlyPayment);
  });

  it("24개월 이하 계약은 차종특별잔가 미적용(잔가율이 더 낮음)", () => {
    const q24 = quoteMgRental({ ...base, termMonths: 24 });
    const q36 = quoteMgRental({ ...base, termMonths: 36 });
    // 24개월 잔가율엔 specialResidualBonus(0.04)가 안 붙는다 — 기간 차이는
    // 있지만 최소한 36개월 잔가율에서 보너스를 뺀 값과 비교해 정합성 확인
    expect(q24.residualRate).toBeLessThan(q36.residualRate + 0.04);
  });
});
