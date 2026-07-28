/**
 * 오릭스 차량 마스터 조회 (모델 → 소비자가·배기량).
 *
 * 엑셀 `차량정보` 시트에서 추출(모델 93종). `data/vehicles.json`.
 * 소비자가(O9 = VLOOKUP)와 배기량(Q8 = 차량정보!D…) 자동 조회에 사용.
 * 배기량이 없는 항목은 전기차 등.
 */

import vehicles from "./data/vehicles.json";

export interface OrixVehicle {
  /** 소비자가격(원) */
  price: number;
  /** 배기량(cc). 전기차 등은 없음. */
  displacementCc?: number;
}

const TABLE = vehicles as Record<string, OrixVehicle>;

export function getOrixVehicle(model: string): OrixVehicle {
  const v = TABLE[model];
  if (!v) throw new Error(`차량정보에 없는 모델: ${model}`);
  return v;
}

export function findOrixVehicle(model: string): OrixVehicle | undefined {
  return TABLE[model];
}

/** 잔가·가격이 등록된 오릭스 모델명 목록(정렬). */
export function listOrixModels(): string[] {
  return Object.keys(TABLE).sort((a, b) => a.localeCompare(b, "ko"));
}
