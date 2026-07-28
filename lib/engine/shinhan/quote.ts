/**
 * 신한카드 오토리스(운용) 통합 견적 — 엑셀 `오토리스(운용&금융)_CA용` 전체 사슬 이식.
 *
 *   원금(AQ4)     = 차량가 + 옵션 - 할인
 *   취득세(AQ5)   = ROUNDDOWN(원금/1.1 × 7% - 전기차감면, -1)
 *   취득원가(AQ8) = 원금 + 취득세 + 공채 + 탁송 + 인지대 5,000
 *   CA수수료      = 취득원가 × 수수료율 (기본 4%, 실제 AD41 입력값)
 *   보증금(AN16)  = ROUNDUP(원금 × 보증금율, -4)
 *   잔가(AN14)    = ROUNDUP(원금 × 잔가율, -4)
 *     잔가율      = 지정 시 clamp(지정, 하한, 최대) / 미지정 시 최대(잔가군+주행거리조정)
 *   월리스료(AR17)= ROUNDUP(PMT((금리+0.01%)/12, 기간,
 *                    -(취득원가+CA수수료)+보증금+선수조정, 잔가-보증금), -1)
 *
 * 골든케이스: 포르쉐 CayenneCoupe가솔린3.0 / 옵션 21,000,000 / 할인 1,694,000
 *   60개월 / 보증금 10% / 잔가율 40% 지정 → 월 2,537,360원 (엑셀 저장값과 오차 0)
 *
 * ─── 실제 입력폼(AB~AD열) 대조로 확인된 것 ───────────────────────────────────
 *   AR20(고객 적용금리)은 이 상품(운용리스)에서는 실질적으로 주요기준!C7 하나뿐이다.
 *   보증금구간조정(AR19)·가입할인(AH53)·프로모션(AO21)·모델별IRR인하(AP20)는
 *   구조상/데이터상 사실상 항상 0이고, KCB 신용등급 트랙(AB33~36)은 금융리스에만
 *   적용된다(AI28 공식이 AI3>=2면 무조건 1). 따라서 "5.9%→5.66%" 같은 실제 계약과의
 *   금리 차이는 매달 갱신되는 주요기준!C7 스냅샷 차이가 유력하다 — annualRate로
 *   덮어쓸 수 있게 열어둔다.
 *
 *   선수금(AD28)·이손액(AN19=AC31)은 AR17의 PV에 직접 가산되는 게 확인됐다
 *   (calcShinhanAutoLease의 advanceAdjustment). 선납금(AD29)은 AR17 자체가 아니라
 *   최종 표시금액(H23→K24)에서 월할(선납금/기간)로 별도 차감되는 구조라 여기서는
 *   표시 단계에서 반영한다. 보험료(AC32)·자동차세(H18 포함여부)도 PMT가 아니라
 *   표시 단계에서 월할 가산/차감된다(H26/K24).
 */

import { calcShinhanAutoLease } from "./auto-lease";
import { findShinhanVehicle } from "./vehicle";
import {
  resolveShinhanMaxResidualRate,
  clampShinhanResidualRate,
} from "./residual";
import {
  resolveShinhanOperatingLeaseRate,
  resolveShinhanRateSurcharge,
  shinhanAcquisitionConstants,
  shinhanDefaultCaFeeRate,
} from "./rates";
import { orixMonthlyVehicleTax } from "../orix/vehicle-tax";
import { roundUp, roundDown, impliedCustomerRate, assertRatio } from "../finance";

export interface ShinhanOperatingLeaseInput {
  model: string;
  termMonths: number;
  /** 보증금율 (0~0.4) */
  depositRate: number;
  /** 약정 연간 주행거리(km). 기본 20,000 */
  annualMileageKm?: number;
  /** 옵션가 (기본 0) */
  optionPrice?: number;
  /** 할인액 (기본 0) */
  discount?: number;
  /** 잔가율 직접 지정 (미지정 시 최대잔가율 자동) */
  residualRate?: number;
  /** CA 수수료율 (기본 4% — 엑셀 AD41, 딜러/건별로 3%대까지 다름) */
  caFeeRate?: number;
  /** 차량가 재정의 (기본: 신한 마스터 가격) */
  vehiclePrice?: number;
  /**
   * 적용금리 재정의(엑셀 AI4=주요기준!C7). 매달 신한이 고시하는 기준금리라
   * 스냅샷 시점과 실제 계약 시점이 다르면 값이 달라진다 — 실제 승인금리를
   * 알고 있으면 여기 넣어서 정확히 맞출 수 있다.
   */
  annualRate?: number;
  /** 선수금, 원 (엑셀 AD28 — 원금에서 미리 차감, PV에 가산돼 월리스료를 낮춘다) */
  advancePayment?: number;
  /** 이손액, 원 (엑셀 AC31→AN19, PV에 그대로 가산) */
  damageDeduction?: number;
  /** 선납금, 원 (엑셀 AD29 — 월할로 나눠 표시 월리스료에서 차감) */
  prepaidRent?: number;
  /** 자동차세 포함 여부 (엑셀 H18). true면 월 자동차세를 표시금액에 가산 */
  includeVehicleTax?: boolean;
  /** 월 보험료, 원 (엑셀 AC32 — 표시금액에 가산). 기본 0 */
  monthlyInsurance?: number;
}

