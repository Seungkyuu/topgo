/**
 * 신한카드 장기렌트 견적 엔진 — 엑셀 `렌터카_일반` 시트의 "섹터 상환" 방식 이식.
 *
 * 이 시트는 단순 PMT가 아니라, 최종 PMT 결과를 RATE()로 역산해 "표시금리"를
 * 만든 뒤 그 금리로 원가를 항목별(섹터)로 나눠 재계산 → 합산하는 2단계 구조다.
 *
 *   공급가(BA25/AZ26) = ROUND(차량가최종/1.1, 0)
 *   취득세(AZ29)       = ROUNDDOWN(공급가 × 4%, -1)
 *   등록비용(BA28)     = 취득세 + 공채 + 증지세·번호판대
 *   부대비용(BA32)     = 등록수수료 등 합계 (기본 38,000)
 *   취득원가(BA48)     = 공급가 + 등록비용 + 부대비용
 *   잔가(BH6)          = ROUNDUP(공급가 × 잔가율, -4)
 *   잔가보장수수료(BD22)= 차량가최종 × 1.5%
 *
 *   1단계 PMT(BG18) = PMT((고객금리+0.01%)/12, 기간, -(취득원가+잔가보장수수료), 잔가)
 *   표시금리(BH18)   = ROUNDUP(RATE(기간, BG18, -취득원가, 잔가) × 12, 4)
 *
 *   섹터1 차량가(BI5) = ROUNDDOWN(PMT(표시금리/12, 기간, -(공급가-잔가), 0), -1)
 *   섹터2 잔가(BI6)   = ROUNDDOWN(잔가 × 표시금리/12, -1)
 *   섹터3 등록비(BI7) = ROUNDDOWN(PMT(표시금리/12, 기간, -(등록비용+부대비용), 0), -1)
 *   섹터4 차세(BI8)   = ROUNDDOWN(연간자동차세/12, -1)
 *   섹터5 보험+분담금(BI10) = ROUNDDOWN((연간보험료+분담금)/12, -1)
 *   섹터6 정비(BI11)  = ROUNDDOWN(월정비료, -1)
 *
 *   공급가액(월, BI4) = ROUNDUP(Σ섹터, -2)
 *   부가세            = 공급가액 × 10%
 *   ★ 월 렌트료(F22)  = 공급가액 + 부가세
 *
 * 골든케이스: BMW 120i sport / 50,000,000 / 60개월 / 잔가율 50% / 고객금리 7.1%
 *   배기량 1998cc·자동차세 37,960/년, 보험료 1,349,600/년, 분담금 15,000, 정비 4,770/월
 *   → 표시금리 7.6%, 월 렌트료 836,000원 (엑셀 F22, 오차 0)
 *
 * ⚠ 고객금리는 매달 변동하는 협상값이라 입력값으로 받는다(기본금리 산정값 제공).
 *   보험료·정비료·분담금도 딜러/보험사 조건에 따라 변동이 커 입력값으로 받는다
 *   (기본값 0). 잔가율은 모델을 지정하면 `차량모델기준` 마스터(515개)에서
 *   자동 조회한다 — `quoteShinhanRentalByModel` 참고.
 */

import { excelPmt, excelRate, roundUp, roundDown, impliedCustomerRate } from "../finance";
import {
  findShinhanRentalVehicle,
  resolveShinhanRentalResidual,
} from "./rental-vehicle";

export interface ShinhanRentalInput {
  vehiclePrice: number;
  termMonths: number;
  /** 잔가율 (예: 0.5). 모델별 자동조회 미이식 — 필수 입력 */
  residualRate: number;
  /** 고객 적용금리 (예: 0.071). 미지정 시 기본금리 산정(60개월 가산 포함) 사용 */
  annualRate?: number;
  optionPrice?: number;
  discount?: number;
  /** 연간 자동차세 (원). 기본 0 */
  annualVehicleTax?: number;
  /** 연간 보험료 (원). 기본 0 */
  annualInsurance?: number;
  /** 월 분담금 관련 연 정액(원, 엑셀 AQ35). 기본 0 */
  allocationFee?: number;
  /** 월 정비료 (원). 기본 0 */
  monthlyMaintenance?: number;
  /** 지역 공채비용 (원). 기본 0 */
  bondCost?: number;
  /** 증지세·번호판대 (원). 기본 31,800 */
  plateFee?: number;
  /** 등록 부대비용(등록수수료 등, 원). 기본 38,000 */
  registrationIncidental?: number;
}

export interface ShinhanRentalQuote {
  monthlyPayment: number;
  displayRate: number;
  annualRate: number;
  residualValue: number;
  acquisitionCost: number;
  supplyPrice: number;
  guaranteeFee: number;
  monthlySupply: number;
  monthlyVat: number;
  /** 고객 실효금리(표시용, 캐피탈 간 동일 기준 비교용 — 계산에는 안 쓰임) */
  customerRate: number;
}

