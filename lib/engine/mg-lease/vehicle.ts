/**
 * MG캐피탈 운용리스 차량 마스터 조회.
 *
 * 엑셀 `차량DB` 시트에서 추출(scripts/extract_mg_lease.py) → data/vehicles.json.
 * 잔가율은 원본의 3개 소스(SNK/APS/차봇) 중 APS열만 사용한다 — 자세한 근거는
 * extract_mg_lease.py 문서 주석 참고(안전한 방향의 의도적 단순화).
 */

import vehiclesJson from "./data/vehicles.json";

export interface MgLeaseVehicle {
  brand: string;
  vehiclePrice: number;
  engineCc: number;
  kind: string;
  residualByTerm: Record<string, number>;
}

const VEHICLES = vehiclesJson as Record<string, MgLeaseVehicle>;

function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s\-_()./]/g, "");
}

const INDEX: [string, string][] = Object.keys(VEHICLES).map((k) => [normalize(k), k]);

export function findMgLeaseVehicle(name: string): MgLeaseVehicle | null {
  if (VEHICLES[name]) return VEHICLES[name];
  const n = normalize(name);
  if (!n) return null;
  const eq = INDEX.filter(([k]) => k === n);
  if (eq.length === 1) return VEHICLES[eq[0][1]];
  const prefix = INDEX.filter(([k]) => k.startsWith(n));
  if (prefix.length === 1) return VEHICLES[prefix[0][1]];
  return null;
}

export function listMgLeaseVehicles(): [string, MgLeaseVehicle][] {
  return Object.entries(VEHICLES);
}
