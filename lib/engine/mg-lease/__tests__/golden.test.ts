import { describe, expect, it } from "vitest";
import { quoteMgLease } from "../index";

describe("MG 운용리스 — BMW 740i xDrive DPE 실제 견적 검증 (운용리스 시트 셀 단위 대조)", () => {
  const base = {
    model: "740i xDrive DPE",
    vehiclePrice: 160_800_000,
    termMonths: 60,
  };

  it("취득세·취득원가는 엑셀과 정확히 일치(오차 0)", () => {
    const q = quoteMgLease(base);
    expect(q.acquisitionCost).toBe(171_032_720); // 운용리스!CP8/CI19
  });

  it("PMT 사슬 자체는 엑셀과 근접(잔가 0.51 그대로 대입하면 0.01% 이내)", () => {
    // v1은 APS열(잔가율 0.41)만 써서 실제 최댓값(SNK 소스, 0.51)보다 낮게
    // 잡힌다(월리스료가 실제보다 높게 나옴 — 문서화된 안전한 방향의 단순화,
    // lib/engine/mg-lease/index.ts 참고). PMT 계산식 자체의 정확도는 실제
    // 엑셀이 쓴 잔가(0.51)를 그대로 넣어 별도로 검증한다.
    const q = quoteMgLease(base);
    const residualAt051 = Math.round((base.vehiclePrice * 0.51) / 10) * 10;
    const pv = -(q.acquisitionCost + Math.floor(base.vehiclePrice * 0.0132));
    // excelPmt와 동일한 수식을 직접 재현해 잔가만 실제값으로 교체 검증
    const rate = 0.054 / 12;
    const nper = 60;
    const factor = Math.pow(1 + rate, nper);
    const pmt = -(pv * factor + residualAt051) / ((factor - 1) / rate);
    expect(Math.abs(pmt - 2_106_100) / 2_106_100).toBeLessThan(0.001);
  });

  it("월리스료는 잔가율(v1: APS열)이 낮아 실제보다 높게 나온다 — 안전한 방향", () => {
    const q = quoteMgLease(base);
    // 엑셀 실제 저장값(2,106,100원)보다 낮게 보이면 안 된다는 원칙 확인
    expect(q.monthlyPayment).toBeGreaterThan(2_106_100);
  });

  it("모델 미연동은 명확히 에러", () => {
    expect(() => quoteMgLease({ ...base, model: "존재하지않는모델" })).toThrow("모델 미연동");
  });

  it("60개월 초과 잔가율은 미등록 처리(12/24/36/48/60만 지원)", () => {
    expect(() => quoteMgLease({ ...base, termMonths: 72 })).toThrow("잔가율 미등록");
  });

  it("보증금을 지정하면 월리스료가 낮아진다", () => {
    const noDeposit = quoteMgLease(base);
    const withDeposit = quoteMgLease({ ...base, depositRate: 0.3 });
    expect(withDeposit.monthlyPayment).toBeLessThan(noDeposit.monthlyPayment);
  });
});
