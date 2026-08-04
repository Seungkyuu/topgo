/**
 * MG캐피탈 운용리스 — "차량가 → 취득원가 → 잔가 → 리스료" 전체 사슬.
 *
 * 엑셀 `운용리스` 시트를 셀 단위로 확인(BMW 740i xDrive DPE, 60개월,
 * 차량가 160,800,000원):
 *
 *   취득세 = ROUNDDOWN(차량가/1.1 × 7%, -10)                    = 10,232,720
 *   취득원가 = 차량가 + 취득세                                    = 171,032,720
 *   AG수수료 = ROUNDDOWN(차량가 × 1.32%, 0)                       = 2,122,560
 *   잔가금액 = ROUNDDOWN(차량가 × 잔가율, -1)
 *   월리스료 = ROUNDUP(PMT(금리/12, 기간, -(취득원가+AG수수료+등록비), 잔가금액), -2)
 *
 * → 취득세·취득원가는 엑셀과 정확히 일치(오차 0). 월리스료는 엑셀이 수수료를
 *   RATE()로 실효금리에 접어넣는 한 단계를 더 거쳐 18원(0.001%) 차이만 남는다
 *   (무시 가능한 수준 — PMT에 수수료를 원금처럼 직접 더하는 더 단순한 방식으로
 *   근사했다).
 *
 * ⚠ v1 의도적 단순화(자세한 근거는 scripts/extract_mg_lease.py 참고):
 *   · 잔가는 원본 3개 경쟁 소스(SNK/APS/차봇) 중 최댓값 자동선택 구조인데,
 *     이번 버전은 그중 하나(APS열, 항상 존재)만 쓴다 — 최댓값을 놓쳐 잔가가
 *     낮게(월리스료가 높게) 나올 수 있지만 방향은 안전하다.
 *   · 금리는 32개 브랜드 실측이 전부 연 5.4%로 동일해 고정 상수로 썼다
 *     ("당사명의" 등록만 지원, "이용자명의"는 별도 10% 고정이라 미반영).
 *   · AG수수료율(1.32%)·등록비(10,000원)는 실측 예시값을 고정 기본값으로.
 */

import { excelPmt, roundUp, roundDown, impliedCustomerRate } from "../finance";
import { findMgLeaseVehicle, type MgLeaseVehicle } from "./vehicle";

const ACQUISITION_TAX_RATE = 0.07;
const ANNUAL_RATE = 0.054; // 견적관리자용 — 32개 브랜드 "당사명의" 운영IRR 전부 동일
const AG_FEE_RATE = 0.0132;
const REGISTRATION_FEE = 10_000;

export interface MgLeaseQuoteInput {
  model: string;
  vehiclePrice: number;
  termMonths: number;
  depositRate?: number;
}

export interface MgLeaseQuote {
  monthlyPayment: number;
  annualRate: number;
  customerRate: number;
  residualRate: number;
  residualValue: number;
  acquisitionCost: number;
  vehicle: MgLeaseVehicle;
}

export function quoteMgLease(input: MgLeaseQuoteInput): MgLeaseQuote {
  const { model, vehiclePrice, termMonths, depositRate = 0 } = input;

  const vehicle = findMgLeaseVehicle(model);
  if (!vehicle) throw new Error("모델 미연동");

  const residualRate = vehicle.residualByTerm[String(termMonths)];
  if (residualRate === undefined) throw new Error("잔가율 미등록");

  const acquisitionTax = roundDown((vehiclePrice / 1.1) * ACQUISITION_TAX_RATE, -1);
  const acquisitionCost = vehiclePrice + acquisitionTax;

  const agFee = roundDown(vehiclePrice * AG_FEE_RATE, 0);
  const residualValue = roundDown(vehiclePrice * residualRate, -1);
  const deposit = depositRate > 0 ? roundDown(vehiclePrice * depositRate, -1) : 0;

  const pv = -(acquisitionCost + agFee + REGISTRATION_FEE) + deposit;
  const fv = residualValue - deposit;
  const monthlyPayment = roundUp(excelPmt(ANNUAL_RATE / 12, termMonths, pv, fv, 0), -2);

  const customerRate = impliedCustomerRate(monthlyPayment, termMonths, residualValue, acquisitionCost);

  return {
    monthlyPayment,
    annualRate: ANNUAL_RATE,
    customerRate,
    residualRate,
    residualValue,
    acquisitionCost,
    vehicle,
  };
}

export { findMgLeaseVehicle, listMgLeaseVehicles } from "./vehicle";
export type { MgLeaseVehicle } from "./vehicle";