const DEFAULT_BASE_RATE = 0.072;
const DEFAULT_TERM60_SURCHARGE = 0.003;
const DEFAULT_FEE_DISCOUNT = 0.004;
const RATE_SURCHARGE = 0.0001;
const GUARANTEE_FEE_RATE = 0.015;
const ACQUISITION_TAX_RATE = 0.04;

function defaultAnnualRate(termMonths: number): number {
  const surcharge = termMonths === 60 ? DEFAULT_TERM60_SURCHARGE : 0;
  return (
    Math.round((DEFAULT_BASE_RATE + surcharge - DEFAULT_FEE_DISCOUNT) * 1e6) /
    1e6
  );
}

export function quoteShinhanRental(
  input: ShinhanRentalInput,
): ShinhanRentalQuote {
  const {
    vehiclePrice,
    termMonths,
    residualRate,
    optionPrice = 0,
    discount = 0,
    annualVehicleTax = 0,
    annualInsurance = 0,
    allocationFee = 0,
    monthlyMaintenance = 0,
    bondCost = 0,
    plateFee = 31_800,
    registrationIncidental = 38_000,
  } = input;

  const annualRate = input.annualRate ?? defaultAnnualRate(termMonths);

  const finalPrice = vehiclePrice + optionPrice - discount;
  const supplyPrice = Math.round(finalPrice / 1.1);
  const acquisitionTax = roundDown(supplyPrice * ACQUISITION_TAX_RATE, -1);
  const registrationCost = acquisitionTax + bondCost + plateFee;
  const acquisitionCost = supplyPrice + registrationCost + registrationIncidental;

  const residualValue = roundUp(supplyPrice * residualRate, -4);
  const guaranteeFee = Math.round(finalPrice * GUARANTEE_FEE_RATE);

  // 1단계: 고객금리로 순수 PMT → 표시금리 역산
  const pv1 = -(acquisitionCost + guaranteeFee);
  const rawPmt = excelPmt(
    (annualRate + RATE_SURCHARGE) / 12,
    termMonths,
    pv1,
    residualValue,
  );
  const periodicDisplayRate = excelRate(
    termMonths,
    rawPmt,
    -acquisitionCost,
    residualValue,
  );
  const displayRate = roundUp(periodicDisplayRate * 12, 4);

  // 2단계: 표시금리로 섹터별 재계산
  const sector1Vehicle = roundDown(
    excelPmt(displayRate / 12, termMonths, -(supplyPrice - residualValue)),
    -1,
  );
  const sector2Residual = roundDown((residualValue * displayRate) / 12, -1);
  const sector3Registration = roundDown(
    excelPmt(
      displayRate / 12,
      termMonths,
      -(registrationCost + registrationIncidental),
    ),
    -1,
  );
  const sector4Tax = roundDown(annualVehicleTax / 12, -1);
  const sector5InsuranceAllocation = roundDown(
    (annualInsurance + allocationFee) / 12,
    -1,
  );
  const sector6Maintenance = roundDown(monthlyMaintenance, -1);

  const monthlySupply = roundUp(
    sector1Vehicle +
      sector2Residual +
      sector3Registration +
      sector4Tax +
      sector5InsuranceAllocation +
      sector6Maintenance,
    -2,
  );
  const monthlyVat = monthlySupply * 0.1;
  const monthlyPayment = monthlySupply + monthlyVat;

  const customerRate = impliedCustomerRate(
    monthlyPayment,
    termMonths,
    residualValue,
    acquisitionCost,
  );

  return {
    monthlyPayment,
    displayRate,
    annualRate,
    residualValue,
    acquisitionCost,
    supplyPrice,
    guaranteeFee,
    monthlySupply,
    monthlyVat,
    customerRate,
  };
}

export interface ShinhanRentalByModelInput
  extends Omit<ShinhanRentalInput, "vehiclePrice" | "residualRate"> {
  model: string;
  /** 차량가 재정의 (기본: 마스터 가격) */
  vehiclePrice?: number;
  /** 잔가율 재정의 (기본: 모델·기간별 마스터 자동조회) */
  residualRate?: number;
}

export interface ShinhanRentalByModelQuote extends ShinhanRentalQuote {
  vehiclePrice: number;
  residualRate: number;
}

/** 모델명으로 차량가·잔가율을 자동조회해 견적을 낸다 (515개 모델 마스터). */
export function quoteShinhanRentalByModel(
  input: ShinhanRentalByModelInput,
): ShinhanRentalByModelQuote {
  const vehicle = findShinhanRentalVehicle(input.model);
  if (!vehicle) throw new Error("모델 미연동");

  const residualRate =
    input.residualRate ?? resolveShinhanRentalResidual(vehicle, input.termMonths);
  if (residualRate === null || residualRate === undefined) {
    throw new Error("해당 기간 잔가율 미등록");
  }

  const vehiclePrice = input.vehiclePrice ?? vehicle.vehiclePrice;
  const q = quoteShinhanRental({ ...input, vehiclePrice, residualRate });

  return { ...q, vehiclePrice, residualRate };
}
