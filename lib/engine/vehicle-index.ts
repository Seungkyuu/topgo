/**
 * 통합 차량 인덱스 — v3 "차량 우선" 구조의 심장.
 *
 * 원칙: "이름은 병합하고, 가격은 병합하지 않는다."
 *   · 소스(엑셀)별 내부 표기(♣프로모션♣, (특가), (25.08), <지원금> …)를 걷어낸
 *     정제 표시명으로 같은 차를 하나로 병합한다.
 *   · 각 소스 연결(ref)은 원본 라벨 그대로 유지 — 견적은 ref별로 그 소스의
 *     정확한 라벨·가격으로 계산한다. 소스 간 퍼지 매칭에 기대지 않는다.
 *   · 금융사명은 인덱스에 없다. 화면은 브랜드·차명·가격만 알면 된다.
 *
 * 같은 소스 안에서 정제명이 겹치면(프로모션 변형 등) 가장 싼 ref 하나만 남긴다.
 */

import { QUOTE_SOURCES, type DealType, type CapitalQuoteRow, type CapitalQuoteInput } from "./capitals";
import { listOrixModels, findOrixVehicle } from "./orix";
import { listShinhanModels } from "./shinhan";
import { listMeritzVehicles } from "./meritz";
import { listDomesticVehicles } from "./meritz-domestic";
import { listRentalVehicles } from "./meritz-rental-domestic";
import { listImportRentalVehicles } from "./meritz-rental-import";
import { listBnkVehicles } from "./bnk";
import { listMgRentalVehicles } from "./mg-rental";
import { listMgLeaseVehicles } from "./mg-lease";
import teslaVehiclesJson from "./meritz-tesla/data/vehicles.json";
import bydVehiclesJson from "./meritz-byd/data/vehicles.json";
import { listPolestarLeaseVehicles } from "./meritz-polestar";
import shinhanRentalJson from "./shinhan/data/rental-vehicles.json";
import { approxPrice } from "./approx-prices";
import { importRealPrice, importOfferKey } from "./import-real-price";
import { imageForVehicle } from "./vehicle-image";
import modelGroupsJson from "./data/model-groups.json";

export interface VehicleRef {
  sourceId: string;
  /** 그 소스 엔진에 그대로 전달할 원본 라벨 */
  model: string;
  /** 그 소스 기준 차량가 (manual 소스는 개략 시세) */
  price: number;
  /** 겟챠 등급 식별자("브랜드|모델|등급") — 소스 간 병합에 쓴다 */
  offerKey?: string;
  /** 모델 그룹 키(예: "3시리즈", "GLC-클래스") — 트림 선택 UI 그룹핑용.
   *  scripts/build_model_groups.py가 원본 라벨 기준으로 미리 계산해둔다. */
  modelGroup: string;
  /** 캐피탈사 엑셀 원 정가(겟챠 매칭 전 price) — 겟챠 실가격으로 교체된
   *  ref만 존재. "할인율 TOP3"(탑고 전용) 계산에만 쓰고 견적 계산 경로엔
   *  영향 없다. */
  listPrice?: number;
}

export interface IndexedVehicle {
  /** 병합 키 (브랜드+정제명 정규화) */
  id: string;
  /** 정제 표시명 (브랜드 제외) */
  display: string;
  brand: string;
  /** 모델 그룹명 — 같은 모델의 다른 트림들과 공유하는 키(예: "3시리즈").
   *  규칙이 없으면 자기 display로 폴백(1인 그룹, 차량이 사라지지 않는다). */
  modelGroup: string;
  /** 대표 표시 가격 — ref 중 최저가 */
  displayPrice: number;
  /** 카탈로그 실가격 없이 개략 시세뿐인 차량 여부 */
  priceIsEstimate: boolean;
  /** 겟챠 모델 사진 URL (없으면 앱이 브랜드 모노그램으로 폴백) */
  image?: string;
  refs: VehicleRef[];
}

