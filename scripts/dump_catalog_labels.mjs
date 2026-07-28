/**
 * 매칭 스크립트(match_getcha_prices.py)가 읽을 카탈로그 라벨 목록을 뽑아낸다.
 * TS 엔진 모듈을 거치지 않고 원본 JSON을 직접 읽는다 — 실제로 필요한 건
 * "객체 형태 값을 가진 키" 목록뿐이라, listDomesticVehicles() 등이 하는
 * 필터링과 동일한 결과를 tsx 없이 순수 Node로 재현한다.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_DIR = join(ROOT, "scripts", ".cache");
mkdirSync(CACHE_DIR, { recursive: true });

function objectKeys(path) {
  const json = JSON.parse(readFileSync(path, "utf-8"));
  return Object.entries(json)
    .filter(([, v]) => typeof v === "object" && v !== null)
    .map(([k]) => k);
}

const domestic = objectKeys(join(ROOT, "lib/engine/meritz-domestic/data/vehicles.json"));
const tesla = objectKeys(join(ROOT, "lib/engine/meritz-tesla/data/vehicles.json"));
const byd = objectKeys(join(ROOT, "lib/engine/meritz-byd/data/vehicles.json"));
const orix = objectKeys(join(ROOT, "lib/engine/orix/data/vehicles.json"));
const shinhan = objectKeys(join(ROOT, "lib/engine/shinhan/data/vehicles.json"));
const meritzImport = objectKeys(join(ROOT, "lib/engine/meritz/data/vehicles.json"));

writeFileSync(join(CACHE_DIR, "domestic-labels.json"), JSON.stringify(domestic));
writeFileSync(join(CACHE_DIR, "tesla-labels.json"), JSON.stringify(tesla));
writeFileSync(join(CACHE_DIR, "byd-labels.json"), JSON.stringify(byd));
writeFileSync(join(CACHE_DIR, "orix-labels.json"), JSON.stringify(orix));
writeFileSync(join(CACHE_DIR, "shinhan-labels.json"), JSON.stringify(shinhan));
writeFileSync(join(CACHE_DIR, "meritz-import-labels.json"), JSON.stringify(meritzImport));

console.log(
  `라벨 덤프 완료: 국산차 ${domestic.length} / 테슬라 ${tesla.length} / BYD ${byd.length} / ` +
    `오릭스 ${orix.length} / 신한 ${shinhan.length} / 메리츠수입 ${meritzImport.length}`,
);
