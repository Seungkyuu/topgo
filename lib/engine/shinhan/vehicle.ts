/**
 * 신한카드 오토리스 모델 마스터 조회.
 *
 * 데이터: 엑셀 `모델, 잔가` 시트(664개 모델) → data/vehicles.json
 * 키 = "브랜드 모델명" (동명 모델은 코드 병기).
 *
 * 캐피탈마다 모델 표기가 달라(오릭스 "S 500 4M" vs 신한 "S500 4MATIC") 공백·기호를
 * 제거한 정규화 비교와, 후보가 유일할 때만 허용하는 전방일치 매칭을 지원한다.
 */

import vehiclesJson from "./data/vehicles.json";

export interface ShinhanVehicle {
  brand: string;
  model: string;
  code: string;
  vehiclePrice: number;
  engineCc: number;
  /** M=내연 / E=전기 */
  fuel: string;
  /** 잔가군 코드 (잔가군 매트릭스 키). "취급불가"면 리스 불가 */
  residualGroup: string;
}

type Raw = Record<string, ShinhanVehicle | string>;
const VEHICLES: Record<string, ShinhanVehicle> = Object.fromEntries(
  Object.entries(vehiclesJson as Raw).filter(
    (e): e is [string, ShinhanVehicle] => typeof e[1] === "object",
  ),
);

function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s\-_()./]/g, "");
}

const NORMALIZED_INDEX: [string, ShinhanVehicle][] = Object.entries(VEHICLES).map(
  ([key, v]) => [normalize(key), v],
);

export function findShinhanVehicle(name: string): ShinhanVehicle | null {
  const exact = VEHICLES[name];
  if (exact) return exact;

  const n = normalize(name);
  if (!n) return null;

  const keyEq = NORMALIZED_INDEX.filter(([k]) => k === n);
  if (keyEq.length === 1) return keyEq[0][1];

  // 모델명만으로도 비교 (브랜드 없이 입력된 경우)
  const modelEq = NORMALIZED_INDEX.filter(([, v]) => normalize(v.model) === n);
  if (modelEq.length === 1) return modelEq[0][1];

  // 전방일치 — 후보가 유일할 때만 (모호하면 미연동 처리)
  const prefix = NORMALIZED_INDEX.filter(
    ([k, v]) => k.startsWith(n) || normalize(v.model).startsWith(n),
  );
  if (prefix.length === 1) return prefix[0][1];

  return null;
}

export function listShinhanBrands(): string[] {
  return [...new Set(Object.values(VEHICLES).map((v) => v.brand))];
}

export function listShinhanModels(brand?: string): ShinhanVehicle[] {
  const all = Object.values(VEHICLES);
  return brand ? all.filter((v) => v.brand === brand) : all;
}
