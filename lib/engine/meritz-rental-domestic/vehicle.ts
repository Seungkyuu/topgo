/**
 * 메리츠 국산차 장기렌트 차량 마스터 조회.
 *
 * 엑셀 `차량정보`/`정비` 시트에서 추출(scripts/extract_meritz_rental_domestic.py)
 * → data/vehicles.json(잔가율·전략등급) + data/maintenance.json(정비비 Basic등급).
 *
 * ⚠ 리스(meritz-domestic)와 잔가율표가 다르다 — 같은 모델이라도 리스·렌트
 *   상품별로 별도 잔가율을 쓰므로 절대 리스 데이터를 재사용하지 않는다.
 */

import vehiclesJson from "./data/vehicles.json";
import maintenanceJson from "./data/maintenance.json";

export interface RentalVehicle {
  /** 실제 제조사(엑셀 브랜드 구분행/블록에서 추출) — 현대/기아/KGM/르노/쉐보레 등 */
  brand: string;
  fuel: string;
  engineCc: number;
  kind: string;
  /** 보험등급(승용/승합/경차 등) — 개별소비세 면제 대상 판별용 */
  insuranceGrade: string;
  /** 금리 등급(기본/전략/전략AA/전략T 등) — STRATEGY_RATES 조회 키 */
  strategyGrade: string;
  /** 개소세계수(1+개소세율×130%), 차종별 고정값 — 현재 정책("26.7~" 5.0%) 기준 */
  consumptionTaxFactor: number;
  residualByTermMileage: Record<string, number>;
}

const VEHICLES = vehiclesJson as Record<string, RentalVehicle>;
const MAINTENANCE = maintenanceJson as Record<string, Record<string, number>>;

function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s\-_()./]/g, "");
}

const INDEX: [string, string][] = Object.keys(VEHICLES).map((k) => [normalize(k), k]);

function resolveKey(name: string, table: Record<string, unknown>): string | null {
  if (table[name]) return name;
  const n = normalize(name);
  if (!n) return null;
  const eq = INDEX.filter(([k]) => k === n);
  if (eq.length === 1) return eq[0][1];
  const prefix = INDEX.filter(([k]) => k.startsWith(n));
  if (prefix.length === 1) return prefix[0][1];
  return null;
}

export function findRentalVehicle(name: string): RentalVehicle | null {
  const key = resolveKey(name, VEHICLES);
  return key ? VEHICLES[key] : null;
}

export function listRentalVehicles(): [string, RentalVehicle][] {
  return Object.entries(VEHICLES);
}

const MILEAGE_BUCKETS = [10000, 15000, 20000, 25000, 30000, 40000];

export function resolveRentalResidual(
  vehicle: RentalVehicle,
  termMonths: number,
  annualMileageKm: number,
): number | null {
  const bucket =
    MILEAGE_BUCKETS.find((b) => annualMileageKm <= b) ??
    MILEAGE_BUCKETS[MILEAGE_BUCKETS.length - 1];
  return vehicle.residualByTermMileage[`${termMonths}_${bucket}`] ?? null;
}

/** 정비상품 — 사용자 확정: 기본적으로 전부 "Basic" 등급으로 처리 */
export function resolveBasicMaintenance(modelName: string, termMonths: number): number | null {
  const key = resolveKey(modelName, MAINTENANCE);
  if (!key) return null;
  const row = MAINTENANCE[key];
  return row[String(termMonths)] ?? null;
}
