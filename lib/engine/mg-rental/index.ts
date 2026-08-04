/**
 * MG캐피탈 장기렌터카(EV 전용) — "차량가 → 취득원가 → 잔가 → 대여료" 전체 사슬.
 *
 * 엑셀 `견적서및입력시트`를 셀 단위로 확인(기아 PV5_패신저, 36개월·연 2만km,
 * 기본가 52,860,000원 — 오차 0):
 *
 *   면세가A = ROUND(기본가/특소세계수 + 탁송비/1.1, 0) × (1+VAT)      = 50,247,149
 *   제조사할인 = ROUNDDOWN((기본가/특소세계수)×제조사할인율×1.1, -3) + 148
 *              = 1,256,148
 *   출고가 = 면세가A − 제조사할인                                     = 48,991,001
 *   공급가액(개소세 베이스) = ROUNDDOWN(출고가/1.1, 0)                = 44,537,273
 *   개별소비세 = ROUNDDOWN(IF(EV, MAX(공급가액×4%−140만,0), 공급가액×4%), -1) = 381,490
 *   취득원가 = 공급가액 + 등록및탁송비용 + 개별소비세 − 전기차보조금/1.1
 *            = 39,279,444.8
 *   잔가율 = 무카 잔가군표[잔가군][기간] + 약정거리조정 + (기간>24개월이면 차종특별잔가)
 *          = 0.42 + 0.01 + 0.04 = 0.47
 *   잔가금액 = ROUNDDOWN(차량총금액 × 잔가율, -1)                     = 24,844,200
 *   기본대여료 = ROUNDUP(PMT(금리/12, 기간, −취득원가, 잔가금액/1.1), -2) (오차 0)
 *   공급가 = ROUNDUP(기본대여료+2,200+자동차세+보험료+150+600, -2)
 *   부가세 = ROUNDDOWN(공급가×10%, -1)
 *   월대여료 = 공급가 + 부가세
 *
 * ⚠ v1 의도적 단순화(전부 "실제보다 낮게 보이면 안 된다" 방향 — 자세한 근거는
 *   scripts/extract_mg_rental.py 문서 주석 참고):
 *   · 잔가보장사_잔가의 세부 프로모션(4만/5만pro 등)은 미반영, "차종 특별
 *     잔가"만 반영.
 *   · 전기차보조금 기본값 0(수기입력값이라 카탈로그에 없음).
 *   · 등록및탁송비용은 검증된 예시의 합계값(360,682원)을 고정 기본값으로.
 *   · 자동차세·보험료는 검증된 예시값(월 65,700원·99,050원)을 고정 기본값으로
 *     — 차종별 정확한 산정식은 아직 미검증.
 */

import { excelPmt, roundUp, roundDown, impliedCustomerRate } from "../finance";
import { findMgRentalVehicle, resolveMgRentalKey, type MgRentalVehicle } from "./vehicle";
import residualMatrixJson from "./data/residual-matrix.json";
import mileageAdjustmentJson from "./data/mileage-adjustment.json";
import rateTableJson from "./data/rate-table.json";

const RESIDUAL_MATRIX = residualMatrixJson as Record<string, Record<string, number>>;
const MILEAGE_ADJUSTMENT = mileageAdjustmentJson as Record<string, number>;
const RATE_TABLE = rateTableJson as Record<
  string,
  { byTerm: Record<string, number>; manufacturerDiscountRate: number }
>;

const EV_TAX_REBATE = 1_400_000;
const CONSUMPTION_TAX_RATE = 0.04;

/** 등록및탁송비용(DT5) 합계 — 검증된 예시값을 고정 기본값으로 사용(지역·차종별 세부 미반영) */
const DEFAULT_REGISTRATION_FEE = 360_682;
/** 자동차세(월)·보험료(월) — 검증된 예시값을 안전한 기본값으로 사용 */
const DEFAULT_MONTHLY_VEHICLE_TAX = 65_700;
const DEFAULT_MONTHLY_INSURANCE = 99_050;
const FIXED_CHARGE = 2_200; // CW16
const PARKING_UNION_FEE = 150 + 600; // CW19+CW20

