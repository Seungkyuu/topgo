/**
 * 메리츠 국산차 운용리스 견적 엔진 — 엑셀 `리스수식` 시트 AA48 사슬 이식.
 *
 *   원금 W2        = 판매가 + 옵션 - 할인
 *   취득원가 W9    = 원금 + 탁송료
 *   취득세 W12     = TRUNC(W9/1.1 × 7%, -1)          [승용·하이브리드]
 *   이용금액 W15   = W9 + 취득세 + 기타비과세비용
 *   잔가 AA29      = ROUNDUP(원금 × 잔가율, -3)
 *   보증금 AA33    = ROUNDUP(W9 × 보증금율, -1)
 *   선납금 AA26    = 하이브리드: 선납율×(판매가+옵션) / 그 외: ROUNDUP(원금×선납율,-3)
 *   수수료 AA39    = ROUNDDOWN(W15×3%,-1) + W15×1%(지점출고) + 10,000
 *   금리 AZ32      = 6% (+ 0.3% if 선납+선수 비율 > 39%)
 *   월리스료 AA48  = ROUNDUP(PMT(금리/12, 기간,
 *                     -W15 - 수수료 + 선납 + 보증금, 잔가 - 선납 - 보증금), -1)
 *
 * 골든케이스: 더 뉴 그랜저 1.6T HEV / 판매가 51,430,000 / 할인 1,001,000 / 옵션 0
 *   60개월 / 2만km / 보증금·선납·선수 0 / 탁송 350,000 + 비과세 359,500
 *   → 원금 50,429,000 / 취득원가 54,369,890 / 잔가 27,232,000 / 월 703,050 (엑셀 AA48, 오차 0)
 *   ⚠ 이 골든케이스는 보증금 0으로만 검증돼서, 예전 코드가 보증금을
 *   pv에서 빼기만 하고(부호 반대) fv에는 아예 반영을 안 해 "보증금을
 *   늘릴수록 월 리스료가 오르는" 버그를 놓치고 있었다. 보증금은 만기에
 *   전액 환급되는 돈이라 오릭스·신한·메리츠(수입) 엔진처럼 pv엔 더하고
 *   (당장의 재원 부담을 낮추고) fv에선 빼야(만기에 돌려줄 몫만큼 회수분을
 *   줄여야) 한다 — 위 수식과 아래 구현에 반영해 수정.
 *
 * ─── 사업 규칙(사용자 확정) ────────────────────────────────────────────────────
 *   • 탁송료: 국산 350,000 / 해외 150,000 고정 (deliveryFee)
 *   • 출고형태: 지점/대리점 출고 고정 → 수수료 1% 항상 포함
 *   • 가격·할인: 갓챠(카랩) 시세 입력값
 *   • 보증금·선납금만 고객 노출, 선수금(선수리스료)은 0 고정
 *   ⚠ nonTaxableFee(엑셀 L2=359,500)는 골든케이스 재현 검증용. 제품 기본값 0.
 */

import { excelPmt, roundUp, roundDown, impliedCustomerRate, assertRatio } from "../finance";
import { findDomesticVehicle, resolveDomesticResidual } from "./vehicle";

/** TRUNC(v, -1): 0을 향해 10원 단위 버림 (엑셀 TRUNC). */
function trunc10(v: number): number {
  return Math.trunc(v / 10) * 10;
}

const ACQUISITION_TAX_RATE = 0.07; // 승용·하이브리드
const BASE_RATE = 0.06;
const HIGH_PREPAY_SURCHARGE = 0.003; // 선납+선수 비율 > 39%
const CM_FEE_RATE = 0.03;
const BRANCH_FEE_RATE = 0.01; // 지점/대리점 출고 고정
const FIXED_FEE = 10000;

export interface MeritzDomesticLeaseInput {
  model: string;
  /** 판매가 (다나와/갓챠 시세) */
  vehiclePrice: number;
  termMonths: number;
  annualMileageKm: number;
  optionPrice?: number;
  discount?: number;
  /** 보증금율 (고객 노출) */
  depositRate?: number;
  /** 선납율 (고객 노출) */
  prepaymentRate?: number;
  /** 탁송료. 기본 국산 350,000 */
  deliveryFee?: number;
  /** 잔가율 재정의 (미지정 시 모델·기간·주행거리 자동) */
  residualRate?: number;
  /** ⚠ 엑셀 L2(비과세 부대) 재현용. 제품 기본 0 */
  nonTaxableFee?: number;
}

export interface MeritzDomesticLeaseQuote {
  monthlyPayment: number;
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

export function quoteMeritzDomesticLease(
  input: MeritzDomesticLeaseInput,
): MeritzDomesticLeaseQuote {
  const {
    model,
    vehiclePrice,
    termMonths,
    annualMileageKm,
    optionPrice = 0,
    discount = 0,
    depositRate = 0,
    prepaymentRate = 0,
    deliveryFee = 350_000,
    nonTaxableFee = 0,
  } = input;

  assertRatio("보증금율", depositRate);
  assertRatio("선납율", prepaymentRate);

  const vehicle = findDomesticVehicle(model);
  if (!vehicle) throw new Error("모델 미연동");

  const residualRate =
    input.residualRate ??
    resolveDomesticResidual(vehicle, termMonths, annualMileageKm);
  if (residualRate === null || residualRate === undefined) {
    throw new Error("잔가율 미등록");
  }
  assertRatio("잔가율", residualRate);
  if (depositRate + prepaymentRate + residualRate > 1) {
    throw new Error("보증금·선납금·잔가 비율의 합이 100%를 초과할 수 없습니다");
  }

  const principal = vehiclePrice + optionPrice - discount; // W2
  const w9 = principal + deliveryFee;
  const acquisitionTax = trunc10((w9 / 1.1) * ACQUISITION_TAX_RATE); // W12
  const financedAmount = w9 + acquisitionTax + nonTaxableFee; // W15

  const residualValue = roundUp(principal * residualRate, -3); // AA29
  const deposit = roundUp(w9 * depositRate, -1); // AA33
  const isHybrid = vehicle.fuel.includes("하이브리드") || vehicle.kind.includes("하이브리드");
  const prepayment =
    isHybrid
      ? (vehiclePrice + optionPrice) * prepaymentRate
      : roundUp(principal * prepaymentRate, -3); // AA26

  const cmFee = roundDown(financedAmount * CM_FEE_RATE, -1);
  const branchFee = financedAmount * BRANCH_FEE_RATE;
  const totalFee = cmFee + branchFee + FIXED_FEE; // AA39

  const prepayRatio = prepaymentRate; // 선수 0 → 선납율만
  const annualRate =
    BASE_RATE + (prepayRatio > 0.39 ? HIGH_PREPAY_SURCHARGE : 0);

  // 보증금은 만기에 전액 환급되는 돈이라 오릭스·신한·메리츠(수입) 엔진과
  // 동일하게 pv에는 더하고(월 부담을 낮추고) fv에서는 빼야(만기에 돌려줘야
  // 할 몫만큼 잔가 회수분을 줄여야) 한다. 예전엔 pv에서 빼기만 하고 fv엔
  // 전혀 반영하지 않아 보증금이 늘수록 월 리스료가 오히려 오르는 버그였다.
  const pv = -financedAmount - totalFee + prepayment + deposit; // 선수 0
  const fv = residualValue - prepayment - deposit;
  const monthlyPayment = roundUp(excelPmt(annualRate / 12, termMonths, pv, fv, 0), -1);

  const customerRate = impliedCustomerRate(
    monthlyPayment,
    termMonths,
    residualValue,
    financedAmount,
  );

  return {
    monthlyPayment,
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
