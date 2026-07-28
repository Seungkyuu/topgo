/**
 * 메리츠 국산차 장기렌트 — "차량가 → 원금(취득원가)" 전체 사슬.
 *
 * calcMeritzDomesticRental()(rental.ts)은 원금·잔가·정비비 등을 이미 계산된
 * 값으로 입력받는 저수준 함수였다 — 이 파일은 그 값들을 실제 차량가에서
 * 자동으로 뽑아내는 상위 래퍼다. 제네시스 GV70 실제 견적 예시(60개월·
 * 2만km·정비 Basic·할인 0)로 셀 단위까지 검증했다(엑셀 견적조건 시트,
 * 오차 0):
 *
 *   면세가격A = ROUND((기본가격+옵션)/개소세계수 + 1차탁송료/1.1, 0) + 부가세A
 *   출고가격  = 면세가격A − 할인
 *   공급가격B = ROUND(출고가격/1.1, 0)
 *   기준금액  = ROUNDDOWN(공급가격B − 1차탁송료/1.1, -3)
 *   개별소비세 = ROUND(기준금액×4%×130%,0) − 친환경차감면(EV 390만/HEV 91만)
 *              [경차·승합·다인승·면제 차종은 0]
 *   개소세취득세 = ROUNDDOWN(개별소비세×4%, -1)
 *   취득세    = TRUNC(공급가격B×4% [EV는 -140만], -1)
 *   취득원가  = 공급가격B + (2차탁송료+용품비)/1.1 + (개별소비세+개소세취득세)
 *              + 취득세 + 등록제비용
 *   잔가      = ROUNDUP((기본가격+옵션)×잔가율, -3)
 *   금리      = 차종별 전략등급(STRATEGY_RATES) 조회
 *
 * → 취득원가 54,593,688.82 / 잔가 31,323,000 (전부 정확히 일치)
 *
 * ⚠ 미검증/의도적 단순화(사용자 확정 또는 데이터 부재로 보수적 기본값 사용) —
 *   원칙: 고객 화면엔 실제보다 낮게 보이면 안 된다(나중에 상담에서 더
 *   낮춰줄 수 있는 건 괜찮아도, 견적보다 비싸지는 건 신뢰 문제다). 그래서
 *   추정이 필요한 항목은 전부 반올림 대신 올림(roundUp)으로 안전 마진을 둔다.
 *   · 개별소비세율 5.0%("26년 7월 출고~" 구간)로 고정 — 정부 한시 정책이라
 *     엑셀이 갱신되면 이 상수(CONSUMPTION_TAX_RATE)도 같이 바꿔야 한다.
 *   · 자동차세는 표준 세율(배기량×200원×1.3, 신차 기준)로 근사, 올림 처리
 *     — 엑셀의 정확한 월할 공식은 미확보.
 *   · 보험료는 사용자 확정값(대물 1억원 · 26세 이상 한정 · 연 50만원)을
 *     기본값으로 고정(DEFAULT_ANNUAL_INSURANCE) — 실제 운전자 조건에
 *     따라 달라질 수 있어 상담 시 확정, 화면엔 이 기준값으로 노출.
 *   · 정비상품은 사용자 확정에 따라 항상 "Basic" 등급만 사용.
 *   · 지급수수료(PMT의 pv 차감분)는 정확한 산정식을 못 구해 취득원가의
 *     5%(FINANCE_DEDUCTION_RATE)로 근사 — GV70 예시(월 859,540원)를
 *     역산하면 실제 값과 거의 일치(+1,650원)했고, 원 rental.ts 문서의
 *     국산 골든케이스(700,000원)에 5%를 적용해도 실제보다 높게 나와
 *     "낮게 보이면 안 된다"는 원칙을 두 경우 다 만족한다.
 *   · 경차/승합/다인승 개별소비세 면제, EV 전기차보조금(H10)은 모델 목록에
 *     현재 해당 차종이 없어 로직만 마련(실사용 검증 안 됨).
 */