/** 브랜드+모델그룹으로 트림들을 묶은 요약 — 차량 선택 UI 2단계(모델→트림)용. */
export interface ModelGroupSummary {
  /** 그룹 병합 키 (브랜드+그룹명 정규화) */
  id: string;
  brand: string;
  /** "3시리즈", "GLC-클래스" 등 */
  name: string;
  /** 대표 이미지 — 그룹 내 최저가 트림 기준 */
  image?: string;
  trimCount: number;
  /** 그룹 내 최저가 */
  minPrice: number;
  /** 그룹에 속한 트림들, 가격 오름차순 */
  trims: IndexedVehicle[];
}

const MODEL_GROUPS = modelGroupsJson as Record<string, Record<string, string>>;

function lookupModelGroup(sourceId: string, rawLabel: string): string {
  return MODEL_GROUPS[sourceId]?.[rawLabel] ?? rawLabel;
}

/** 개략 시세만 가진(카탈로그 가격 없는) 소스들 */
const ESTIMATE_SOURCES = new Set([
  "meritz-domestic-lease",
  "meritz-tesla-lease",
  "meritz-byd-lease",
]);

// ─── 표시명 정제 ─────────────────────────────────────────────────────────────

const DECORATIONS: RegExp[] = [
  /♣[^♣]*♣/g,          // ♣프로모션♣
  /\(특가\)/g,
  /\(보조금\)/g,
  /<지원금>/g,
  /^\(\d{2}\.\d{2}\)\s*/, // (25.08) 같은 시점 접두
  /\s1-1$/,               // 내부 변형 접미
  /\((NX4|CN7)\)/g,       // 플랫폼 코드
  /^BYD\s+/,              // 브랜드 칩으로 이미 보이는 "BYD" 접두어(표시명만 정리,
                          // ref.model엔 원본 그대로 남아 카탈로그 조회는 안 깨짐)
  /^폴스타\s+/,            // 위와 동일 이유 — "폴스타 폴스타 4 듀얼모터"처럼 중복 방지
];

/** 원본 엑셀 자체의 오타 교정 — 고객에게 그대로 노출되면 안 되는 것만.
 *  scripts/vehicle_taxonomy.py의 LABEL_TYPO_FIXES와 같은 목록을 유지한다
 *  (그쪽은 모델 그룹명, 여기는 트림 표시명 — 둘 다 고쳐야 한 모델로 보인다). */
const TYPO_FIXES: [RegExp, string][] = [[/쏘나티/g, "쏘나타"]];

/**
 * 맨 앞 토큰이 곧바로 한 번 더 반복되면 하나로 접는다.
 *
 * 메리츠 수입차 엑셀 키가 `<브랜드><모델> <세부모델>` 꼴인데 세부모델이 모델명을
 * 다시 포함하는 경우가 많다("LANDROVERDefender Defender 130 D300" →
 * 브랜드 제거 후 "Defender Defender 130 D300"). 그대로 두면 두 가지가 깨진다.
 *   1) 고객 화면에 "Discovery Discovery 3.0 D250 S"처럼 보인다.
 *   2) mergeKey가 brand+display라서 같은 차인데도 신한 표기와 안 합쳐져,
 *      메리츠 단독 취급 차량인 것처럼 중복 노출된다.
 * 위 DECORATIONS의 폴스타·BYD 접두 제거가 이 문제를 브랜드별로 하나씩 막고
 * 있었는데, 실제로는 369건(전체 5,332건)이라 일반 규칙으로 올린다.
 */
function collapseRepeatedHead(s: string): string {
  // 반복 토큰 뒤가 문자열 끝이거나 (·- 같은 비단어 문자여도 접는다
  // ("Ghibli Ghibli", "Macan Macan(가솔린)", "CT5 CT5-V Blackwing").
  // 다만 뒤에 단어 문자가 이어지면 접지 않는다 — "GT GTS"처럼 앞 토큰이
  // 뒤 토큰의 접두사일 뿐 중복이 아닌 경우를 지켜야 한다.
  return s.replace(/^(\S+)\s+\1(?![\w가-힣])/, "$1");
}

export function cleanDisplayName(label: string): string {
  let s = label;
  for (const re of DECORATIONS) s = s.replace(re, " ");
  for (const [re, to] of TYPO_FIXES) s = s.replace(re, to);
  s = s.replace(/\s+/g, " ").trim();
  return collapseRepeatedHead(s);
}

