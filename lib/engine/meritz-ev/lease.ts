/**
 * 메리츠 전기차(테슬라·BYD) 운용리스 공용 엔진 — 엑셀 `리스수식` AA48 계열.
 *
 * 국산 리스와 같은 PMT 사슬이나 전기차 특성으로 세 가지가 다르다:
 *   • 취득세 = TRUNC(취득원가/1.1 × 7% − 140만 감면, -1)   [EV 취득세 감면]
 *   • 수수료 = 10,000 고정만 (CM·지점 수수료 없음)
 *   • 자동차세 항상 월 포함 = ROUNDUP(연 자동차세/12, -1)   [EV 130,000/년 → 10,840]
 *
 *   월리스료 = 차량분 + 차세분
 *   차량분  = ROUNDUP(PMT(금리/12, 기간,
 *              −이용금액 − 수수료 + 선납 + 보증금, 잔가 − 선납 − 보증금), -1)
 *
 * 골든케이스(전부 보증금 0으로 검증됨 — 보증금 항은 아래 별도 수정 참고):
 *   테슬라 Model Y L AWD <지원금> / 69,990,000 / 할인 2,100,000 / 36개월 / 잔가 0.57
 *     탁송 0 / 비과세 295,500 → 이용금액 71,105,770 / 월 1,190,550 (차량 1,179,710 + 차세 10,840)
 *   BYD Dolphin / 24,500,000 / 36개월 / 잔가 0.55 / 탁송·비과세 0
 *     → 이용금액 24,659,090 / 월 418,770 (차량 407,930 + 차세 10,840)
 *
 * ⚠ 보증금 부호 수정: 예전엔 보증금을 pv에서 빼기만 하고 fv엔 반영을
 *   안 해 보증금을 늘릴수록 월 리스료가 오르는 버그였다(메리츠 국산차
 *   엔진과 동일한 실수). 보증금은 만기 전액 환급이라 오릭스·신한·
 *   메리츠(수입) 엔진처럼 pv엔 더하고 fv에선 빼도록 수정.
 *
 * 사업 규칙: 탁송 해외 150,000 기본 / 출고 지점(단, EV 수수료엔 지점료 없음) /
 *   가격·할인 갓챠 입력 / 보증금·선납금만 노출.
 */

import { excelPmt, roundUp, impliedCustomerRate, assertRatio } from "../finance";

export interface LeaseformVehicle {
  brand: string;
  kind: string;
  fuel: string;
  engineCc: number;
  annualTax: number;
  residualByTermMileage: Record<string, number>;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s\-_()./]/g, "");
}

/** JSON 카탈로그 → 모델 조회 함수 (테슬라·BYD 공용) */
export function makeVehicleFinder(
  json: Record<string, unknown>,
): (name: string) => LeaseformVehicle | null {
  const vehicles: Record<string, LeaseformVehicle> = Object.fromEntries(
    Object.entries(json).filter(
      (e): e is [string, LeaseformVehicle] => typeof e[1] === "object" && e[1] !== null,
    ),
  );
  const index: [string, LeaseformVehicle][] = Object.entries(vehicles).map(
    ([k, v]) => [normalize(k), v],
  );
  return (name: string) => {
    const exact = vehicles[name];
    if (exact) return exact;
    const n = normalize(name);
    if (!n) return null;
    const eq = index.filter(([k]) => k === n);
    if (eq.length === 1) return eq[0][1];
    const prefix = index.filter(([k]) => k.startsWith(n));
    if (prefix.length === 1) return prefix[0][1];
    return null;
  };
}

const MILEAGE_BUCKETS = [10000, 15000, 20000, 25000, 30000, 40000];

function resolveResidual(
  v: LeaseformVehicle,
  termMonths: number,
  annualMileageKm: number,
): number | null {
  const bucket =
    MILEAGE_BUCKETS.find((b) => annualMileageKm <= b) ??
    MILEAGE_BUCKETS[MILEAGE_BUCKETS.length - 1];
  return v.residualByTermMileage[`${termMonths}_${bucket}`] ?? null;
}

