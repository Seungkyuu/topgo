/**
 * 메리츠캐피탈 금융리스 견적 — 엑셀 `금융리스 내부` 시트 이식.
 *
 *   이용금액(H4) = 차량가최종 - 선수금   [등록비용 별도 기준]
 *   리스료(H18)  = ROUNDUP(PMT(금리/12, 기간, -이용금액, 유예금), -1)
 *   금리는 견적 입력값 (2607 저장분 6.3% 기본)
 *
 * 골든케이스: BYD DOLPHIN / 65,000,000 / 36개월 / 선수 20% / 6.3%
 *   → 월 1,589,020 (엑셀 H18, 오차 0)
 */

import { excelPmt, roundUp, impliedCustomerRate } from "../finance";
import { findMeritzVehicle } from "./vehicle";
import leaseDataJson from "./data/lease-data.json";

const DATA = leaseDataJson as unknown as {
  financeLease: { defaultRate: number };
};

export interface MeritzFinanceLeaseInput {
  model: string;
  termMonths: number;
  /** 선수금 (원). 미지정 시 선수금율 사용 */
  prepayment?: number;
  /** 선수금율 (기본 0.2 — 엑셀 저장 시나리오) */
  prepaymentRate?: number;
  /** 유예금(만기 일시납, 원. 기본 0) */
  balloon?: number;
  /** 연금리 (기본 6.3%) */
  annualRate?: number;
  optionPrice?: number;
  discount?: number;
  vehiclePrice?: number;
}

export interface MeritzFinanceLeaseQuote {
  monthlyPayment: number;
  annualRate: number;
  financedAmount: number;
  prepayment: number;
  vehiclePrice: number;
  /** 고객 실효금리(표시용, 캐피탈 간 동일 기준 비교용 — 계산에는 안 쓰임) */
  customerRate: number;
}

export function quoteMeritzFinanceLease(
  input: MeritzFinanceLeaseInput,
): MeritzFinanceLeaseQuote {
  const {
    model,
    termMonths,
    prepaymentRate = 0.2,
    balloon = 0,
    annualRate = DATA.financeLease.defaultRate,
    optionPrice = 0,
    discount = 0,
  } = input;

  const vehicle = findMeritzVehicle(model);
  if (!vehicle) throw new Error("모델 미연동");

  const vehiclePrice = input.vehiclePrice ?? vehicle.vehiclePrice;
  const finalPrice = vehiclePrice + optionPrice - discount;
  const prepayment = input.prepayment ?? finalPrice * prepaymentRate;
  const financedAmount = finalPrice - prepayment;

  const monthlyPayment = roundUp(
    excelPmt(annualRate / 12, termMonths, -financedAmount, balloon, 0),
    -1,
  );

  const customerRate = impliedCustomerRate(
    monthlyPayment,
    termMonths,
    balloon,
    financedAmount,
  );

  return {
    monthlyPayment,
    annualRate,
    financedAmount,
    prepayment,
    vehiclePrice,
    customerRate,
  };
}
