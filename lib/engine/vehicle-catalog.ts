/**
 * 통합 차량 검색 카탈로그 — 8개 소스를 하나의 검색 목록으로 합친다.
 *
 * 소스마다 카탈로그에 차량가가 있는 것과 없는 것이 갈린다:
 *   - 있음(catalog): 오릭스, 신한 오토리스, 메리츠 수입차 → 그 값을 기본가로 채운다.
 *   - 없음(manual): 메리츠 국산차·테슬라·BYD → 실제 서비스에서는 갓챠(카랩) 시세를
 *     실시간으로 긁어와야 한다(사업 규칙). 그 연동 전까지는 모델별 개략 시세
 *     (approx-prices.ts)로 채워 견적이 바로 계산되게 한다 — 화면엔 "예상가" 표기,
 *     고객이 직접 입력하지 않는다.
 *
 * 정확한 견적 계산 자체는 각 소스 엔진이 하고, 이 모듈은 "검색해서 고를 수 있는
 * 차량 목록"만 만든다 — 계산 로직에는 관여하지 않는다.
 */

import { listOrixModels, findOrixVehicle } from "./orix";
import { listShinhanModels } from "./shinhan";
import { listMeritzVehicles } from "./meritz";
import { listDomesticVehicles } from "./meritz-domestic";
import { approxPrice } from "./approx-prices";
import teslaVehiclesJson from "./meritz-tesla/data/vehicles.json";
import bydVehiclesJson from "./meritz-byd/data/vehicles.json";

export type PriceOrigin = "catalog" | "manual";

export interface CatalogEntry {
  /** 검색·선택에 쓰는 모델명 (엔진 조회 시 그대로 전달) */
  label: string;
  /** 표시용 그룹 (검색 결과 보조 텍스트) */
  group: string;
  /** 표시용 기본가. catalog면 실제 카탈로그 값, manual이면 카랩 연동 전 placeholder 시세 */
  defaultPrice: number;
  priceOrigin: PriceOrigin;
}

function jsonModelNames(json: Record<string, unknown>): string[] {
  return Object.entries(json)
    .filter(([, v]) => typeof v === "object" && v !== null)
    .map(([k]) => k);
}

/**
 * 카랩 실시간 연동 전 그룹별 기본가 — approx-prices.ts의 모델별 개략 시세에
 * 매칭이 없을 때만 쓰는 최후 fallback. (카랩 연동 시 approx-prices와 함께 대체)
 */
const GROUP_FALLBACK_PRICE: Record<string, number> = {
  "국산차 (메리츠)": 38_000_000,
  "테슬라 (메리츠)": 55_000_000,
  "BYD (메리츠)": 32_000_000,
};

/** 엑셀 추출 시 섞여 들어온 헤더 행 등 차량이 아닌 라벨 */
const JUNK_LABELS = new Set(["차종"]);

let cache: CatalogEntry[] | null = null;

export function buildVehicleCatalog(): CatalogEntry[] {
  if (cache) return cache;

  const entries: CatalogEntry[] = [];
  const seen = new Set<string>();
  const add = (label: string, group: string, defaultPrice: number, priceOrigin: PriceOrigin) => {
    if (JUNK_LABELS.has(label.trim())) return;
    const key = `${label}__${group}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push({ label, group, defaultPrice, priceOrigin });
  };

  // 오릭스 (벤츠·테슬라) — 카탈로그 가격 있음
  for (const m of listOrixModels()) {
    const v = findOrixVehicle(m);
    add(m, "수입차 (오릭스)", v?.price ?? 0, "catalog");
  }

  // 신한 오토리스 — 카탈로그 가격 있음
  for (const v of listShinhanModels()) {
    add(`${v.brand} ${v.model}`, "수입차 (신한)", v.vehiclePrice, "catalog");
  }

  // 메리츠 수입차 — 카탈로그 가격 있음
  for (const [key, v] of listMeritzVehicles()) {
    add(key, "수입차 (메리츠)", v.vehiclePrice, "catalog");
  }

  // 메리츠 국산차 — 카탈로그 가격 없음. 카랩 연동 전까지 모델별 개략 시세로 채운다
  for (const [key] of listDomesticVehicles()) {
    add(key, "국산차 (메리츠)", approxPrice(key, GROUP_FALLBACK_PRICE["국산차 (메리츠)"]), "manual");
  }

  // 메리츠 테슬라 — 카탈로그 가격 없음. 카랩 연동 전까지 모델별 개략 시세로 채운다
  for (const key of jsonModelNames(teslaVehiclesJson as Record<string, unknown>)) {
    add(key, "테슬라 (메리츠)", approxPrice(key, GROUP_FALLBACK_PRICE["테슬라 (메리츠)"]), "manual");
  }

  // 메리츠 BYD — 카탈로그 가격 없음. 카랩 연동 전까지 모델별 개략 시세로 채운다
  for (const key of jsonModelNames(bydVehiclesJson as Record<string, unknown>)) {
    add(key, "BYD (메리츠)", approxPrice(key, GROUP_FALLBACK_PRICE["BYD (메리츠)"]), "manual");
  }

  entries.sort((a, b) => a.label.localeCompare(b.label, "ko"));
  cache = entries;
  return entries;
}