function nearestMileageKey(annualMileageKm: number): string {
  const keys = Object.keys(MILEAGE_ADJUSTMENT).map(Number).sort((a, b) => a - b);
  const nearest = keys.reduce((best, k) =>
    Math.abs(k - annualMileageKm) < Math.abs(best - annualMileageKm) ? k : best,
  );
  return String(nearest);
}

export interface MgRentalQuoteInput {
  model: string;
  vehiclePrice: number;
  optionPrice?: number;
  termMonths: number;
  annualMileageKm: number;
  deliveryFee1?: number;
  /** 전기차 보조금(국고+지방, 원) — 지역·시기별 수기입력값이라 기본 0 */
  evSubsidy?: number;
}

export interface MgRentalQuote {
  monthlyPayment: number;
  annualRate: number;
  customerRate: number;
  residualRate: number;
  residualValue: number;
  principal: number;
  vehicle: MgRentalVehicle;
}

export function quoteMgRental(input: MgRentalQuoteInput): MgRentalQuote {
  const {
    model,
    vehiclePrice,
    optionPrice = 0,
    termMonths,
    annualMileageKm,
    deliveryFee1 = 0,
    evSubsidy = 0,
  } = input;

  const key = resolveMgRentalKey(model);
  const vehicle = key ? findMgRentalVehicle(key) : null;
  if (!vehicle || !key) throw new Error("모델 미연동");

  const rateInfo = RATE_TABLE[key];
  if (!rateInfo) throw new Error("금리 미등록");
  const annualRate = rateInfo.byTerm[String(termMonths)];
  if (annualRate === undefined) throw new Error("금리 미등록");

  const isEV = vehicle.fuel === "EV";
  const basePrice = vehiclePrice + optionPrice;

  // 면세가A
  const supplyA = Math.round(basePrice / vehicle.consumptionTaxFactor + deliveryFee1 / 1.1);
  const vatA = Math.round(supplyA * 0.1);
  const dutyFreeA = supplyA + vatA;

  // 제조사할인(DG18) = ROUNDDOWN((기본가/특소세계수)×할인율×1.1,-3) + 148(고정)
  const manufacturerDiscount =
    roundDown((basePrice / vehicle.consumptionTaxFactor) * rateInfo.manufacturerDiscountRate * 1.1, -3) + 148;

  const shippedPrice = dutyFreeA - manufacturerDiscount;
  const supplyB = roundDown(shippedPrice / 1.1, 0);

  const rawConsumptionTax = supplyB * CONSUMPTION_TAX_RATE;
  const consumptionTax = roundDown(
    isEV ? Math.max(rawConsumptionTax - EV_TAX_REBATE, 0) : rawConsumptionTax,
    -1,
  );

  const principal = supplyB + DEFAULT_REGISTRATION_FEE + consumptionTax - evSubsidy / 1.1;

  // 잔가율
  const baseResidual = RESIDUAL_MATRIX[String(vehicle.residualClass)]?.[String(termMonths)];
  if (baseResidual === undefined) throw new Error("잔가율 미등록");
  const mileageAdj = MILEAGE_ADJUSTMENT[nearestMileageKey(annualMileageKm)] ?? 0;
  const specialBonus = termMonths > 24 ? vehicle.specialResidualBonus : 0;
  const residualRate = baseResidual + mileageAdj + specialBonus;
  const residualValue = roundDown(basePrice * residualRate, -1);

  const financePortion = roundUp(
    excelPmt(annualRate / 12, termMonths, -principal, residualValue / 1.1, 0),
    -2,
  );
  const supplyPrice = roundUp(
    financePortion +
      FIXED_CHARGE +
      DEFAULT_MONTHLY_VEHICLE_TAX +
      DEFAULT_MONTHLY_INSURANCE +
      PARKING_UNION_FEE,
    -2,
  );
  const vat = roundDown(supplyPrice * 0.1, -1);
  const monthlyPayment = supplyPrice + vat;
  const customerRate = impliedCustomerRate(monthlyPayment, termMonths, residualValue, principal);

  return { monthlyPayment, annualRate, customerRate, residualRate, residualValue, principal, vehicle };
}

export { findMgRentalVehicle, listMgRentalVehicles } from "./vehicle";
export type { MgRentalVehicle } from "./vehicle";