const EV_TAX_RATE = 0.07;
const EV_TAX_REBATE = 1_400_000;
const BASE_RATE = 0.06;
const FIXED_FEE = 10000;

function trunc10(v: number): number {
  return Math.trunc(v / 10) * 10;
}

export interface MeritzEvLeaseInput {
  model: string;
  vehiclePrice: number;
  termMonths: number;
  annualMileageKm: number;
  optionPrice?: number;
  discount?: number;
  depositRate?: number;
  prepaymentRate?: number;
  /** 탁송료. 기본 해외 150,000 */
  deliveryFee?: number;
  residualRate?: number;
  /** ⚠ 엑셀 L2(비과세 부대) 재현용. 제품 기본 0 */
  nonTaxableFee?: number;
}

export interface MeritzEvLeaseQuote {
  monthlyPayment: number;
  vehiclePortion: number;
  vehicleTaxPortion: number;
  annualRate: number;
  residualRate: number;
  residualValue: number;
  principal: number;
  acquisitionCost: number;
  deposit: number;
  prepayment: number;
  vehiclePrice: number;
  customerRate: number;
}

export function quoteMeritzEvLease(
  finder: (name: string) => LeaseformVehicle | null,
  input: MeritzEvLeaseInput,
): MeritzEvLeaseQuote {
  const {
    model,
    vehiclePrice,
    termMonths,
    annualMileageKm,
    optionPrice = 0,
    discount = 0,
    depositRate = 0,
    prepaymentRate = 0,
    deliveryFee = 150_000,
    nonTaxableFee = 0,
  } = input;

  assertRatio("보증금율", depositRate);
  assertRatio("선납율", prepaymentRate);

  const vehicle = finder(model);
  if (!vehicle) throw new Error("모델 미연동");

  const residualRate =
    input.residualRate ?? resolveResidual(vehicle, termMonths, annualMileageKm);
  if (residualRate === null || residualRate === undefined) {
    throw new Error("잔가율 미등록");
  }
  assertRatio("잔가율", residualRate);
  if (depositRate + prepaymentRate + residualRate > 1) {
    throw new Error("보증금·선납금·잔가 비율의 합이 100%를 초과할 수 없습니다");
  }

  const principal = vehiclePrice + optionPrice - discount; // W2
  const w9 = principal + deliveryFee;
  const acquisitionTax = trunc10((w9 / 1.1) * EV_TAX_RATE - EV_TAX_REBATE); // EV 감면
  const financedAmount = w9 + acquisitionTax + nonTaxableFee; // W15

  const residualValue = roundUp(principal * residualRate, -3);
  const deposit = roundUp(w9 * depositRate, -1);
  const prepayment = roundUp((vehiclePrice + optionPrice) * prepaymentRate, -3);

  const totalFee = FIXED_FEE; // EV: 고정 10,000만
  const annualRate = BASE_RATE + (prepaymentRate >= 0.5 ? 0.005 : 0);

  const pv = -financedAmount - totalFee + prepayment + deposit;
  const fv = residualValue - prepayment - deposit;
  const vehiclePortion = roundUp(excelPmt(annualRate / 12, termMonths, pv, fv, 0), -1);

  const vehicleTaxPortion = roundUp(vehicle.annualTax / 12, -1);
  const monthlyPayment = vehiclePortion + vehicleTaxPortion;

  const customerRate = impliedCustomerRate(
    monthlyPayment,
    termMonths,
    residualValue,
    financedAmount,
  );

  return {
    monthlyPayment,
    vehiclePortion,
    vehicleTaxPortion,
    annualRate,
    residualRate,
    residualValue,
    principal,
    acquisitionCost: financedAmount,
    deposit,
    prepayment,
    vehiclePrice,
    customerRate,
  };
}
