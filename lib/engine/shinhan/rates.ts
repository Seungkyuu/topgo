/**
 * 신한카드 오토리스 금리·취득원가 상수.
 *
 * 기준금리 = 엑셀 주요기준!C7 (매달 변동, 2607: 5.9%).
 * PMT 계산 시 +0.01% 가산(엑셀 AR17의 AR20+0.01%).
 * 취득원가 상수: 취득세 7%, 전기차 감면 140만, 공채·탁송·인지대 기본값.
 */

import ratesJson from "./data/rates.json";

const DATA = ratesJson as unknown as {
  operatingLease: { baseRate: number; rateSurcharge: number };
  acquisition: {
    taxRate: number;
    evTaxRebate: number;
    bondCost: number;
    deliveryCost: number;
    stampDuty: number;
  };
  defaultCaFeeRate: number;
};

export function resolveShinhanOperatingLeaseRate(): number {
  return DATA.operatingLease.baseRate;
}

export function resolveShinhanRateSurcharge(): number {
  return DATA.operatingLease.rateSurcharge;
}

export function shinhanAcquisitionConstants() {
  return DATA.acquisition;
}

export function shinhanDefaultCaFeeRate(): number {
  return DATA.defaultCaFeeRate;
}
