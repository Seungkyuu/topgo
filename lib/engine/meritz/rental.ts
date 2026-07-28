/**
 * 메리츠캐피탈 렌터카(장기렌트) 견적 엔진.
 *
 * 엑셀 메리츠 렌터카 견적시트(`렌트_입력`/`견적조건`)의 계산 사슬을 이식.
 * 오릭스 리스와 달리 렌트료에 보험·자동차세·정비가 포함되고 VAT가 붙는다.
 *
 * 이식된 사슬 (엑셀 셀 → 코드):
 *   금융분   견적조건!M48 = ROUNDUP(PMT(금리/12, 기간, −원금 + 보증금조정, ROUND(잔가/1.1) − 보증금조정), -2)
 *   공급가   렌트_입력!EG14 = 금융분 + 자동차세 + 보험료 + 정비비 + 차고지 + 조합 + 멤버쉽
 *   부가세   렌트_입력!BR26 = ROUNDDOWN(공급가 × 0.1, 0)
 *   매회납부 렌트료 = 공급가 + 부가세
 *
 * ⚠ 메리츠 렌터카 전용 어댑터. 원금(과세표준+세금)·잔가율·보험료·정비비는
 *    모델별 참조데이터에서 오며, 현재 엔진은 그 값들을 입력으로 받는다(추출은 다음 단계).
 */

import { excelPmt, roundUp, roundDown, impliedCustomerRate } from "../finance";

export interface MeritzRentalInput {
  /** 원금(과세표준 + 개소세·취득세 + 부대), 원 — 견적조건!H21 */
  principal: number;
  /** 계약 잔가(VAT 포함) = 차량가 × 렌트 잔가율, 원 */
  residualValue: number;
  /** 연 적용금리 (예: 0.06) */
  annualRate: number;
  /** 렌트기간(개월) */
  termMonths: number;
  /** 월 자동차세분, 원 */
  monthlyVehicleTax: number;
  /** 월 보험료, 원 */
  monthlyInsurance: number;
  /** 월 정비비, 원 */
  monthlyMaintenance: number;
  /** 차고지비용, 원 (기본 500) */
  parkingFee?: number;
  /** 조합비용, 원 (기본 700) */
  unionFee?: number;
  /** 멤버쉽, 원 (기본 0) */
  membershipFee?: number;
  /** 보증금 조정(선납/보증금 반영), 원 (기본 0) — 엑셀 CC8 */
  depositAdjustment?: number;
}

export interface MeritzRentalResult {
  /** 금융분(순수 렌탈료, VAT별도) */
  financePortion: number;
  /** 공급가(VAT별도) */
  supplyPrice: number;
  /** 부가세 */
  vat: number;
  /** 매회납부 렌트료(월, VAT포함) */
  monthlyPayment: number;
  /** 고객 실효금리(표시용, 캐피탈 간 동일 기준 비교용 — 계산에는 안 쓰임) */
  customerRate: number;
}

export function calcMeritzRental(input: MeritzRentalInput): MeritzRentalResult {
  const {
    principal,
    residualValue,
    annualRate,
    termMonths,
    monthlyVehicleTax,
    monthlyInsurance,
    monthlyMaintenance,
    parkingFee = 500,
    unionFee = 700,
    membershipFee = 0,
    depositAdjustment = 0,
  } = input;

  // 금융분 = ROUNDUP(PMT(금리/12, 기간, pv, fv), -2)
  const rate = annualRate / 12;
  const pv = -principal + depositAdjustment;
  const fv = Math.round(residualValue / 1.1) - depositAdjustment;
  const financePortion = roundUp(excelPmt(rate, termMonths, pv, fv, 0), -2);

  // 공급가 = 금융분 + 부대 월비용
  const supplyPrice =
    financePortion +
    monthlyVehicleTax +
    monthlyInsurance +
    monthlyMaintenance +
    parkingFee +
    unionFee +
    membershipFee;

  const vat = roundDown(supplyPrice * 0.1, 0);
  const monthlyPayment = supplyPrice + vat;

  const customerRate = impliedCustomerRate(
    monthlyPayment,
    termMonths,
    Math.round(residualValue / 1.1),
    principal,
  );

  return { financePortion, supplyPrice, vat, monthlyPayment, customerRate };
}
