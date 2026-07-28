/**
 * 오릭스캐피탈 운용리스 견적 엔진.
 *
 * 실제 캐피탈사 엑셀(`운용리스` 시트)의 계산 사슬을 코드로 이식한 것으로,
 * 저장 당시 계산값(골든 케이스)과 오차 0으로 일치함을 테스트로 보장한다.
 *
 * 이식된 핵심 사슬 (엑셀 셀 → 코드):
 *   과세표준  X24 = ROUNDDOWN(차량가 / 1.1, -2)
 *   취득세    AI7 = ROUNDDOWN(과세표준 * 취득세율(7%), -1)
 *   취득원가  X30 = 차량가 + 취득세 + 부대비용
 *   이용금액  X31 = 취득원가 - 선납금
 *   보증금    X33 = ROUNDUP(차량가 * 보증금율, -3)
 *   잔가      X37 = ROUNDUP(차량가 * 잔가율, -3)
 *   월리스료  X42 = ROUNDUP(PMT(금리/12, 기간, -(이용금액+수수료-보증금-선수), 잔가-보증금), -2) + 선수리스료조정
 *
 * 아직 단순화한 부분(추후 참조테이블 연동):
 *   - 잔가율: 모델·기간별 잔가율표(엑셀 AA110:AD238) 대신 입력값 사용
 *   - 자동차세·보험료: 리스료 포함 조건일 때만 총리스료에 가산(현재 미포함 상품 기준)
 *   - 등록세·공채: 판매사지원/고객별도부담 시 취득원가 기여 0 (해당 케이스 기준)
 */

import { excelPmt, roundUp, roundDown, assertRatio } from "../finance";

export interface OrixOperatingLeaseInput {
  /** 차량가격(소비자가 + 옵션 − 할인), 원 */
  vehiclePrice: number;
  /** 리스기간(개월) */
  termMonths: number;
  /** 연 적용금리 (예: 0.052) */
  annualRate: number;
  /**
   * 잔가율 (예: 0.45).
   * 운영 정책상 항상 **최대잔가율**을 전달한다(엑셀 `최대잔가율적용` 경로).
   * 추후 모델·기간별 잔가율표(고잔가군)에서 최대값을 조회해 자동 주입한다.
   */
  residualRate: number;
  /** 보증금율 (예: 0.30) */
  depositRate: number;
  /** 선납금(취득원가 차감), 원 */
  prepayment?: number;
  /** 선수금, 원 */
  advancePayment?: number;
  /** 취득세율 (기본 0.07) */
  acquisitionTaxRate?: number;
  /** 부대비용, 원 (기본 100,000) */
  incidentalCost?: number;
  /** 취급수수료, 원 (기본 0) */
  handlingFee?: number;
}

export interface OrixOperatingLeaseResult {
  /** 과세표준 */
  taxBase: number;
  /** 취득세 */
  acquisitionTax: number;
  /** 취득원가 */
  acquisitionCost: number;
  /** 이용금액(리스 원금) */
  financedAmount: number;
  /** 보증금 */
  deposit: number;
  /** 잔가(유예금) */
  residualValue: number;
  /** 월 리스료 (순수리스료) */
  monthlyPayment: number;
}

export function calcOrixOperatingLease(
  input: OrixOperatingLeaseInput,
): OrixOperatingLeaseResult {
  const {
    vehiclePrice,
    termMonths,
    annualRate,
    residualRate,
    depositRate,
    prepayment = 0,
    advancePayment = 0,
    acquisitionTaxRate = 0.07,
    incidentalCost = 100_000,
    handlingFee = 0,
  } = input;

  assertRatio("보증금 비율", depositRate);
  assertRatio("잔가율", residualRate);
  if (depositRate + residualRate > 1) {
    throw new Error("보증금 비율과 잔가율의 합이 100%를 초과할 수 없습니다");
  }

  // 과세표준 = ROUNDDOWN(차량가 / 1.1, -2)
  const taxBase = roundDown(vehiclePrice / 1.1, -2);
  // 취득세 = ROUNDDOWN(과세표준 * 취득세율, -1)
  const acquisitionTax = roundDown(taxBase * acquisitionTaxRate, -1);
  // 취득원가 = 차량가 + 취득세 + 부대비용
  const acquisitionCost = vehiclePrice + acquisitionTax + incidentalCost;
  // 이용금액 = 취득원가 - 선납금
  const financedAmount = acquisitionCost - prepayment;
  // 보증금 = ROUNDUP(차량가 * 보증금율, -3)
  const deposit = roundUp(vehiclePrice * depositRate, -3);
  // 잔가 = ROUNDUP(차량가 * 잔가율, -3)
  const residualValue = roundUp(vehiclePrice * residualRate, -3);

  // 월 리스료 = ROUNDUP(PMT(금리/12, 기간, pv, fv), -2)
  const rate = annualRate / 12;
  const pv = -financedAmount - handlingFee + deposit + advancePayment;
  const fv = residualValue - deposit;
  const monthlyPayment = roundUp(excelPmt(rate, termMonths, pv, fv, 0), -2);

  return {
    taxBase,
    acquisitionTax,
    acquisitionCost,
    financedAmount,
    deposit,
    residualValue,
    monthlyPayment,
  };
}
