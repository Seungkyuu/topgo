import { describe, expect, it } from "vitest";
import { quoteMeritzImportRental } from "../index";

describe("메리츠 수입(EV) 렌트 — Model 3 RWD(보조금) 실제 견적 검증", () => {
  it("취득원가는 엑셀 견적조건 시트와 정확히 일치(오차 0)", () => {
    const q = quoteMeritzImportRental({
      model: "Model 3 RWD (보조금)",
      vehiclePrice: 45_000_000,
      optionPrice: 0,
      discount: 0,
      termMonths: 36,
      annualMileageKm: 20_000,
      evSubsidy: 2_200_000,
    });
    // 엑셀 견적조건!H21 — 계산 사슬(원금)은 갱신과 무관하게 그대로 일치.
    expect(q.principal).toBeCloseTo(39_185_451, 0);
    // 2608_V2 갱신분 — 전략AA → 수입E로 재분류, 금리도 6.5% → 5.25%로 변경.
    expect(q.strategyGrade).toBe("수입E");
    expect(q.annualRate).toBeCloseTo(0.0525, 4);
  });

  it("EV 취득세감면 제외 플래그가 있는 트림은 감면 없이 계산된다", () => {
    const excluded = quoteMeritzImportRental({
      model: '폴스타 4 듀얼모터 22" 퍼포먼스',
      vehiclePrice: 80_000_000,
      termMonths: 36,
      annualMileageKm: 20_000,
    });
    const notExcluded = quoteMeritzImportRental({
      model: "폴스타 4 듀얼모터",
      vehiclePrice: 80_000_000,
      termMonths: 36,
      annualMileageKm: 20_000,
    });
    // 감면 제외 트림은 취득세가 140만원 더 붙어 원금이 더 높아야 한다
    expect(excluded.principal).toBeGreaterThan(notExcluded.principal);
  });

  it("전기차 보조금을 많이 받을수록 원금·월 납부액이 낮아진다(안전한 기본값 0)", () => {
    const noSubsidy = quoteMeritzImportRental({
      model: "Model Y RWD (보조금)",
      vehiclePrice: 55_000_000,
      termMonths: 48,
      annualMileageKm: 20_000,
    });
    const withSubsidy = quoteMeritzImportRental({
      model: "Model Y RWD (보조금)",
      vehiclePrice: 55_000_000,
      termMonths: 48,
      annualMileageKm: 20_000,
      evSubsidy: 3_000_000,
    });
    expect(withSubsidy.principal).toBeLessThan(noSubsidy.principal);
    expect(withSubsidy.monthlyPayment).toBeLessThan(noSubsidy.monthlyPayment);
  });

  it("모델 미연동/잔가율 미등록은 명확히 에러를 던진다", () => {
    expect(() =>
      quoteMeritzImportRental({
        model: "존재하지않는모델",
        vehiclePrice: 50_000_000,
        termMonths: 36,
        annualMileageKm: 20_000,
      }),
    ).toThrow("모델 미연동");

    expect(() =>
      quoteMeritzImportRental({
        model: "Model 3 RWD (보조금)",
        // 2608_V2 갱신분에서 24개월 잔가율이 새로 채워졌다 — 이제 미등록
        // 구간은 12개월뿐이라 테스트 대상을 그쪽으로 옮긴다.
        vehiclePrice: 45_000_000,
        termMonths: 12,
        annualMileageKm: 20_000,
      }),
    ).toThrow("잔가율 미등록");
  });
});
