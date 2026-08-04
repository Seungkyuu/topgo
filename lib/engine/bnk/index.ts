/**
 * BNK캐피탈 운용리스 — "차량가 → 취득원가 → 잔가사 자동선택 → 리스료" 전체 사슬.
 *
 * 엑셀 `Es1` 시트를 셀 단위로 확인(BMW 520i, JY 잔가사 자동선택 예시 — 오차 0):
 *   등록세 = ROUNDDOWN(차량가/1.1 × 5%, -10) = 5,000,000
 *   취득세 = ROUNDDOWN(차량가/1.1 × 2%, -10) = 2,000,000  (표준 승용·비EV)
 *   취득원가 = 차량가 + 등록세 + 취득세             = 117,000,000
 *   잔가사 7곳(WS/SE(CB)/BR/TY/JY/CR/ADB) 중 이 차종을 취급하는 곳들의
 *     "기본잔가율(RVs 공유 매트릭스) + 주행거리감가 + 최대인상폭(공통 7%)"을
 *     각각 계산해 최댓값을 자동 선택 → JY 0.625로 최고
 *   잔가 = ROUNDUP(차량가 × 0.625, -3)              = 68,750,000
 *   잔가보장수수료 = 취득원가 × 수수료율(잔가사별 브래킷표, JY 7%초과 구간=1.45%)
 *   기본리스료 = ROUNDUP(PMT(금리/12, 개월, -취득원가-수수료, 잔가), -1) ≈ 1,260,000
 *
 * ⚠ v1 의도적 단순화(전부 "실제보다 낮게 보이면 안 된다" 방향):
 *   · 딜러사별 제휴 우대금리(Cond 시트) 미반영 — 딜러사를 묻지 않는 UI라
 *     항상 "비제휴" 최고금리(연 7.41%)를 쓴다. 실제 제휴 딜러라면 상담에서
 *     더 낮아질 수 있다.
 *   · 특판/프로모션 잔가 상향, 사전협의 잔가, 차종지원금 — 전부 0 처리.
 *   · EV·경차·승합·화물 특례 세율 — 아직 미검증이라 표준(승용·비EV) 세율만
 *     반영(친환경차 표시는 카탈로그에 있지만 세율 계산엔 반영 안 함).
 */

import { excelPmt, roundUp, roundDown, impliedCustomerRate } from "../finance";
import { findBnkVehicle, GUARANTORS, type BnkVehicle, type Guarantor } from "./vehicle";
import residualMatrixJson from "./data/residual-matrix.json";
import feeTableJson from "./data/fee-table.json";

const RESIDUAL_MATRIX = residualMatrixJson as Record<string, Record<string, number>>;
const FEE_TABLE = feeTableJson as {
  thresholds: number[];
  sharedRates: number[];
  topTierByGuarantor: Record<string, number>;
};

/** CDB 컬럼명("CB") ↔ Es1 표시명("SE(CB)") — 수수료표 조회 키 변환용 */
const GUARANTOR_DISPLAY: Record<Guarantor, string> = {
  WS: "WS",
  CB: "SE(CB)",
  BR: "BR",
  TY: "TY",
  JY: "JY",
  CR: "CR",
  ADB: "ADB",
};

const MAX_MARKUP = 0.07; // 잔가사 전 곳 공통(견적조건 Es1 실측)
const REGISTRATION_TAX_RATE = 0.05; // 등록세 5%(표준 승용)
const ACQUISITION_TAX_RATE = 0.02; // 취득세 2%(표준 승용·비EV)
/** 비제휴 딜러 기준 IRR(연) — Cond!D4 "기타1/비제휴" 행, 우리 UI가 아는 가장 안전한(높은) 금리 */
const NON_PARTNER_IRR = 0.0741;

const MILEAGE_LABELS: Record<number, string> = {
  10000: "1만km",
  15000: "1만5천km",
  20000: "2만km",
  30000: "3만km",
  40000: "4만km",
};
const MILEAGE_MARKDOWN: Record<string, number> = {
  "1만km": 0.02,
  "1만5천km": 0.01,
  "2만km": 0,
  "3만km": -0.04,
  "4만km": -0.09,
};

function nearestMileageLabel(annualMileageKm: number): string {
  const keys = Object.keys(MILEAGE_LABELS).map(Number).sort((a, b) => a - b);
  const nearest = keys.reduce((best, k) =>
    Math.abs(k - annualMileageKm) < Math.abs(best - annualMileageKm) ? k : best,
  );
  return MILEAGE_LABELS[nearest];
}

function baseResidualRate(termMonths: number, classCode: string): number | null {
  const row = RESIDUAL_MATRIX[String(termMonths)];
  if (!row) return null;
  return row[classCode] ?? null;
}

