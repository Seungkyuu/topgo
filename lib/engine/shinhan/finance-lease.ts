/**
 * 신한카드 오토리스(금융) 통합 견적 — 엑셀 `오토리스(운용&금융)_CA용`의
 * 상품구분(AI3=1) 분기를 이식.
 *
 * 운용리스와 취득원가·CA수수료·PMT 골격은 동일하지만 두 가지가 다르다:
 *   - 보증금(AN16): AI3=1(금융리스)이면 조건 IF($AI$31=TRUE,$AI$3>=2,...)가 거짓이 되어
 *     항상 0 (운용리스만 보증금 구간 적용)
 *   - 잔가(AN14/H17): 잔가군 매트릭스 clamp 없이 사용자가 지정한 잔가율을
 *     그대로 사용(금융리스는 만기 잔존가치를 계약으로 직접 정하는 구조)
 *
 *   월리스료 = ROUNDUP(PMT((금리+0.01%)/12, 기간,
 *                -(취득원가+CA수수료), 잔가), -1)
 *
 * ⚠ 이 워크북에는 금융리스로 저장된 실측 골든케이스가 없어, 운용리스와 동일하게
 *   검증된 취득원가·CA수수료·PMT 공식을 재사용해 이식했다(공식 자체는 AR17 수식
 *   그대로이며 분기 조건만 다르다). 잔가율 0(완전상환)이 기본값이다.
 */

import { excelPmt, roundUp, roundDown, impliedCustomerRate } from "../finance";
import { findShinhanVehicle } from "./vehicle";
import {
  resolveShinhanOperatingLeaseRate,
  resolveShinhanRateSurcharge,
  shinhanAcquisitionConstants,
  shinhanDefaultCaFeeRate,
} from "./rates";

export interface ShinhanFinanceLeaseInput {
  model: string;
  termMonths: number;
  /** 만기 잔존가치율 (기본 0 = 완전상환) */
  residualRate?: number;
  optionPrice?: number;
  discount?: number;
  caFeeRate?: number;
  vehiclePrice?: number;
}

export interface ShinhanFinanceLeaseQuote {
  monthlyPayment: number;
  annualRate: number;
  residualRate: number;
  principal: number;
  acquisitionCost: number;
  residualValue: number;
  vehiclePrice: number;
  /** 고객 실효금리(표시용, 캐피탈 간 동일 기준 비교용 — 계산에는 안 쓰임) */
  customerRate: number;
}

export function quoteShinhanFinanceLease(
  input: ShinhanFinanceLeaseInput,
): ShinhanFinanceLeaseQuote {
  const {
    model,
    termMonths,
    residualRate = 0,
    optionPrice = 0,
    discount = 0,
    caFeeRate = shinhanDefaultCaFeeRate(),
  } = input;

  const vehicle = findShinhanVehicle(model);
  if (!vehicle) throw new Error("모델 미연동");

  const vehiclePrice = input.vehiclePrice ?? vehicle.vehiclePrice;
  const principal = vehiclePrice + optionPrice - discount;

  const c = shinhanAcquisitionConstants();
  const rawTax =
    (principal / 1.1) * c.taxRate - (vehicle.fuel === "E" ? c.evTaxRebate : 0);
  const acquisitionTax = roundDown(Math.max(rawTax, 0), -1);
  const acquisitionCost =
    principal + acquisitionTax + c.bondCost + c.deliveryCost + c.stampDuty;

  const caFee = acquisitionCost * caFeeRate;
  const residualValue = roundUp(principal * residualRate, -4);

  const annualRate = resolveShinhanOperatingLeaseRate();
  const rate = (annualRate + resolveShinhanRateSurcharge()) / 12;
  const monthlyPayment = roundUp(
    excelPmt(rate, termMonths, -(acquisitionCost + caFee), residualValue, 0),
    -1,
  );

  const customerRate = impliedCustomerRate(
    monthlyPayment,
    termMonths,
    residualValue,
    acquisitionCost,
  );

  return {
    monthlyPayment,
    annualRate,
    residualRate,
    principal,
    acquisitionCost,
    residualValue,
    vehiclePrice,
    customerRate,
  };
}
