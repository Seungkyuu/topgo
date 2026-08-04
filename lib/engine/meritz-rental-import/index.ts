/**
 * 메리츠 수입(EV) 장기렌트 — "차량가 → 원금(취득원가)" 전체 사슬. 테슬라·
 * 폴스타·BYD 전용(카탈로그의 모든 모델이 EV).
 *
 * meritz-rental-domestic/index.ts와 같은 구조(취득원가 산정 → PMT 렌트료
 * 변환은 calcMeritzDomesticRental 재사용)지만, 아래 지점이 국산과 다르다
 * (Model 3 RWD(보조금) 실 견적, 기본가격 45,000,000·EV보조금 2,200,000으로
 * 견적조건 시트 수식을 셀 단위까지 확인, 취득원가 39,185,451 정확히 일치):
 *
 *   · 개별소비세 기준세액 = 기준금액×5%×130%(국산은 4%×130%) — 견적조건!H59
 *   · 전기차보조금(수기입력, 렌트_입력!X15)을 취득원가에서 추가로 차감 — H21
 *   · 취득세 감면(140만원)은 잔가군 열이 "X"인 특수 트림엔 미적용 — H33
 *   · 금리 등급표(STRATEGY_RATES)가 국산과 별도 표(전략AA=6.5% 등, 견적조건
 *     F35:H50 셀 값 그대로)
 *   · 정비비는 항상 0(이 카탈로그의 정비 시트 전 등급이 0원으로 확인됨)
 *
 * ⚠ 지급수수료(PMT pv 차감분)는 정확한 산정식을 못 구했다 — 견적조건 시트에
 *   "9. 지급수수료 수수료상한선 10%"로 명시된 상한값을 그대로 썼다(국산은
 *   실 견적 역산으로 5%를 썼지만, 여기는 검증할 실 견적 결과값이 없어 "낮게
 *   보이면 안 된다" 원칙에 따라 문서화된 상한을 안전한 기본값으로 사용).
 */

import { roundUp, roundDown } from "../finance";
import {
  findImportRentalVehicle,
  resolveImportRentalResidual,
  type ImportRentalVehicle,
} from "./vehicle";
import { calcMeritzDomesticRental, type MeritzDomesticRentalQuote } from "../meritz-rental-domestic/rental";

function trunc10(v: number): number {
  return Math.trunc(v / 10) * 10;
}

/** 개별소비세 기준세율 — 견적조건!H59 "기준세액(5.0%)" = 5%×130% */
const CONSUMPTION_TAX_RATE = 0.05;
const CONSUMPTION_TAX_SURCHARGE = 1.3;
const EV_TAX_REBATE = 3_900_000;
const EV_ACQUISITION_TAX_REBATE = 1_400_000;
const ACQUISITION_TAX_RATE = 0.04;

/** 지급수수료(금융 공제) — 엑셀 명시 상한값(견적조건!M42/Q42 "수수료상한선") */
const FINANCE_DEDUCTION_RATE = 0.1;

/** 전략등급별 금리 — 견적조건!F35:H50 셀 값 그대로(국산 표와 다른 별도 표) */
const STRATEGY_RATES: Record<string, number> = {
  전략AA: 0.065,
  전략B: 0.058,
  일반: 0.0525,
  전략: 0.055,
  전략E: 0.06,
  전략AAA: 0.057,
  전략AB: 0.0592,
  전략A: 0.059,
  전략BBB: 0.043,
  전략D: 0.047,
  전략F: 0.044,
  전략G: 0.065,
  전략P: 0.075,
  비전략: 0.085,
};

export interface MeritzImportRentalQuoteInput {
  model: string;
  /** 기본 가격(옵션·할인 전) */
  vehiclePrice: number;
  optionPrice?: number;
  discount?: number;
  termMonths: number;
  annualMileageKm: number;
  /** 1차 메이커 탁송료(기본 0) */
  deliveryFee1?: number;
  /** 2차 탁송료 + 기본용품(지역별, 기본 233,200 — 엑셀 예시의 서울/경기/인천 기준) */
  deliveryFee2?: number;
  /** 등록제비용(기본 28,000) */
  registrationFee?: number;
  /** 용품비(기본 0) */
  accessoryFee?: number;
  /** 전기차 보조금(국고+지방, 원) — 지역·시기별 수기입력값이라 기본 0 */
  evSubsidy?: number;
  depositRate?: number;
}