function feeRate(guarantor: Guarantor, markupOverBase: number): number {
  const display = GUARANTOR_DISPLAY[guarantor];
  // 브래킷: 인상폭이 6%초과(사실상 최대인상폭 7%에 근접)면 잔가사별 우대 티어,
  // 그 외엔 공유 티어표(thresholds 내림차순 첫 매치)
  if (markupOverBase > 0.06) {
    return FEE_TABLE.topTierByGuarantor[display] ?? 0;
  }
  for (let i = 0; i < FEE_TABLE.thresholds.length; i++) {
    if (markupOverBase > FEE_TABLE.thresholds[i]) return FEE_TABLE.sharedRates[i];
  }
  return 0;
}

interface GuarantorOffer {
  guarantor: Guarantor;
  residualRate: number;
  feeRate: number;
}

/** 이 차종을 취급하는 잔가사들의 잔가율을 전부 계산해 최댓값을 고른다(엑셀 MAX 로직) */
function bestGuarantorOffer(
  vehicle: BnkVehicle,
  termMonths: number,
  annualMileageKm: number,
): GuarantorOffer | null {
  const mileageLabel = nearestMileageLabel(annualMileageKm);
  const mileageMarkdown = MILEAGE_MARKDOWN[mileageLabel] ?? 0;

  const offers: GuarantorOffer[] = [];
  for (const g of GUARANTORS) {
    const classCode = vehicle.guarantorCodes[g];
    if (!classCode) continue; // 이 잔가사는 이 차종 미취급
    const base = baseResidualRate(termMonths, classCode);
    if (base === null) continue;
    const markup = mileageMarkdown + MAX_MARKUP;
    const residualRate = base + markup;
    offers.push({ guarantor: g, residualRate, feeRate: feeRate(g, MAX_MARKUP) });
  }
  if (offers.length === 0) return null;
  return offers.reduce((best, o) => (o.residualRate > best.residualRate ? o : best));
}

export interface BnkOperatingLeaseQuoteInput {
  model: string;
  vehiclePrice: number;
  termMonths: number;
  annualMileageKm: number;
  depositRate?: number;
  /** 딜러 제휴 우대금리 등으로 실제 IRR을 알 때만 지정. 미지정 시 "비제휴" 최고금리(7.41%) */
  annualRate?: number;
}

export interface BnkOperatingLeaseQuote {
  monthlyPayment: number;
  annualRate: number;
  customerRate: number;
  residualRate: number;
  residualValue: number;
  deposit: number;
  prepayment: number;
  guarantor: Guarantor;
  acquisitionCost: number;
}

export function quoteBnkOperatingLease(
  input: BnkOperatingLeaseQuoteInput,
): BnkOperatingLeaseQuote {
  const {
    model,
    vehiclePrice,
    termMonths,
    annualMileageKm,
    depositRate = 0,
    annualRate = NON_PARTNER_IRR,
  } = input;

  const vehicle = findBnkVehicle(model);
  if (!vehicle) throw new Error("모델 미연동");

  const offer = bestGuarantorOffer(vehicle, termMonths, annualMileageKm);
  if (!offer) throw new Error("잔가율 미등록");

  const registrationTax = roundDown((vehiclePrice / 1.1) * REGISTRATION_TAX_RATE, -1);
  const acquisitionTax = roundDown((vehiclePrice / 1.1) * ACQUISITION_TAX_RATE, -1);
  const acquisitionCost = vehiclePrice + registrationTax + acquisitionTax;

  const residualValue = roundUp(vehiclePrice * offer.residualRate, -3);
  // 잔가보장수수료 기준액은 취득원가가 아니라 차량가(세금계산서 상) — Es1!B47=B46*B62(=차량가)
  const guaranteeFee = roundUp(vehiclePrice * offer.feeRate, -1);
  const deposit = depositRate > 0 ? roundUp(vehiclePrice * depositRate, -4) : 0;

  const pv = -acquisitionCost - guaranteeFee + deposit;
  const fv = residualValue - deposit;
  const monthlyPayment = roundUp(excelPmt(annualRate / 12, termMonths, pv, fv, 0), -1);

  const customerRate = impliedCustomerRate(
    monthlyPayment,
    termMonths,
    residualValue,
    acquisitionCost,
  );

  return {
    monthlyPayment,
    annualRate,
    customerRate,
    residualRate: offer.residualRate,
    residualValue,
    deposit,
    prepayment: 0,
    guarantor: offer.guarantor,
    acquisitionCost,
  };
}

export { findBnkVehicle, listBnkVehicles } from "./vehicle";
export type { BnkVehicle } from "./vehicle";
