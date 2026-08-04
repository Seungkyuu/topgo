/**
 * 메리츠 수입(EV) 장기렌트 차량 마스터 조회 — 테슬라·폴스타·BYD.
 *
 * 엑셀 `차량정보` 시트에서 추출(scripts/extract_meritz_rental_import.py)
 * → data/vehicles.json(잔가율·전략등급·EV 취득세감면 제외 플래그).
 *
 * ⚠ 국산 렌트(meritz-rental-domestic)와 잔가율표·금리표가 완전히 다르다 —
 *   같은 "메리츠 렌트"라도 절대 국산 데이터를 재사용하지 않는다.
 * ⚠ 이 카탈로그엔 정비비 데이터가 없다(전 모델·전 등급 0원으로 확인, index.ts
 *   에서 monthlyMaintenance를 항상 0으로 취급).
 */

import vehiclesJson from "./data/vehicles.json";

export interface ImportRentalVehicle {
  fuel: string;
  kind: string;
  /** 보험등급(승용 등) — 개별소비세 면제 대상 판별용 */
  insuranceGrade: string;
  /** 금리 등급(전략AA/전략P 등) — STRATEGY_RATES 조회 키 */
  strategyGrade: string;
  /** 개소세계수, 차종별 고정값 */
  consumptionTaxFactor: number;
  /** true면 EV 취득세 감면(140만원) 미적용 — 엑셀 잔가군 열이 "X"인 특수 트림 */
  evAcquisitionTaxRebateExcluded: boolean;
  residualByTermMileage: Record<string, number>;
}

const VEHICLES = vehiclesJson as Record<string, ImportRentalVehicle>;

function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s\-_()<>./]/g, "");
}

const INDEX: [string, string][] = Object.keys(VEHICLES).map((k) => [normalize(k), k]);

function resolveKey(name: string): string | null {
  if (VEHICLES[name]) return name;
  const n = normalize(name);
  if (!n) return null;
  const eq = INDEX.filter(([k]) => k === n);
  if (eq.length === 1) return eq[0][1];
  const prefix = INDEX.filter(([k]) => k.startsWith(n));
  if (prefix.length === 1) return prefix[0][1];
  return null;
}

export function findImportRentalVehicle(name: string): ImportRentalVehicle | null {
  const key = resolveKey(name);
  return key ? VEHICLES[key] : null;
}

export function listImportRentalVehicles(): [string, ImportRentalVehicle][] {
  return Object.entries(VEHICLES);
}

const MILEAGE_BUCKETS = [10000, 15000, 20000, 25000, 30000, 40000];

export function resolveImportRentalResidual(
  vehicle: ImportRentalVehicle,
  termMonths: number,
  annualMileageKm: number,
): number | null {
  const bucket =
    MILEAGE_BUCKETS.find((b) => annualMileageKm <= b) ??
    MILEAGE_BUCKETS[MILEAGE_BUCKETS.length - 1];
  return vehicle.residualByTermMileage[`${termMonths}_${bucket}`] ?? null;
}