export function quoteMeritzImportRental(
  input: MeritzImportRentalQuoteInput,
): MeritzDomesticRentalQuote & {
  principal: number;
  residualRate: number;
  annualRate: number;
  vehicle: ImportRentalVehicle;
  strategyGrade: string;
} {
  const {
    model,
    vehiclePrice,
    optionPrice = 0,
    discount = 0,
    termMonths,
    annualMileageKm,
    deliveryFee1 = 0,
    deliveryFee2 = 233_200,
    registrationFee = 28_000,
    accessoryFee = 0,
    evSubsidy = 0,
    depositRate = 0,
  } = input;

  const vehicle = findImportRentalVehicle(model);
  if (!vehicle) throw new Error("모델 미연동");

  const residualRate = resolveImportRentalResidual(vehicle, termMonths, annualMileageKm);
  if (residualRate === null) throw new Error("잔가율 미등록");

  const isEV = vehicle.fuel === "EV";

  const basePrice = vehiclePrice + optionPrice;

  // 면세가격A(H13) = 공급가격A(H14) + 부가세A(H15)
  const supplyA = Math.round(basePrice / vehicle.consumptionTaxFactor + deliveryFee1 / 1.1);
  const vatA = Math.round(supplyA * 0.1);
  const dutyFreePrice = supplyA + vatA;

  // 출고가격(H17) → 공급가격B(H18)
  const shippedPrice = dutyFreePrice - discount;
  const supplyB = Math.round(shippedPrice / 1.1);

  // 개별소비세(H27~H32): 기준금액×5%×130% − EV감면(390만), EV는 음수면 0
  const taxBase = roundDown(supplyB - deliveryFee1 / 1.1, -3);
  const rawConsumptionTax = Math.round(taxBase * CONSUMPTION_TAX_RATE * CONSUMPTION_TAX_SURCHARGE);
  let consumptionTax = isEV ? rawConsumptionTax - EV_TAX_REBATE : rawConsumptionTax;
  if (isEV) consumptionTax = consumptionTax < 0 ? 0 : consumptionTax + 100;
  const consumptionTaxAcquisition = roundDown(consumptionTax * 0.04, -1);
  const totalConsumptionTax = consumptionTax + consumptionTaxAcquisition;

  // 취득세(H22): EV는 140만원 감면, 단 잔가군 열이 "X"인 특수 트림은 미적용
  const evAcqRebate = isEV && !vehicle.evAcquisitionTaxRebateExcluded ? EV_ACQUISITION_TAX_REBATE : 0;
  const rawAcquisitionTax = isEV
    ? Math.max(supplyB * ACQUISITION_TAX_RATE - evAcqRebate, 0)
    : supplyB * ACQUISITION_TAX_RATE;
  const acquisitionTax = trunc10(rawAcquisitionTax);

  // 취득원가(H21) = 공급가격B + (2차탁송료+용품비)/1.1 + 개별소비세계 + 취득세
  //                + 등록제비용 − 전기차보조금(EV만)
  const principal =
    supplyB +
    (deliveryFee2 + accessoryFee) / 1.1 +
    totalConsumptionTax +
    acquisitionTax +
    registrationFee -
    (isEV ? evSubsidy : 0);

  const residualValue = roundUp(basePrice * residualRate, -3);
  const annualRate = STRATEGY_RATES[vehicle.strategyGrade] ?? STRATEGY_RATES["일반"];

  const depositAdjustment = depositRate > 0 ? roundUp(principal * depositRate, -1) : 0;
  const financeDeduction = roundUp(principal * FINANCE_DEDUCTION_RATE, -1);

  const quote = calcMeritzDomesticRental({
    principal,
    residualValue,
    annualRate,
    termMonths,
    monthlyVehicleTax: 0, // EV 정액 자동차세는 카탈로그 미확보 — 상담 시 확정, 화면엔 별도 안내
    monthlyMaintenance: 0, // 이 카탈로그는 정비 전 등급 0원으로 확인됨
    financeDeduction,
    depositAdjustment,
  });

  return { ...quote, principal, residualRate, annualRate, vehicle, strategyGrade: vehicle.strategyGrade };
}

export { findImportRentalVehicle, listImportRentalVehicles } from "./vehicle";
export type { ImportRentalVehicle } from "./vehicle";
