/**
 * BNK캐피탈 차량 마스터 조회.
 *
 * 엑셀 `CDB` 시트에서 추출(scripts/extract_bnk.py) → data/vehicles.json.
 * 다른 캐피탈과 달리 잔가율표가 없다 — 대신 차종마다 "잔가사(7곳 중 취급하는
 * 곳)별 잔가군 코드"만 갖고 있고, 실제 잔가율은 RVs 공유 매트릭스에서 조회한다.
 */

import vehiclesJson from "./data/vehicles.json";

export const GUARANTORS = ["WS", "CB", "BR", "TY", "JY", "CR", "ADB"] as const;
export type Guarantor = (typeof GUARANTORS)[number];

export interface BnkVehicle {
  brand: string;
  model: string;
  isImport: boolean;
  kind: string;
  engineCc: number;
  isEco: boolean;
  /** 잔가사별 잔가군 코드 — 그 잔가사가 이 차종을 취급 안 하면 키가 없음 */
  guarantorCodes: Partial<Record<Guarantor, string>>;
}

const VEHICLES = vehiclesJson as Record<string, BnkVehicle>;

function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s\-_()./]/g, "");
}

const INDEX: [string, string][] = Object.entries(VEHICLES).map(([code, v]) => [
  normalize(v.model),
  code,
]);

export function findBnkVehicle(name: string): BnkVehicle | null {
  const n = normalize(name);
  if (!n) return null;
  const eq = INDEX.filter(([k]) => k === n);
  if (eq.length === 1) return VEHICLES[eq[0][1]];
  const prefix = INDEX.filter(([k]) => k.startsWith(n));
  if (prefix.length === 1) return VEHICLES[prefix[0][1]];
  return null;
}

export function listBnkVehicles(): BnkVehicle[] {
  return Object.values(VEHICLES);
}