/** 병합 키: 소문자·기호/공백 제거 (한글 유지) */
function mergeKey(brand: string, display: string): string {
  const norm = (t: string) => t.toLowerCase().replace(/[\s\-_()./<>♣]/g, "");
  return `${norm(brand)}__${norm(display)}`;
}

// ─── 브랜드 추출 ─────────────────────────────────────────────────────────────

/** 메리츠 수입차 키의 브랜드 접두 (붙여쓴 형태 포함) → 한글 표기 */
const MERITZ_BRAND_PREFIXES: [string, string][] = [
  ["LANDROVER", "랜드로버"],
  ["VOLKSWAGEN", "폭스바겐"],
  ["CADILLAC", "캐딜락"],
  ["MASERATI", "마세라티"],
  ["PORSCHE", "포르쉐"],
  ["PEUGEOT", "푸조"],
  ["JAGUAR", "재규어"],
  ["Citroen", "시트로엥"],
  ["TOYOTA", "토요타"],
  ["LEXUS", "렉서스"],
  ["HONDA", "혼다"],
  ["Polestar", "폴스타"],
  ["Tesla", "테슬라"],
  ["Benz", "벤츠"],
  ["Audi", "아우디"],
  ["FORD", "포드"],
  ["JEEP", "지프"],
  ["MINI", "미니"],
  ["VOLVO", "볼보"],
  ["BMW", "BMW"],
  ["BYD", "BYD"],
  ["GMC", "GMC"],
];

function splitMeritzBrand(key: string): { brand: string; rest: string } {
  for (const [prefix, ko] of MERITZ_BRAND_PREFIXES) {
    if (key.toUpperCase().startsWith(prefix.toUpperCase())) {
      let rest = key.slice(prefix.length);
      if (rest.startsWith(" ") || rest.startsWith("_")) rest = rest.slice(1);
      return { brand: ko, rest: rest.replace(/_/g, " ").trim() || key };
    }
  }
  return { brand: "수입차", rest: key };
}

const GENESIS_PATTERN = /\b(G70|G80|G90|GV60|GV70|GV80)\b/i;

// 메리츠 국산(리스·렌트) 카탈로그 브랜드는 실데이터(v.brand)를 그대로 쓴다 —
// 제네시스만 예외로, 카탈로그 브랜드가 "현대"로 뭉뚱그려 있어도 모델코드로
// 재분류해야 한다(예전엔 이 재분류 로직을 "전체 도메스틱 브랜드 판별"로
// 잘못 확장해서 기아/KGM/르노/쉐보레까지 전부 "현대"로 오분류했었다 — 그랑
// 콜레오스/쏘렌토/스포티지/토레스/필랑트/액티언 버그).
function domesticBrand(label: string, catalogBrand: string): string {
  return GENESIS_PATTERN.test(label) ? "제네시스" : catalogBrand.replace(/자동차$/, "") || "현대";
}

// ─── 인덱스 빌드 ─────────────────────────────────────────────────────────────

function jsonModelNames(json: Record<string, unknown>): string[] {
  return Object.entries(json)
    .filter(([, v]) => typeof v === "object" && v !== null)
    .map(([k]) => k);
}

const JUNK_LABELS = new Set(["차종"]);

let cache: IndexedVehicle[] | null = null;

