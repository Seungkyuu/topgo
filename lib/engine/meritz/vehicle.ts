/**
 * 메리츠캐피탈 수입리스 차종 마스터 조회 (엑셀 `차종` 시트, 1,096개).
 * 키 = "브랜드 모델명". 신한과 동일한 정규화·전방일치 매칭.
 */

import vehiclesJson from "./data/vehicles.json";

export interface MeritzVehicle {
  brand: string;
  model: string;
  vehiclePrice: number;
  engineCc: number;
  fuel: string;
  /** 잔가사별 잔가군 코드 (west/aj/aps/vgs/self) */
  groups: Record<string, string>;
  highResidualBan: boolean;
  /** AJ·자체 고잔가 추가 (주행 2만 미만) */
  hrBonus15k: number;
  /** AJ·자체 고잔가 추가 (주행 1.5만 미만) */
  hrBonus10k: number;
}

type Raw = Record<string, MeritzVehicle | string>;
const VEHICLES: Record<string, MeritzVehicle> = Object.fromEntries(
  Object.entries(vehiclesJson as Raw).filter(
    (e): e is [string, MeritzVehicle] => typeof e[1] === "object",
  ),
);

function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s\-_()./]/g, "");
}

const INDEX: [string, MeritzVehicle][] = Object.entries(VEHICLES).map(
  ([key, v]) => [normalize(key), v],
);

export function findMeritzVehicle(name: string): MeritzVehicle | null {
  const exact = VEHICLES[name];
  if (exact) return exact;

  const n = normalize(name);
  if (!n) return null;

  const keyEq = INDEX.filter(([k]) => k === n);
  if (keyEq.length === 1) return keyEq[0][1];

  const modelEq = INDEX.filter(([, v]) => normalize(v.model) === n);
  if (modelEq.length === 1) return modelEq[0][1];

  const prefix = INDEX.filter(
    ([k, v]) => k.startsWith(n) || normalize(v.model).startsWith(n),
  );
  if (prefix.length === 1) return prefix[0][1];

  return null;
}

/** 메리츠 수입차 전체 목록 (모델명 → 차량 정보) */
export function listMeritzVehicles(): [string, MeritzVehicle][] {
  return Object.entries(VEHICLES);
}