import { roundUp, roundDown } from "../finance";
import {
  findRentalVehicle,
  resolveRentalResidual,
  resolveBasicMaintenance,
  type RentalVehicle,
} from "./vehicle";
import { calcMeritzDomesticRental, type MeritzDomesticRentalQuote } from "./rental";

function trunc10(v: number): number {
  return Math.trunc(v / 10) * 10;
}

/** 개별소비세율 — 정부 한시 정책. 현재("26년 7월 출고~") 구간 5.0% 고정. */
const CONSUMPTION_TAX_RATE = 0.04; // 기준세액 산정식의 표준세율(4%)에 시행령 130% 가산 별도 적용
const CONSUMPTION_TAX_SURCHARGE = 1.3;
const HYBRID_TAX_REBATE = 910_000;
const EV_TAX_REBATE = 3_900_000;
const EV_ACQUISITION_TAX_REBATE = 1_400_000;
const ACQUISITION_TAX_RATE = 0.04;

const EXEMPT_INSURANCE_GRADES = new Set(["승합", "경차", "다인승", "면제"]);

/** 사용자 확정 보험 기준 — 대물배상 1억원 · 26세 이상 한정운전, 연 50만원 */
export const INSURANCE_TERMS = { propertyDamage: 100_000_000, minAge: 26 };
const DEFAULT_ANNUAL_INSURANCE = 500_000;
/** 지급수수료(금융 공제) 근사치 — 아래 quoteMeritzDomesticRental 내부 주석 참고 */
const FINANCE_DEDUCTION_RATE = 0.05;

/** 전략등급별 금리 — 엑셀 견적조건 시트 표 그대로(15개 등급 확인) */
const STRATEGY_RATES: Record<string, number> = {
  기본: 0.065,
  전략: 0.056,
  전략AA: 0.052,
  전략AAA: 0.063,
  전략B: 0.058,
  전략BBB: 0.05,
  전략A: 0.059,
  전략C: 0.052,
  전략D: 0.057,
  전략E: 0.06,
  전략F: 0.059,
  전략G: 0.057,
  전략T: 0.054,
  일반: 0.084,
  비전략: 0.105,
};

export interface MeritzDomesticRentalQuoteInput {
  model: string;
  /** 기본 가격(옵션·할인 전) */
  vehiclePrice: number;
  optionPrice?: number;
  /** 할인(일반 할인 등, 특판 자동계산식은 미이식 — 직접 입력) */
  discount?: number;
  termMonths: number;
  annualMileageKm: number;
  /** 1차 메이커 탁송료(수입 특수 케이스만, 기본 0) */
  deliveryFee1?: number;
  /** 2차 탁송료(지역별, 기본 352,500 — 엑셀 예시의 서울/경기/인천 기준) */
  deliveryFee2?: number;
  /** 등록제비용(지역별, 기본 26,000) */
  registrationFee?: number;
  /** 용품비(기본 0) */
  accessoryFee?: number;
  depositRate?: number;
}

