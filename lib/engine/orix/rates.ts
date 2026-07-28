/**
 * 오릭스 적용금리 자동 산정.
 *
 * 엑셀 `운용리스` 시트의 금리 조립을 이식:
 *   금리 X40 = AA8 = 기준운영금리(기간별) + 보증금구간 추가금리 + 선수가산(선수>0 → 0.2%) + 중점차종조정
 *   보증금 구간 AF50 = 보증금율이 속하는 첫 임계 구간 → 추가금리 조회
 *
 * 금리표는 `data/rates.json`으로 추출(매달 변동값). 상품별 기준금리가 각 시트에 저장됨.
 * 중점차종 조정(AN53)은 현재 0으로 두고 추후 확장한다.
 */

import rates from "./data/rates.json";

interface DepositBracket {
  belowRate: number;
  surcharge: number;
}
interface ProductRate {
  baseRateByTerm: Record<string, number>;
  depositBrackets?: DepositBracket[];
  prepaymentSurcharge?: number;
}

const OPERATING = rates.operatingLease as ProductRate;
const FINANCE = rates.financeLease as ProductRate;

function baseRate(product: ProductRate, termMonths: number): number {
  const r = product.baseRateByTerm[String(termMonths)];
  if (r === undefined) throw new Error(`기준금리 없음: ${termMonths}개월`);
  return r;
}

/** 부동소수 잡음 제거 후 반환 */
function clean(rate: number): number {
  return Math.round(rate * 1e6) / 1e6;
}

/**
 * 보증금 구간별 추가금리.
 * 엑셀: 보증금율이 처음으로 임계값 미만이 되는 구간을 선택(마지막 구간은 이하 포함).
 */
function depositSurcharge(
  brackets: DepositBracket[],
  depositRate: number,
): number {
  for (const b of brackets) {
    if (depositRate < b.belowRate) return b.surcharge;
  }
  // 마지막 구간 이상은 마지막 추가금리 적용
  return brackets[brackets.length - 1].surcharge;
}

/** 운용리스 적용금리 */
export function resolveOrixOperatingLeaseRate(
  termMonths: number,
  depositRate: number,
  hasAdvancePayment = false,
): number {
  const base = baseRate(OPERATING, termMonths);
  const surcharge = depositSurcharge(OPERATING.depositBrackets!, depositRate);
  const advance = hasAdvancePayment ? OPERATING.prepaymentSurcharge! : 0;
  return clean(base + surcharge + advance);
}

/** 금융리스 적용금리 */
export function resolveOrixFinanceLeaseRate(termMonths: number): number {
  return clean(baseRate(FINANCE, termMonths));
}
