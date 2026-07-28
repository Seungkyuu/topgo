/**
 * 메리츠 국산차 운용리스 차량 마스터 조회.
 *
 * 엑셀 `차량정보` 시트(현대 등 국산)에서 추출 → data/vehicles.json.
 * 국산 엑셀은 카탈로그에 차량가가 없다(다나와 시세를 수기입력). 대신 잔가율표
 * (모델 × 기간 × 주행거리), 배기량, 자동차세, 연료, 종류가 들어있다.
 */

import vehiclesJson from "./data/vehicles.json";

export interface DomesticVehicle {
  brand: string;
  kind: string;
  fuel: string;
  engineCc: number;
  annualTax: number;
  /** "기간_주행거리" (예: "60_20000") → 잔가율 */
  residualByTermMileage: Record<string, number>;
}

type Raw = Record<string, DomesticVehicle | string>;
const VEHICLES: Record<string, DomesticVehicle> = Object.fromEntries(
  Object.entries(vehiclesJson as Raw).filter(
    (e): e is [string, DomesticVehicle] => typeof e[1] === "object",
  ),
);

function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s\-_()./]/g, "");
}

const INDEX: [string, DomesticVehicle][] = Object.entries(VEHICLES).map(
  ([k, v]) => [normalize(k), v],
);

export function findDomesticVehicle(name: string): DomesticVehicle | null {
  const exact = VEHICLES[name];
  if (exact) return exact;
  const n = normalize(name);
  if (!n) return null;
  const eq = INDEX.filter(([k]) => k === n);
  if (eq.length === 1) return eq[0][1];
  const prefix = INDEX.filter(([k]) => k.startsWith(n));
  if (prefix.length === 1) return prefix[0][1];
  return null;
}

/** 국산차 전체 목록 (모델명 → 차량 정보) */
export function listDomesticVehicles(): [string, DomesticVehicle][] {
  return Object.entries(VEHICLES);
}

/**
 * 잔가율 조회. 엑셀 표는 주행거리 10,000/15,000/20,000/25,000/30,000/40,000 열이 있고,
 * 기간 24/36/48/60 행이 있다. 입력 주행거리를 표의 구간으로 반올림해 맞춘다.
 */
const MILEAGE_BUCKETS = [10000, 15000, 20000, 25000, 30000, 40000];

export function resolveDomesticResidual(
  vehicle: DomesticVehicle,
  termMonths: number,
  annualMileageKm: number,
): number | null {
  // 표에 있는 주행거리 구간 중 입력값 이상인 가장 가까운 값
  const bucket =
    MILEAGE_BUCKETS.find((b) => annualMileageKm <= b) ??
    MILEAGE_BUCKETS[MILEAGE_BUCKETS.length - 1];
  const key = `${termMonths}_${bucket}`;
  return vehicle.residualByTermMileage[key] ?? null;
}