export function buildVehicleIndex(): IndexedVehicle[] {
  if (cache) return cache;

  const byKey = new Map<string, IndexedVehicle>();

  const add = (
    brand: string,
    rawLabel: string,
    sourceId: string,
    price: number,
    offerKey?: string,
    listPrice?: number,
  ) => {
    if (JUNK_LABELS.has(rawLabel.trim())) return;
    const display = cleanDisplayName(rawLabel);
    if (!display) return;
    const modelGroup = lookupModelGroup(sourceId, rawLabel);
    const id = mergeKey(brand, display);
    let v = byKey.get(id);
    if (!v) {
      v = { id, display, brand, modelGroup, displayPrice: 0, priceIsEstimate: true, refs: [] };
      byKey.set(id, v);
    }
    // 같은 소스에 정제명이 겹치는 변형(프로모션 등)은 최저가 ref 하나만
    const existing = v.refs.find((r) => r.sourceId === sourceId);
    if (existing) {
      if (price > 0 && (existing.price === 0 || price < existing.price)) {
        existing.model = rawLabel;
        existing.price = price;
        existing.offerKey = offerKey;
        existing.modelGroup = modelGroup;
        existing.listPrice = listPrice;
      }
      return;
    }
    v.refs.push({ sourceId, model: rawLabel, price, offerKey, modelGroup, listPrice });
  };

  // 오릭스 — 벤츠·테슬라. 겟챠 실가격이 있으면 엑셀 가격 대신 그걸 쓴다
  // (계산 입력값 자체를 교체 — 수입차도 겟챠 할인가 기준이라는 사업 규칙).
  for (const m of listOrixModels()) {
    const price = findOrixVehicle(m)?.price ?? 0;
    add(/model/i.test(m) ? "테슬라" : "벤츠", m, "orix", importRealPrice(m, price), importOfferKey(m), price);
  }
  // 신한 오토리스
  for (const v of listShinhanModels()) {
    const rawKey = `${v.brand} ${v.model}`;
    add(
      v.brand,
      v.model,
      "shinhan-lease",
      importRealPrice(rawKey, v.vehiclePrice),
      importOfferKey(rawKey),
      v.vehiclePrice,
    );
  }
  // 신한 렌터카 — 원본 엑셀에 브랜드 자리에 "전기차"/"선구매 전용 OO"처럼
  // 실제 브랜드명이 아닌 특판 마커가 들어간 항목이 섞여있다. 이런 특판
  // 차량은 별도로 관리하는 대상이라 일반 비교 카탈로그에서는 제외한다.
  // 그리고 이 소스만 "JEEP"/"도요타"처럼 다른 소스(신한 오토리스="지프"/
  // "토요타")와 표기가 달라 같은 브랜드가 둘로 쪼개지던 것도 정규화한다
  // (표기가 다르면 브랜드 로고·차량 사진 매칭도 못 찾는다).
  const SPECIAL_SALE_BRAND_RE = /^(전기차|선구매\s*전용)/;
  const RENTAL_BRAND_ALIAS: Record<string, string> = {
    JEEP: "지프",
    도요타: "토요타",
    // 원본에 3사(푸조·시트로엥·DS) 통합 브랜드로 들어있지만 실제로는
    // 전부 3008/5008/308/408 등 푸조 모델뿐이라 "푸조"로 정규화한다
    // (안 하면 "푸조" 브랜드 칩으로 검색해도 이 8대가 안 잡힘).
    "푸조/시트로엥/DS": "푸조",
  };
  for (const [, v] of Object.entries(shinhanRentalJson as Record<string, unknown>)) {
    if (typeof v !== "object" || v === null) continue;
    const rv = v as { brand: string; model: string; vehiclePrice: number };
    if (SPECIAL_SALE_BRAND_RE.test(rv.brand)) continue;
    const brand = RENTAL_BRAND_ALIAS[rv.brand] ?? rv.brand;
    add(brand, rv.model, "shinhan-rental", rv.vehiclePrice);
  }
  // 메리츠 수입차
  for (const [key, v] of listMeritzVehicles()) {
    const { brand, rest } = splitMeritzBrand(key);
    add(
      brand,
      rest,
      "meritz-import",
      importRealPrice(key, v.vehiclePrice),
      importOfferKey(key),
      v.vehiclePrice,
    );
  }
  // 메리츠 국산차
  for (const [key, v] of listDomesticVehicles()) {
    add(domesticBrand(key, v.brand), key, "meritz-domestic-lease", approxPrice(key, 38_000_000));
  }
  // 메리츠 국산 장기렌트 — "[프로모션]"/"[Select 프로모션]" 접두 모델은 같은
  // 실차의 별도 판매조건 변형이라 정제명이 안 겹쳐(대괄호가 DECORATIONS에
  // 없어 안 벗겨짐) 기본 트림과 별개의 카드로 중복 노출되고, 심지어 브랜드
  // 표기까지 기본 트림과 어긋나 보이는 문제가 있었다 — 사용자 확정: 이런
  // 프로모션/특판 변형은 카탈로그에서 아예 제외하고 기본 트림만 남긴다.
  const PROMO_LABEL_RE = /^\[(Select\s*)?프로모션\]\s*/;
  for (const [key, v] of listRentalVehicles()) {
    if (PROMO_LABEL_RE.test(key)) continue;
    add(domesticBrand(key, v.brand), key, "meritz-rental-domestic", approxPrice(key, 38_000_000));
  }
  // 메리츠 테슬라
  for (const key of jsonModelNames(teslaVehiclesJson as Record<string, unknown>)) {
    add("테슬라", key, "meritz-tesla-lease", approxPrice(key, 55_000_000));
  }
  // 메리츠 BYD
  // ⚠ 과거엔 여기서 "BYD " 접두어를 벗기고 넘겼는데, meritz-byd 카탈로그
  //   자체가 "BYD ATTO 3"처럼 접두어를 포함한 키로 저장돼 있어(findBydVehicle
  //   조회 실패) 이 소스로는 견적이 조용히 하나도 안 나오고 있었다 —
  //   ref.model은 원본 키 그대로 넘겨야 한다(아래 meritz-rental-import와 동일 원칙).
  for (const key of jsonModelNames(bydVehiclesJson as Record<string, unknown>)) {
    add("BYD", key, "meritz-byd-lease", approxPrice(key, 32_000_000));
  }
  // 메리츠 Polestar 전용 운용리스 — Polestar 4 생산배치별(1~3차시) 세부 트림.
  // 마스터에 차량가가 없어(엑셀도 매 견적 시세 수기입력) approxPrice로만 표시.
  for (const [key] of listPolestarLeaseVehicles()) {
    add("Polestar", key, "meritz-polestar-lease", approxPrice(key, 70_000_000));
  }
  // 메리츠 수입(EV) 장기렌트 — 테슬라·폴스타·BYD(전 모델 EV).
  // ⚠ add()의 두 번째 인자(rawLabel)는 ref.model로 그대로 저장되고,
  //   견적 시점에 그 값 그대로 findImportRentalVehicle()에 넘어가 카탈로그
  //   (data/vehicles.json) 키와 정확히 일치해야 한다 — 브랜드 접두어를
  //   벗겨서 넘기면(예전 메리츠 BYD 리스 블록의 실수) 카탈로그에 없는 이름을
  //   조회하게 돼 "이 차량을 취급하지 않아요"로 조용히 실패한다. 표시용
  //   브랜드만 별도로 넘기고 원본 키는 그대로 보존한다.
  for (const [key] of listImportRentalVehicles()) {
    if (key.startsWith("BYD")) {
      add("BYD", key, "meritz-rental-import", approxPrice(key, 32_000_000));
    } else if (key.startsWith("폴스타")) {
      add("폴스타", key, "meritz-rental-import", approxPrice(key, 80_000_000));
    } else {
      add("테슬라", key, "meritz-rental-import", approxPrice(key, 55_000_000));
    }
  }
  // BNK캐피탈 — 브랜드가 카탈로그(CDB)에 이미 정확히 들어있어 그대로 사용.
  // 차량가는 CDB에 없음(잔가사 자동선택 구조라 엑셀도 겟챠 시세를 그때그때
  // 입력받는 방식) — 겟챠 실가격을 우선 쓰고 없으면 근사치로 대체.
  for (const v of listBnkVehicles()) {
    add(v.brand, v.model, "bnk-operating-lease", importRealPrice(v.model, approxPrice(v.model, 45_000_000)));
  }
  // MG캐피탈 — EV 전용 장기렌터카(14개 모델). 원본 브랜드가 전부
  // "현대자동차"/"기아자동차"인데 G80_EV·GV60·GV70은 실제로 제네시스라
  // GENESIS_PATTERN으로 재분류하고, "_"는 공백으로 정리해서 표시한다.
  for (const [key, v] of listMgRentalVehicles()) {
    const display = key.replace(/_/g, " ");
    const brand = GENESIS_PATTERN.test(display) ? "제네시스" : v.brand.replace(/자동차$/, "");
    add(brand, display, "mg-rental", importRealPrice(key, approxPrice(key, 50_000_000)));
  }
  // MG캐피탈 — 운용리스(235개 모델, 브랜드는 카탈로그에 이미 정확히 들어있음)
  for (const [key, v] of listMgLeaseVehicles()) {
    add(v.brand, key, "mg-lease", importRealPrice(key, approxPrice(key, v.vehiclePrice)));
  }

  // ─── 소스 간 병합(겟챠 등급 식별자 기준) ─────────────────────────────────
  // 위 mergeKey는 소스별 원본 표기(브랜드+정제명)가 글자 그대로 같아야만
  // 합친다 — 그런데 오릭스·신한·메리츠는 같은 실차도 표기 관례가 완전히
  // 달라서("E 200 AV" / "벤츠 E200 AMG Line" / "Benz E 220d 4MATIC AMG
  // Line") 텍스트로는 거의 안 겹친다. 그 결과 수입차의 87%가 캐피탈
  // 하나에서만 잡히는 것처럼 보였다(실제로는 여러 곳에서 취급하는데도).
  // 세 카탈로그가 모두 같은 겟챠 등급에 매칭돼 있다면 사실상 같은 실차란
  // 뜻이므로, offerKey가 같은 vehicle들을 유니온-파인드로 하나로 합친다.
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;
    while (parent.has(root)) root = parent.get(root)!;
    if (root !== id) parent.set(id, root); // 경로 압축
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  const idsByOfferKey = new Map<string, Set<string>>();
  for (const v of byKey.values()) {
    for (const r of v.refs) {
      if (!r.offerKey) continue;
      let ids = idsByOfferKey.get(r.offerKey);
      if (!ids) idsByOfferKey.set(r.offerKey, (ids = new Set()));
      ids.add(v.id);
    }
  }
  for (const ids of idsByOfferKey.values()) {
    const [first, ...rest] = [...ids];
    for (const id of rest) union(id, first);
  }
  for (const v of byKey.values()) {
    const root = find(v.id);
    if (root === v.id) continue;
    const target = byKey.get(root);
    if (!target) continue;
    for (const r of v.refs) {
      const existing = target.refs.find((tr) => tr.sourceId === r.sourceId);
      if (existing) {
        if (r.price > 0 && (existing.price === 0 || r.price < existing.price)) {
          existing.model = r.model;
          existing.price = r.price;
          existing.offerKey = r.offerKey;
          existing.modelGroup = r.modelGroup;
        }
      } else {
        target.refs.push(r);
      }
    }
    byKey.delete(v.id);
  }

  const list = [...byKey.values()];
  for (const v of list) {
    const priced = v.refs.filter((r) => r.price > 0);
    const catalogPrices = v.refs.filter((r) => r.price > 0 && !ESTIMATE_SOURCES.has(r.sourceId));
    v.priceIsEstimate = catalogPrices.length === 0;
    const pool = catalogPrices.length > 0 ? catalogPrices : priced;
    v.displayPrice = pool.length > 0 ? Math.min(...pool.map((r) => r.price)) : 0;
    v.image = imageForVehicle(v.brand, v.display, v.modelGroup);
  }
  list.sort((a, b) =>
    a.brand === b.brand
      ? a.display.localeCompare(b.display, "ko")
      : a.brand.localeCompare(b.brand, "ko"),
  );
  cache = list;
  return list;
}

