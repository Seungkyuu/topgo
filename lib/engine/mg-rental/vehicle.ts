/**
 * MG캐피탈 장기렌터카(EV 전용) 차량 마스터 조회.
 *
 * 엑셀 `차량_List`/`잔가보장사_잔가` 시트에서 추출(scripts/extract_mg_rental.py)
 * → data/vehicles.json. 이 파일은 EV 라인업만(14개 모델) 다룬다 — 원본
 * 엑셀 자체가 EV 전용 월간 시트다.
 */

import vehiclesJson from "./data/vehicles.json";

export interface MgRentalVehicle {
  brand: string;
  fuel: string;
  consumptionTaxFactor: number;
  insuranceGrade: string;
  /** 잔가 시트("무카 잔가군") 조회 키 */
  residualClass: number;
  /** 24개월 초과 계약에만 적용되는 차종별 잔가 가산(잔가보장사_잔가!H열) */
  specialResidualBonus: number;
}

const VEHICLES = vehiclesJson as Record<string, MgRentalVehicle>;

function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s\-_()./]/g, "");
}

const INDEX: [string, string][] = Object.keys(VEHICLES).map((k) => [normalize(k), k]);

/** 검색어를 카탈로그의 원본 키(rate-table.json과 공유하는 키)로 정규화 */
export function resolveMgRentalKey(name: string): string | null {
  if (VEHICLES[name]) return name;
  const n = normalize(name);
  if (!n) return null;
  const eq = INDEX.filter(([k]) => k === n);
  if (eq.length === 1) return eq[0][1];
  const prefix = INDEX.filter(([k]) => k.startsWith(n));
  if (prefix.length === 1) return prefix[0][1];
  return null;
}

export function findMgRentalVehicle(name: string): MgRentalVehicle | null {
  const key = resolveMgRentalKey(name);
  return key ? VEHICLES[key] : null;
}

export function listMgRentalVehicles(): [string, MgRentalVehicle][] {
  return Object.entries(VEHICLES);
}
