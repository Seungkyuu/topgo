/**
 * 신한카드 장기렌트 모델 마스터 조회 (엑셀 `차량모델기준` 시트, 515개).
 * 잔가율은 기간별로 직접 저장돼 있어(약정거리 20,000km 기준선) 그룹 매핑이 불필요하다.
 */

import vehiclesJson from "./data/rental-vehicles.json";

export interface ShinhanRentalVehicle {
  brand: string;
  model: string;
  vehiclePrice: number;
  engineCc: number;
  fuel: string;
  residualGroup: string;
  maintenanceGrade: string;
  guaranteeFeeRate: number;
  /** 기간(개월 문자열) → 잔가율. 값이 없는 기간은 취급 불가 */
  residualByTerm: Record<string, number>;
}

type Raw = Record<string, ShinhanRentalVehicle | string>;
const VEHICLES: Record<string, ShinhanRentalVehicle> = Object.fromEntries(
  Object.entries(vehiclesJson as Raw).filter(
    (e): e is [string, ShinhanRentalVehicle] => typeof e[1] === "object",
  ),
);

function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s\-_()./]/g, "");
}

const INDEX: [string, ShinhanRentalVehicle][] = Object.entries(VEHICLES).map(
  ([key, v]) => [normalize(key), v],
);

export function findShinhanRentalVehicle(name: string): ShinhanRentalVehicle | null {
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

/** 모델의 기간별 잔가율 조회. 데이터 없으면 null */
export function resolveShinhanRentalResidual(
  vehicle: ShinhanRentalVehicle,
  termMonths: number,
): number | null {
  return vehicle.residualByTerm[String(termMonths)] ?? null;
}
