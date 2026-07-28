/**
 * 신한카드 오토리스(운용) 견적 엔진.
 *
 * 엑셀 신한 `오토리스(운용&금융)_CA용` 시트의 운용리스 계산(AR17)을 이식.
 * PMT 구조는 오릭스 리스와 동형이나 취득원가·부대·보증금·잔가 조립이 다르고,
 * 금리에 +0.01% 가산, 결과는 ROUNDUP(-1).
 *
 * 이식된 사슬 (엑셀 AR17 → 코드):
 *   월리스료 = ROUNDUP( PMT((금리 + 0.01%)/12, 기간,
 *                        pv = −(취득원가 + 부대비용) + 보증금 + 선수조정,
 *                        fv = 잔가 − 보증금), -1 )
 *
 * ⚠ 신한 오토리스 전용 어댑터. 3시나리오(AR/AS/AT) 중 운용리스 기준.
 *   취득원가·부대·잔가·보증금은 모델별 참조데이터에서 오며 현재는 입력으로 받는다.
 */

import { excelPmt, roundUp } from "../finance";

export interface ShinhanAutoLeaseInput {
  /** 취득원가, 원 (엑셀 AQ8) */
  acquisitionCost: number;
  /** 부대비용 합계, 원 (엑셀 AN24~33) */
  incidentalCost: number;
  /** 잔가, 원 (엑셀 AN14) */
  residualValue: number;
  /** 보증금, 원 (엑셀 AN16) */
  deposit: number;
  /** 연 적용금리 (예: 0.059) */
  annualRate: number;
  /** 리스기간(개월) */
  termMonths: number;
  /** 금리 가산 (기본 0.0001 = +0.01%) */
  rateSurcharge?: number;
  /** 선수 조정, 원 (기본 0) — 엑셀 AN19+AN21 */
  advanceAdjustment?: number;
}

export interface ShinhanAutoLeaseResult {
  /** 월 리스료 */
  monthlyPayment: number;
}

export function calcShinhanAutoLease(
  input: ShinhanAutoLeaseInput,
): ShinhanAutoLeaseResult {
  const {
    acquisitionCost,
    incidentalCost,
    residualValue,
    deposit,
    annualRate,
    termMonths,
    rateSurcharge = 0.0001,
    advanceAdjustment = 0,
  } = input;

  const rate = (annualRate + rateSurcharge) / 12;
  const pv = -(acquisitionCost + incidentalCost) + deposit + advanceAdjustment;
  const fv = residualValue - deposit;
  const monthlyPayment = roundUp(excelPmt(rate, termMonths, pv, fv, 0), -1);

  return { monthlyPayment };
}
