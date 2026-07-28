/**
 * 오릭스캐피탈 금융리스 견적 엔진.
 *
 * 엑셀 `금융리스` 시트의 Z열 계산을 이식. 운용리스와 달리 잔가·보증금이 없고
 * 이용금액을 전액 상환한다(fv = 0).
 *
 * 이식된 사슬 (엑셀 Z열 → 코드):
 *   취득원가  Z30 = 차량가 + 취득원가포함 세금
 *   이용금액  Z31 = 취득원가 − 선납금
 *   월리스료  Z42 = ROUNDUP( PMT(금리/12, 기간, pv = −(이용금액 + 수수료), fv = 0), -2 )
 *
 * ⚠ 캐피탈·시트마다 계산 구조가 다르므로 이 엔진은 오릭스 금융리스 전용이다.
 */

import { excelPmt, roundUp } from "../finance";

export interface OrixFinanceLeaseInput {
  /** 차량가격(소비자가 + 옵션 − 할인), 원 */
  vehiclePrice: number;
  /** 리스기간(개월) */
  termMonths: number;
  /** 연 적용금리 (예: 0.055) */
  annualRate: number;
  /** 선납금, 원 */
  prepayment: number;
  /** 취득원가에 포함되는 세금(취득세 등), 원 (기본 0 = 고객별도부담) */
  financedTaxes?: number;
  /** 취급수수료, 원 (기본 0) */
  handlingFee?: number;
}

export interface OrixFinanceLeaseResult {
  /** 취득원가 */
  acquisitionCost: number;
  /** 리스이용금액 */
  financedAmount: number;
  /** 월 리스료 */
  monthlyPayment: number;
}

export function calcOrixFinanceLease(
  input: OrixFinanceLeaseInput,
): OrixFinanceLeaseResult {
  const {
    vehiclePrice,
    termMonths,
    annualRate,
    prepayment,
    financedTaxes = 0,
    handlingFee = 0,
  } = input;

  const acquisitionCost = vehiclePrice + financedTaxes;
  const financedAmount = acquisitionCost - prepayment;

  const rate = annualRate / 12;
  const pv = -(financedAmount + handlingFee);
  const monthlyPayment = roundUp(excelPmt(rate, termMonths, pv, 0, 0), -2);

  return { acquisitionCost, financedAmount, monthlyPayment };
}
