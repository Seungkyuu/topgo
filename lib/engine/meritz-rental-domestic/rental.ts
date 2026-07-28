/**
 * 메리츠 국산차 장기렌트 견적 엔진 — 엑셀 `견적조건`/`렌트_입력시트` 사슬 이식.
 *
 * 렌트는 리스와 달리 월 렌트료에 자동차세·정비·(선택)보험이 포함되고 VAT가 붙는다.
 *
 *   금융분   = ROUNDUP(PMT(금리/12, 기간,
 *               −원금 − 공제 + 보증금조정, ROUND(잔가/1.1,0) − 보증금조정), -1)
 *   공급가   = ROUNDUP(금융분 + 자동차세 + 보험 + 정비 + 차고지 500 + 조합 700, -2)
 *   부가세   = 공급가 × 10%
 *   월 렌트료 = 공급가 + 부가세
 *
 * 골든케이스: 국산 35,000,000 / 36개월 / 잔가율 0.7 → 잔가 24,500,000
 *   원금 30,175,588.5 / 금리 5.2% / 공제 700,000
 *   자동차세 2,400 / 보험 51,700 / 정비 38,200
 *   → 금융분 355,130 / 공급가 448,700 / 부가세 44,870 / 월 493,570 (엑셀, 오차 0)
 *
 * ⚠ 원금(과세표준+취득세+부대 다층 체인)·정비(정비군별 표)·잔가율(모델·기간·주행)은
 *   모델별 참조데이터에서 온다 — 현재 엔진은 그 값들을 입력으로 받는다(자동조회는 다음 단계).
 *   보험은 운전자 나이·담보에 따라 달라져 모델만으로 결정되지 않으므로 입력값(기본 0=별도).
 */

import { excelPmt, roundUp, impliedCustomerRate } from "../finance";

export interface MeritzDomesticRentalInput {
  /** 원금 (과세표준+취득세+부대) — 견적조건!H21 */
  principal: number;
  /** 계약 잔가 (원) = ROUNDUP(차량가 × 잔가율, -3) */
  residualValue: number;
  /** 연 적용금리 (예: 0.052) */
  annualRate: number;
  termMonths: number;
  /** 월 자동차세, 원 */
  monthlyVehicleTax: number;
  /** 월 정비비, 원 */
  monthlyMaintenance: number;
  /** 월 보험료, 원 (기본 0 = 보험 별도). 운전자 조건에 따라 달라짐 */
  monthlyInsurance?: number;
  /** 차고지비, 원 (기본 500) */
  parkingFee?: number;
  /** 조합비, 원 (기본 700) */
  unionFee?: number;
  /** 금융 공제(취급수수료 등), 원 (엑셀 CC19) — pv에서 차감 */
  financeDeduction?: number;
  /** 보증금 조정, 원 (기본 0) */
  depositAdjustment?: number;
}

export interface MeritzDomesticRentalQuote {
  financePortion: number;
  supplyPrice: number;
  vat: number;
  monthlyPayment: number;
  residualValue: number;
  customerRate: number;
}

export function calcMeritzDomesticRental(
  input: MeritzDomesticRentalInput,
): MeritzDomesticRentalQuote {
  const {
    principal,
    residualValue,
    annualRate,
    termMonths,
    monthlyVehicleTax,
    monthlyMaintenance,
    monthlyInsurance = 0,
    parkingFee = 500,
    unionFee = 700,
    financeDeduction = 0,
    depositAdjustment = 0,
  } = input;

  const pv = -principal - financeDeduction + depositAdjustment;
  const fv = Math.round(residualValue / 1.1) - depositAdjustment;
  const financePortion = roundUp(excelPmt(annualRate / 12, termMonths, pv, fv, 0), -1);

  const supplyPrice = roundUp(
    financePortion +
      monthlyVehicleTax +
      monthlyInsurance +
      monthlyMaintenance +
      parkingFee +
      unionFee,
    -2,
  );
  const vat = supplyPrice * 0.1;
  const monthlyPayment = supplyPrice + vat;

  const customerRate = impliedCustomerRate(
    monthlyPayment,
    termMonths,
    Math.round(residualValue / 1.1),
    principal,
  );

  return { financePortion, supplyPrice, vat, monthlyPayment, residualValue, customerRate };
}