/** 브랜드 목록 — 보유 차종 수 내림차순 */
export function listBrands(): string[] {
  const counts = new Map<string, number>();
  for (const v of buildVehicleIndex()) {
    counts.set(v.brand, (counts.get(v.brand) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([b]) => b);
}

/** (탑고 전용) 겟챠 실가격으로 교체된 ref 중 정가 대비 할인율이 가장 큰
 *  것을 찾는다. listPrice가 없는(=수입차 겟챠 매칭이 안 된, 또는 원래
 *  국산/EV처럼 정가·실가 쌍이 없는) 차량은 null — 할인율을 "모른다"를
 *  0%로 위장하지 않는다. */
export function bestDiscount(
  v: IndexedVehicle,
): { rate: number; listPrice: number; realPrice: number } | null {
  let best: { rate: number; listPrice: number; realPrice: number } | null = null;
  for (const r of v.refs) {
    if (!r.listPrice || r.listPrice <= 0 || r.price <= 0 || r.listPrice <= r.price) continue;
    const rate = (r.listPrice - r.price) / r.listPrice;
    if (!best || rate > best.rate) best = { rate, listPrice: r.listPrice, realPrice: r.price };
  }
  return best;
}

// ─── 모델 그룹(브랜드→모델→트림 2단계 선택 UI) ────────────────────────────────

let modelGroupCache: ModelGroupSummary[] | null = null;

/** IndexedVehicle[] (트림 단위)를 브랜드+모델그룹으로 다시 묶은 파생 뷰.
 *  buildVehicleIndex()와 같은 캐싱 패턴 — 순수 함수라 한 번만 계산한다. */
export function buildModelGroups(): ModelGroupSummary[] {
  if (modelGroupCache) return modelGroupCache;

  const byKey = new Map<string, ModelGroupSummary>();
  for (const v of buildVehicleIndex()) {
    const id = mergeKey(v.brand, v.modelGroup);
    let g = byKey.get(id);
    if (!g) {
      g = { id, brand: v.brand, name: v.modelGroup, trimCount: 0, minPrice: 0, trims: [] };
      byKey.set(id, g);
    }
    g.trims.push(v);
  }

  const list = [...byKey.values()];
  for (const g of list) {
    g.trims.sort((a, b) => a.displayPrice - b.displayPrice);
    g.trimCount = g.trims.length;
    g.minPrice = g.trims[0]?.displayPrice ?? 0;
    // 최저가 트림에 사진이 없어도 같은 그룹의 다른 트림에 있으면 그걸 쓴다
    // (그룹 전체가 모노그램 폴백으로 떨어지는 걸 최대한 피한다).
    g.image = g.trims.find((t) => t.image)?.image;
  }
  list.sort((a, b) =>
    a.brand === b.brand ? a.name.localeCompare(b.name, "ko") : a.brand.localeCompare(b.brand, "ko"),
  );
  modelGroupCache = list;
  return list;
}

// ─── 견적 라우팅 (ref 기반 — 퍼지 매칭 없음) ─────────────────────────────────

const SOURCE_BY_ID = new Map(QUOTE_SOURCES.map((s) => [s.id, s]));

/** 이 차량으로 가능한 상품들 */
export function dealsForIndexed(v: IndexedVehicle): DealType[] {
  const set = new Set<DealType>();
  for (const r of v.refs) {
    SOURCE_BY_ID.get(r.sourceId)?.deals.forEach((d) => set.add(d));
  }
  return (["operatingLease", "financeLease", "longTermRental"] as DealType[]).filter((d) =>
    set.has(d),
  );
}

export interface IndexedQuoteInput {
  termMonths: number;
  annualMileageKm: number;
  depositRate: number;
  prepayment: number;
}

/** ref별로 각 소스의 정확한 라벨·가격으로 견적 */
export function quoteIndexed(
  v: IndexedVehicle,
  deal: DealType,
  input: IndexedQuoteInput,
): CapitalQuoteRow[] {
  const rows: CapitalQuoteRow[] = [];
  for (const r of v.refs) {
    const source = SOURCE_BY_ID.get(r.sourceId);
    if (!source || !source.deals.includes(deal)) continue;
    const quoteInput: CapitalQuoteInput = {
      model: r.model,
      vehiclePrice: r.price,
      termMonths: input.termMonths,
      annualMileageKm: input.annualMileageKm,
      depositRate: input.depositRate,
      prepayment: input.prepayment,
    };
    rows.push({ ...source.quote(deal, quoteInput), sourceLabel: source.label });
  }
  return rows;
}
