/**
 * 메리츠 Polestar 전용 운용리스 트림 마스터 조회.
 *
 * 엑셀 `차종` 시트(scripts/extract_meritz_polestar_lease.py)에서 추출.
 * 일반 수입차 리스(lib/engine/meritz)와 별개 상품 — Polestar 4 생산배치별
 * (1차시/2차시/3차시) 세부 트림만 다룬다. 차량가는 카탈로그에 없다(엑셀도
 * 매 견적마다 다나와 시세를 수기입력) — 견적 시점에 입력받는다.
 */

import vehiclesJson from "./data/vehicles.json";

export interface PolestarLeaseVehicle {
  brand: string;
  kind: string;
  fuel: string;
  /** true면 등취득세에서 EV 감면(140만원)을 뺀다 */
  evAcquisitionTaxRebate: boolean;
  /** 기본할인율(차량가 대비 %) */
  discountRate: number;
  /** 추가할인(정액) */
  discountAmount: number;
  /** "기간" → 잔가율 (36/48/60개월만 지원, 자체잔가 단일 잔가사) */
  residualByTerm: Record<string, number>;
}

type Raw = Record<string, PolestarLeaseVehicle | string>;
const VEHICLES: Record<string, PolestarLeaseVehicle> = Object.fromEntries(
  Object.entries(vehiclesJson as Raw).filter(
    (e): e is [string, PolestarLeaseVehicle] => typeof e[1] === "object",
  ),
);

function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s\-_()./+]/g, "");
}

const INDEX: [string, string][] = Object.keys(VEHICLES).map((k) => [normalize(k), k]);

export function findPolestarLeaseVehicle(name: string): PolestarLeaseVehicle | null {
  const exact = VEHICLES[name];
  if (exact) return exact;
  const n = normalize(name);
  if (!n) return null;
  const eq = INDEX.filter(([k]) => k === n);
  if (eq.length === 1) return VEHICLES[eq[0][1]];
  const prefix = INDEX.filter(([k]) => k.startsWith(n));
  if (prefix.length === 1) return VEHICLES[prefix[0][1]];
  return null;
}

export function listPolestarLeaseVehicles(): [string, PolestarLeaseVehicle][] {
  return Object.entries(VEHICLES);
}

export function resolvePolestarResidual(
  vehicle: PolestarLeaseVehicle,
  termMonths: number,
): number | null {
  return vehicle.residualByTerm[String(termMonths)] ?? null;
}
