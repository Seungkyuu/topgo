/**
 * 메리츠 Polestar 전용 운용리스 견적 엔진 — 엑셀 `운용리스 내부` 사슬 이식.
 *
 *   차량가최종 = 차량가 − (차량가×할인율 + 추가할인)
 *   과세표준   = 차량가최종 / 1.1
 *   등취득세   = ROUNDDOWN(과세표준×7%, -1) − 140만(EV 취득세감면)
 *   취득원가   = 차량가최종 + 등취득세 + 공채(EV 0) + 탁송료 + 부대비 + 추가부대비
 *   잔가       = ROUNDDOWN(차량가최종×잔가율, -3)
 *   리스료     = ROUNDUP(PMT(IRR/12, 기간, −(취득원가−보증금−선납금+수수료),
 *                잔가−보증금−선납금), -2)
 *
 * 골든케이스(엑셀 `운용리스 내부` 시트 실제 저장값, 오차 0):
 *   Polestar4 Long Range Dual Motor + PLDC (3차시) / 차량가 70,000,000
 *   할인율 13% + 추가할인 2,200,000 → 차량가최종 58,700,000 / 36개월 / IRR 7.9%
 *   탁송료 143,000 + 부대비 131,400 → 취득원가 61,309,850
 *   잔가율 65% → 잔가 38,155,000 → 월리스료 976,100
 *
 * ⚠ CM/AG 수수료·잔가보장수수료는 이 골든케이스에서 전부 0으로 확인됐다
 *   (제휴사="기타"). 다른 조건에서 수수료가 붙는지는 확인된 예시가 하나뿐이라
 *   미확인 — 안전한 기본값 0으로 시작하고, 실제 다른 견적 예시를 받으면
 *   바로잡는다. IRR(금리)도 브랜드 고정표가 없어 사용자가 견적마다 입력하는
 *   협의 금리로 취급한다(기본값은 골든케이스의 7.9%).
 */

import { excelPmt, roundUp, roundDown, impliedCustomerRate, assertRatio } from "../finance";
import { findPolestarLeaseVehicle, resolvePolestarResidual } from "./vehicle";

const ACQUISITION_TAX_RATE = 0.07;
const EV_ACQUISITION_TAX_REBATE = 1_400_000;
// ⚠ 엑셀 "IRR"(0.079, 목표 표시값)과 실제 PMT에 들어가는 "금리"(연 7.909...%)는
// 다른 값이다 — PMT는 후자를 쓴다. 골든케이스 저장값 그대로 기본 금리로 사용.
const DEFAULT_ANNUAL_RATE = 0.07909225156456674;

export interface MeritzPolestarLeaseInput {
  model: string;
  /** 차량가(할인 전, 다나와/갓챠 시세 입력) */
  vehiclePrice: number;
  termMonths: number;
  depositRate?: number;
  prepaymentRate?: number;
  /** 탁송료. 기본 143,000(골든케이스) */
  deliveryFee?: number;
  /** 부대비. 기본 131,400(골든케이스) */
  incidentalFee?: number;
  /** 추가부대비. 기본 0 */
  additionalIncidentalFee?: number;
  /** 공채비용. EV는 기본 0 */
  bondCost?: number;
  /** 협의 금리(연, PMT에 그대로 대입). 기본은 골든케이스 저장값(약 7.91%) */
  annualRate?: number;
  /** 잔가율 재정의 (미지정 시 모델·기간 자동, 36/48/60개월만 지원) */
  residualRate?: number;
}

export interface MeritzPolestarLeaseQuote {
  monthlyPayment: number;
  annualRate: number;
  residualRate: number;
  residualValue: number;
  finalPrice: number;
  acquisitionCost: number;
  acquisitionTax: number;
  deposit: number;
  prepayment: number;
  vehiclePrice: number;
  customerRate: number;
}

export function quoteMeritzPolestarLease(
  input: MeritzPolestarLeaseInput,
): MeritzPolestarLeaseQuote {
  const {
    model,
    vehiclePrice,
    termMonths,
    depositRate = 0,
    prepaymentRate = 0,
    deliveryFee = 143_000,
    incidentalFee = 131_400,
    additionalIncidentalFee = 0,
    bondCost = 0,
    annualRate = DEFAULT_ANNUAL_RATE,
  } = input;

  assertRatio("보증금율", depositRate);
  assertRatio("선납율", prepaymentRate);

  const vehicle = findPolestarLeaseVehicle(model);
  if (!vehicle) throw new Error("모델 미연동");

  const residualRate = input.residualRate ?? resolvePolestarResidual(vehicle, termMonths);
  if (residualRate === null || residualRate === undefined) {
    throw new Error("잔가율 미등록");
  }
  assertRatio("잔가율", residualRate);
  if (depositRate + prepaymentRate + residualRate > 1) {
    throw new Error("보증금·선납금·잔가 비율의 합이 100%를 초과할 수 없습니다");
  }

  const finalPrice = vehiclePrice - (vehiclePrice * vehicle.discountRate + vehicle.discountAmount);
  const taxBase = finalPrice / 1.1;
  const acquisitionTax =
    roundDown(taxBase * ACQUISITION_TAX_RATE, -1) -
    (vehicle.evAcquisitionTaxRebate ? EV_ACQUISITION_TAX_REBATE : 0);
  const acquisitionCost =
    finalPrice + acquisitionTax + bondCost + deliveryFee + incidentalFee + additionalIncidentalFee;

  const residualValue = roundDown(finalPrice * residualRate, -3);
  const deposit = roundDown(finalPrice * depositRate, -3);
  const prepayment = roundDown(finalPrice * prepaymentRate, -3);

  const pv = -acquisitionCost + prepayment + deposit;
  const fv = residualValue - prepayment - deposit;
  const monthlyPayment = roundUp(excelPmt(annualRate / 12, termMonths, pv, fv, 0), -2);

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
    residualValue,
    finalPrice,
    acquisitionCost,
    acquisitionTax,
    deposit,
    prepayment,
    vehiclePrice,
    customerRate,
  };
}