export interface ShinhanOperatingLeaseQuote {
  /** 최종 표시 월리스료 (선납금 차감·자동차세/보험료 가산 반영) */
  monthlyPayment: number;
  /** PMT 원 계산값 (선납금·자동차세·보험료 반영 전) */
  rawMonthlyPayment: number;
  annualRate: number;
  residualRate: number;
  deposit: number;
  /** 원금 (차량가+옵션-할인) */
  principal: number;
  acquisitionCost: number;
  residualValue: number;
  vehiclePrice: number;
  monthlyVehicleTax: number;
  /**
   * 고객 실효금리(표시용). 캐피탈사 내부 PMT 금리(annualRate)와는 다른,
   * 월납입·잔가·취득원가로 역산한 "체감 비용률" — 캐피탈사 간 동일 기준
   * 비교에 쓴다. 계산에는 쓰이지 않는 파생값이다.
   */
  customerRate: number;
}

export function quoteShinhanOperatingLease(
  input: ShinhanOperatingLeaseInput,
): ShinhanOperatingLeaseQuote {
  const {
    model,
    termMonths,
    depositRate,
    annualMileageKm = 20000,
    optionPrice = 0,
    discount = 0,
    caFeeRate = shinhanDefaultCaFeeRate(),
    advancePayment = 0,
    damageDeduction = 0,
    prepaidRent = 0,
    includeVehicleTax = false,
    monthlyInsurance = 0,
  } = input;

  assertRatio("보증금율", depositRate);

  const vehicle = findShinhanVehicle(model);
  if (!vehicle) throw new Error("모델 미연동");
  if (vehicle.residualGroup === "취급불가") throw new Error("리스 취급불가 모델");

  const vehiclePrice = input.vehiclePrice ?? vehicle.vehiclePrice;
  const principal = vehiclePrice + optionPrice - discount;

  // 잔가율: 지정 시 상·하한 보정, 미지정 시 최대잔가율
  const residualRate =
    input.residualRate !== undefined
      ? clampShinhanResidualRate(
          input.residualRate,
          vehicle.residualGroup,
          termMonths,
          annualMileageKm,
        )
      : resolveShinhanMaxResidualRate(
          vehicle.residualGroup,
          termMonths,
          annualMileageKm,
        );
  if (residualRate === null) throw new Error("잔가율 미등록");
  if (depositRate + residualRate > 1) {
    throw new Error("보증금 비율과 잔가율의 합이 100%를 초과할 수 없습니다");
  }

  // 취득원가 조립 (엑셀 AQ4~AQ8)
  const c = shinhanAcquisitionConstants();
  const rawTax =
    (principal / 1.1) * c.taxRate - (vehicle.fuel === "E" ? c.evTaxRebate : 0);
  const acquisitionTax = roundDown(Math.max(rawTax, 0), -1);
  const acquisitionCost =
    principal + acquisitionTax + c.bondCost + c.deliveryCost + c.stampDuty;

  const caFee = acquisitionCost * caFeeRate;
  const deposit = roundUp(principal * depositRate, -4);
  const residualValue = roundUp(principal * residualRate, -4);

  const annualRate = input.annualRate ?? resolveShinhanOperatingLeaseRate();
  const { monthlyPayment: rawMonthlyPayment } = calcShinhanAutoLease({
    acquisitionCost,
    incidentalCost: caFee,
    residualValue,
    deposit,
    annualRate,
    termMonths,
    rateSurcharge: resolveShinhanRateSurcharge(),
    advanceAdjustment: advancePayment + damageDeduction,
  });

  const monthlyVehicleTax = includeVehicleTax
    ? orixMonthlyVehicleTax(vehicle.engineCc)
    : 0;
  const prepaidRentCredit = roundUp(prepaidRent / termMonths, -1);
  const monthlyPayment =
    rawMonthlyPayment + monthlyVehicleTax + monthlyInsurance - prepaidRentCredit;

  const customerRate = impliedCustomerRate(
    monthlyPayment,
    termMonths,
    residualValue,
    acquisitionCost,
  );

  return {
    monthlyPayment,
    rawMonthlyPayment,
    annualRate,
    residualRate,
    deposit,
    principal,
    acquisitionCost,
    residualValue,
    vehiclePrice,
    monthlyVehicleTax,
    customerRate,
  };
}
