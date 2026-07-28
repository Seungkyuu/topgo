/**
 * 오릭스 운용리스 통합 견적 — 캡처 필드만으로 월납입 자동 산출.
 *
 * 캡처에서 나온 차종·가격·기간·주행거리·보증금·선납금만 있으면
 * 최대잔가(residual.ts)와 적용금리(rates.ts)를 자동 조회해 월납입까지 계산한다.
 * 사람·외부 입력으로 남는 것은 할인가(GETCHA)와 세금 포함 여부 정도다.
 */

import { calcOrixOperatingLease, type OrixOperatingLeaseResult } from "./operating-lease";
import { calcOrixFinanceLease } from "./finance-lease";
import { resolveOrixResidualRate } from "./residual";
import {
  resolveOrixOperatingLeaseRate,
  resolveOrixFinanceLeaseRate,
} from "./rates";
import { findOrixVehicle } from "./vehicle";
import { orixMonthlyVehicleTax } from "./vehicle-tax";
import { impliedCustomerRate } from "../finance";

export interface OrixOperatingLeaseQuoteInput {
  /** 차종(잔가율표 모델명) */
  model: string;
  /** 차량가격(소비자가 + 옵션 − 할인), 원 */
  vehiclePrice: number;
  /** 리스기간(개월) */
  termMonths: number;
  /** 약정 주행거리(연간 km) */
  annualMileageKm: number;
  /** 보증금율 (예: 0.30) */
  depositRate: number;
  /** 선납금, 원 (기본 0) */
  prepayment?: number;
  /** 선수금, 원 (기본 0) — 있으면 금리 가산 */
  advancePayment?: number;
  /** 자동차세를 리스료에 포함할지 (기본 false) */
  includeVehicleTax?: boolean;
  /** 월 보험료, 원 (리스료 포함 시). 기본 0 = 미포함 */
  monthlyInsurance?: number;
}

export interface OrixOperatingLeaseQuote extends OrixOperatingLeaseResult {
  /** 자동 조회된 최대잔가율 */
  residualRate: number;
  /** 자동 산정된 적용금리 */
  annualRate: number;
  /** 월 자동차세 (미포함이면 0) */
  monthlyVehicleTax: number;
  /** 월 보험료 (미포함이면 0) */
  monthlyInsurance: number;
  /** 총 리스료(월) = 순수리스료 + 자동차세 + 보험료 */
  totalMonthlyPayment: number;
  /** 고객 실효금리(표시용, 캐피탈 간 동일 기준 비교용 — 계산에는 안 쓰임) */
  customerRate: number;
}

export function quoteOrixOperatingLease(
  input: OrixOperatingLeaseQuoteInput,
): OrixOperatingLeaseQuote {
  const { model, vehiclePrice, termMonths, annualMileageKm, depositRate } = input;
  const prepayment = input.prepayment ?? 0;
  const advancePayment = input.advancePayment ?? 0;

  // 잔가·금리 자동 산정
  const residualRate = resolveOrixResidualRate(model, termMonths, annualMileageKm);
  const annualRate = resolveOrixOperatingLeaseRate(
    termMonths,
    depositRate,
    advancePayment > 0,
  );

  const result = calcOrixOperatingLease({
    vehiclePrice,
    termMonths,
    annualRate,
    residualRate,
    depositRate,
    prepayment,
    advancePayment,
  });

  // 총리스료 = 순수리스료 + 자동차세(포함 시) + 보험료(포함 시)
  const vehicle = findOrixVehicle(model);
  const monthlyVehicleTax = input.includeVehicleTax
    ? orixMonthlyVehicleTax(vehicle?.displacementCc)
    : 0;
  const monthlyInsurance = input.monthlyInsurance ?? 0;
  const totalMonthlyPayment =
    result.monthlyPayment + monthlyVehicleTax + monthlyInsurance;

  const customerRate = impliedCustomerRate(
    totalMonthlyPayment,
    termMonths,
    result.residualValue,
    result.acquisitionCost,
  );

  return {
    ...result,
    residualRate,
    annualRate,
    monthlyVehicleTax,
    monthlyInsurance,
    totalMonthlyPayment,
    customerRate,
  };
}

// ─────────────────────────────────────────────────────────────
// 금융리스 통합 견적 (금리 자동)
// ─────────────────────────────────────────────────────────────

export interface OrixSimpleQuoteInput {
  /** 차종 */
  model: string;
  /** 차량가격(소비자가 + 옵션 − 할인), 원 */
  vehiclePrice: number;
  /** 기간(개월) */
  termMonths: number;
  /** 선납금, 원 (기본 0) */
  prepayment?: number;
}

export interface OrixSimpleQuote {
  annualRate: number;
  financedAmount: number;
  monthlyPayment: number;
  customerRate: number;
}

/** 금융리스 통합 견적 (금리 자동, 잔가 없음) */
export function quoteOrixFinanceLease(
  input: OrixSimpleQuoteInput,
): OrixSimpleQuote {
  const annualRate = resolveOrixFinanceLeaseRate(input.termMonths);
  const r = calcOrixFinanceLease({
    vehiclePrice: input.vehiclePrice,
    termMonths: input.termMonths,
    annualRate,
    prepayment: input.prepayment ?? 0,
  });
  const customerRate = impliedCustomerRate(
    r.monthlyPayment,
    input.termMonths,
    0,
    r.acquisitionCost,
  );
  return {
    annualRate,
    financedAmount: r.financedAmount,
    monthlyPayment: r.monthlyPayment,
    customerRate,
  };
}
