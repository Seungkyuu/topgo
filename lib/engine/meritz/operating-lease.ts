/**
 * 메리츠캐피탈 운용리스 통합 견적 — 엑셀 `운용리스 내부` 시트 이식.
 *
 *   취득원가(H8)   = 차량가최종 + 등취득세 + 공채 + 탁송료 + 부대비
 *     등취득세     = ROUNDDOWN(차량가최종/1.1 × 7% - 전기차감면, -1)
 *   보증금/선수금/잔가 = ROUNDDOWN(차량가최종 × 율, -3)
 *   금리(H36)     = 브랜드 기준금리 + 저보증금(<11%: +0.15%)
 *                   + 보증금·선수 40%↑(+0.3%) + 24MY(+0.5%)
 *   수수료        = CM(3%) + 제휴사(1.1%) + 추가(1%) [각 RD -1] + 고정 10,000
 *                   + 잔가보장수수료(잔가사 구간별)
 *   월리스료(H52) = ROUNDUP(PMT(금리/12, 기간,
 *                     -취득원가 + 보증금 + 선수금 - 수수료합, 잔가 - 보증금), -2)
 *
 * 골든케이스: Benz E 220d 4MATIC AMG Line / 81,000,000 / 60개월 / 2만km
 *   보증금 0 / 선수 10% / 잔가 APS 0.575 / 금리 6.5% → 월 976,700 (오차 0)
 */

import { excelPmt, roundUp, roundDown, impliedCustomerRate, assertRatio } from "../finance";
import { findMeritzVehicle } from "./vehicle";
import { resolveMeritzResidual } from "./residual";
import leaseDataJson from "./data/lease-data.json";

const DATA = leaseDataJson as unknown as {
  brandRates: Record<string, number>;
  rateSurcharges: {
    lowDepositBelow11pct: number;
    deposit40pctPlus: number;
    my24: number;
  };
  operatingFees: {
    cmFeeRate: number;
    partnerFeeRate: number;
    extraFeeRate: number;
    fixedFee: number;
  };
  acquisition: {
    taxRate: number;
    evTaxRebate: number;
    bondCost: number;
    deliveryCost: number;
    incidentalCost: number;
  };
  financeLease: { defaultRate: number };
};

export interface MeritzOperatingLeaseInput {
  model: string;
  termMonths: number;
  /** 보증금율 */
  depositRate: number;
  /** 장기선수금율 (기본 0.1 — 엑셀 저장 시나리오) */
  prepaymentRate?: number;
  annualMileageKm?: number;
  optionPrice?: number;
  discount?: number;
  /** 24년식 여부 (금리 +0.5%) */
  is24MY?: boolean;
  vehiclePrice?: number;
}

export interface MeritzOperatingLeaseQuote {
  monthlyPayment: number;
  annualRate: number;
  residualRate: number;
  residualValue: number;
  deposit: number;
  prepayment: number;
  acquisitionCost: number;
  guaranteeFee: number;
  residualProvider: string;
  vehiclePrice: number;
  /** 고객 실효금리(표시용, 캐피탈 간 동일 기준 비교용 — 계산에는 안 쓰임) */
  customerRate: number;
}

/** 브랜드 기준금리 + 가산 (엑셀 H36) */
export function resolveMeritzOperatingLeaseRate(
  brand: string,
  depositRate: number,
  prepaymentRate: number,
  is24MY = false,
): number {
  const base = DATA.brandRates[brand];
  if (base === undefined || base <= 0) {
    throw new Error("브랜드 금리 미등록");
  }
  let rate = base;
  const total = depositRate + prepaymentRate;
  if (total < 0.11) rate += DATA.rateSurcharges.lowDepositBelow11pct;
  if (total > 0.399999) rate += DATA.rateSurcharges.deposit40pctPlus;
  if (is24MY) rate += DATA.rateSurcharges.my24;
  return Math.round(rate * 1e6) / 1e6;
}

export function quoteMeritzOperatingLease(
  input: MeritzOperatingLeaseInput,
): MeritzOperatingLeaseQuote {
  const {
    model,
    termMonths,
    depositRate,
    prepaymentRate = 0.1,
    annualMileageKm = 20000,
    optionPrice = 0,
    discount = 0,
    is24MY = false,
  } = input;

  assertRatio("보증금율", depositRate);
  assertRatio("선납율", prepaymentRate);

  const vehicle = findMeritzVehicle(model);
  if (!vehicle) throw new Error("모델 미연동");

  const vehiclePrice = input.vehiclePrice ?? vehicle.vehiclePrice;
  const finalPrice = vehiclePrice + optionPrice - discount;

  const residual = resolveMeritzResidual(vehicle, termMonths, annualMileageKm);
  if (!residual) throw new Error("잔가 산정 불가");
  assertRatio("잔가율", residual.residualRate);
  if (depositRate + prepaymentRate + residual.residualRate > 1) {
    throw new Error("보증금·선납금·잔가 비율의 합이 100%를 초과할 수 없습니다");
  }

  const c = DATA.acquisition;
  const isEV = vehicle.fuel.includes("전기") || vehicle.engineCc === 0;
  const rawTax = (finalPrice / 1.1) * c.taxRate - (isEV ? c.evTaxRebate : 0);
  const acquisitionTax = roundDown(Math.max(rawTax, 0), -1);
  const acquisitionCost =
    finalPrice + acquisitionTax + c.bondCost + c.deliveryCost + c.incidentalCost;

  const deposit = roundDown(finalPrice * depositRate, -3);
  const prepayment = roundDown(finalPrice * prepaymentRate, -3);
  const residualValue = roundDown(finalPrice * residual.residualRate, -3);

  const f = DATA.operatingFees;
  const cmFee = roundDown(acquisitionCost * f.cmFeeRate, -1);
  const partnerFee = roundDown(acquisitionCost * f.partnerFeeRate, -1);
  const extraFee = roundDown(acquisitionCost * f.extraFeeRate, -1);

  const annualRate = resolveMeritzOperatingLeaseRate(
    vehicle.brand,
    depositRate,
    prepaymentRate,
    is24MY,
  );

  const pv =
    -acquisitionCost +
    deposit +
    prepayment -
    cmFee -
    partnerFee -
    extraFee -
    residual.guaranteeFee -
    f.fixedFee;
  const fv = residualValue - deposit;
  const monthlyPayment = roundUp(
    excelPmt(annualRate / 12, termMonths, pv, fv, 0),
    -2,
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
    residualRate: residual.residualRate,
    residualValue,
    deposit,
    prepayment,
    acquisitionCost,
    guaranteeFee: residual.guaranteeFee,
    residualProvider: residual.provider,
    vehiclePrice,
    customerRate,
  };
}