export function quoteMeritzDomesticRental(
  input: MeritzDomesticRentalQuoteInput,
): MeritzDomesticRentalQuote & {
  principal: number;
  residualRate: number;
  annualRate: number;
  vehicle: RentalVehicle;
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
    deliveryFee2 = 352_500,
    registrationFee = 26_000,
    accessoryFee = 0,
    depositRate = 0,
  } = input;

  const vehicle = findRentalVehicle(model);
  if (!vehicle) throw new Error("모델 미연동");

  const residualRate = resolveRentalResidual(vehicle, termMonths, annualMileageKm);
  if (residualRate === null) throw new Error("잔가율 미등록");

  const maintenance = resolveBasicMaintenance(model, termMonths);
  if (maintenance === null) throw new Error("정비단가 미등록");

  const isEV = vehicle.fuel === "EV";
  const isHybrid = vehicle.fuel === "하이브리드";
  const isExempt = EXEMPT_INSURANCE_GRADES.has(vehicle.insuranceGrade);

  const basePrice = vehiclePrice + optionPrice;

  // 면세가격A(H13) = 공급가격A(H14) + 부가세A(H15)
  const supplyA = Math.round(basePrice / vehicle.consumptionTaxFactor + deliveryFee1 / 1.1);
  const vatA = Math.round(supplyA * 0.1);
  const dutyFreePrice = supplyA + vatA;

  // 출고가격(H17) → 공급가격B(H18)
  const shippedPrice = dutyFreePrice - discount;
  const supplyB = Math.round(shippedPrice / 1.1);

  // 개별소비세(H28~H32)
  const taxBase = roundDown(supplyB - deliveryFee1 / 1.1, -3);
  const ecoRebate = isEV ? EV_TAX_REBATE : isHybrid ? HYBRID_TAX_REBATE : 0;
  let consumptionTax = isExempt
    ? 0
    : Math.round(taxBase * CONSUMPTION_TAX_RATE * CONSUMPTION_TAX_SURCHARGE) - ecoRebate;
  if (isHybrid || isEV) consumptionTax = consumptionTax < 0 ? 0 : consumptionTax + 100;
  const consumptionTaxAcquisition = roundDown(consumptionTax * 0.04, -1);
  const totalConsumptionTax = consumptionTax + consumptionTaxAcquisition;

  // 취득세(H22)
  const evAcqRebate = isEV ? EV_ACQUISITION_TAX_REBATE : 0;
  const rawAcquisitionTax =
    isHybrid || isEV
      ? Math.max(supplyB * ACQUISITION_TAX_RATE - evAcqRebate, 0)
      : supplyB * ACQUISITION_TAX_RATE;
  const acquisitionTax = trunc10(rawAcquisitionTax);

  // 취득원가(H21)
  const principal =
    supplyB +
    (deliveryFee2 + accessoryFee) / 1.1 +
    totalConsumptionTax +
    acquisitionTax +
    registrationFee;

  const residualValue = roundUp(basePrice * residualRate, -3);
  const annualRate = STRATEGY_RATES[vehicle.strategyGrade] ?? STRATEGY_RATES["일반"];

  // 자동차세: 표준 세율 근사(EV는 정액 130,000/년, 그 외 배기량×200원×교육세 130%)를
  // 12로 나눠 10원 단위로 올림 — 엑셀의 정확한 월할 공식은 미확보라, 실제보다
  // 낮게 보이는 것보단 조금 높게 보이는 쪽이 안전하다(상담에서 낮춰줄 수 있음).
  const annualVehicleTax = isEV ? 130_000 : vehicle.engineCc * 200 * 1.3;
  const monthlyVehicleTax = roundUp(annualVehicleTax / 12, -1);

  // 보험료: 사용자 확정 기준(대물 1억원·26세 이상 한정, 연 50만원)을 월할.
  const monthlyInsurance = roundUp(DEFAULT_ANNUAL_INSURANCE / 12, -1);

  const depositAdjustment = depositRate > 0 ? roundUp(principal * depositRate, -1) : 0;

  // 지급수수료(금융 공제, PMT의 pv에서 차감): 엑셀의 정확한 산정식은 못
  // 구했다 — GV70 실제 견적(월 859,540원)을 역산하면 취득원가의 약 5%였고,
  // 국산 골든케이스(원 rental.ts 문서의 700,000원)에도 5%를 적용하면 실제
  // 값보다 높게 나온다(700,000 < 취득원가×5%=1,508,779) — 두 경우 모두
  // "낮게 보이지 않는다"는 원칙을 만족해 5%를 안전한 기본값으로 쓴다.
  const financeDeduction = roundUp(principal * FINANCE_DEDUCTION_RATE, -1);

  const quote = calcMeritzDomesticRental({
    principal,
    residualValue,
    annualRate,
    termMonths,
    monthlyVehicleTax: Math.max(monthlyVehicleTax, 0),
    monthlyMaintenance: maintenance,
    monthlyInsurance,
    financeDeduction,
    depositAdjustment,
  });

  return { ...quote, principal, residualRate, annualRate, vehicle, strategyGrade: vehicle.strategyGrade };
}

export { findRentalVehicle, listRentalVehicles } from "./vehicle";
export type { RentalVehicle } from "./vehicle";
