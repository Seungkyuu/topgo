"""
차량 선택 UI용 "모델 그룹" 생성 — 트림 하나하나(`IndexedVehicle`)가 아니라
같은 모델의 트림들을 한데 묶을 수 있도록, 전 소스의 전 라벨에 대해
"이 트림이 어느 모델 그룹에 속하는가"를 계산해 lib/engine/data/
model-groups.json에 저장한다.

⚠ 겟챠 매칭 스크립트(match_import_prices.py/match_getcha_prices.py)와
  이유가 다르다 — 이건 겟챠 가격과 무관하게, 우리 카탈로그 자체의 트림들을
  그룹핑하는 것이라 겟챠에 없는(단종) 모델도 전부 그룹이 생겨야 한다.
  그래서 vehicle_taxonomy.py의 클래스 별칭 리졸버들은 "겟챠 버킷명"을
  반환하지만, 여기서는 그 반환값을 그대로 "그룹 이름"으로 재사용한다
  (겟챠에 실제로 그 버킷이 있는지는 상관하지 않는다).

각 소스의 (brand, rawLabel) 도출 규칙은 lib/engine/vehicle-index.ts의
buildVehicleIndex()가 각 add() 호출에 넘기는 값과 정확히 일치해야 한다
— 그래야 런타임에 model-groups.json을 그 rawLabel로 조회했을 때 제대로
찾아진다. 이 스크립트가 각 소스 JSON을 직접 읽어 그 로직을 그대로
재현한다(원본 JSON은 절대 수정하지 않는다 — 파생 산출물만 새로 만든다).

사전 준비: 없음 — 이 스크립트는 원본 카탈로그 JSON을 직접 읽는다.
"""

import json
import re
from pathlib import Path

from vehicle_taxonomy import (
    classify_group,
    domestic_base_model,
    domestic_brand,
    split_meritz,
)

ROOT = Path(__file__).resolve().parent.parent
LIB = ROOT / "lib" / "engine"


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def dict_items(json_obj: dict) -> list[tuple[str, dict]]:
    return [(k, v) for k, v in json_obj.items() if isinstance(v, dict)]


# ─── 소스별 (brand, rawLabel) 도출 — vehicle-index.ts의 add() 호출과 1:1 대응 ────

def orix_pairs() -> list[tuple[str, str]]:
    data = load(LIB / "orix" / "data" / "vehicles.json")
    out = []
    for key, _ in dict_items(data):
        brand = "테슬라" if re.match(r"model", key, re.IGNORECASE) else "벤츠"
        out.append((brand, key))
    return out


def shinhan_lease_pairs() -> list[tuple[str, str]]:
    data = load(LIB / "shinhan" / "data" / "vehicles.json")
    return [(v["brand"], v["model"]) for _, v in dict_items(data)]


# vehicle-index.ts: 특판 마커 브랜드 제외 + JEEP/도요타 표기를 신한 오토리스와
# 동일하게 정규화(지프/토요타) — 안 하면 그룹핑이 브랜드부터 어긋난다.
_SPECIAL_SALE_BRAND_RE = re.compile(r"^(전기차|선구매\s*전용)")
_RENTAL_BRAND_ALIAS = {"JEEP": "지프", "도요타": "토요타"}


def shinhan_rental_pairs() -> list[tuple[str, str]]:
    data = load(LIB / "shinhan" / "data" / "rental-vehicles.json")
    out = []
    for _, v in dict_items(data):
        brand = v["brand"]
        if _SPECIAL_SALE_BRAND_RE.match(brand):
            continue
        brand = _RENTAL_BRAND_ALIAS.get(brand, brand)
        out.append((brand, v["model"]))
    return out


def meritz_import_pairs() -> list[tuple[str, str]]:
    data = load(LIB / "meritz" / "data" / "vehicles.json")
    out = []
    for key, _ in dict_items(data):
        brand, rest = split_meritz(key)
        if brand is None:
            continue
        out.append((brand, rest))
    return out


_GENESIS_RE = re.compile(r"\b(G70|G80|G90|GV60|GV70|GV80)\b", re.IGNORECASE)


def meritz_domestic_pairs() -> list[tuple[str, str]]:
    data = load(LIB / "meritz-domestic" / "data" / "vehicles.json")
    return [(domestic_brand(key), key) for key, _ in dict_items(data)]


def meritz_rental_domestic_pairs() -> list[tuple[str, str]]:
    data = load(LIB / "meritz-rental-domestic" / "data" / "vehicles.json")
    return [(domestic_brand(key), key) for key, _ in dict_items(data)]


def meritz_tesla_pairs() -> list[tuple[str, str]]:
    data = load(LIB / "meritz-tesla" / "data" / "vehicles.json")
    return [("테슬라", key) for key, _ in dict_items(data)]


def meritz_byd_pairs() -> list[tuple[str, str]]:
    data = load(LIB / "meritz-byd" / "data" / "vehicles.json")
    return [("BYD", key) for key, _ in dict_items(data)]


# ─── 그룹 판별 디스패치 ─────────────────────────────────────────────────────────
# 현대/제네시스(국산)는 "더 뉴"/"신형" 접두어 제거 후 트림 토큰 시작 지점까지를
# 그룹명으로 쓰는 별도 규칙(domestic_base_model)을 쓴다 — classify_group()은
# 수입차 클래스 별칭/숫자코드 판별만 다룬다.
def group_for(brand: str, raw_label: str) -> str:
    if brand in ("현대", "제네시스"):
        return domestic_base_model(raw_label)
    group = classify_group(brand, raw_label)
    return group if group is not None else raw_label


def main():
    sources: dict[str, list[tuple[str, str]]] = {
        "orix": orix_pairs(),
        "shinhan-lease": shinhan_lease_pairs(),
        "shinhan-rental": shinhan_rental_pairs(),
        "meritz-import": meritz_import_pairs(),
        "meritz-domestic-lease": meritz_domestic_pairs(),
        "meritz-rental-domestic": meritz_rental_domestic_pairs(),
        "meritz-tesla-lease": meritz_tesla_pairs(),
        "meritz-byd-lease": meritz_byd_pairs(),
    }

    result: dict[str, dict[str, str]] = {}
    stats: dict[str, dict[str, int]] = {}

    for source_id, pairs in sources.items():
        labels: dict[str, str] = {}
        groups_seen: dict[str, set[str]] = {}
        fallback_count = 0
        for brand, raw_label in pairs:
            group = group_for(brand, raw_label)
            labels[raw_label] = group
            groups_seen.setdefault(brand, set()).add(group)
            if group == raw_label:
                fallback_count += 1
        result[source_id] = labels
        stats[source_id] = {
            "labels": len(pairs),
            "groups": sum(len(g) for g in groups_seen.values()),
            "fallback(그룹 못 찾음)": fallback_count,
        }

    out_dir = LIB / "data"
    out_dir.mkdir(exist_ok=True)
    (out_dir / "model-groups.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print("소스별 라벨/그룹 수:")
    for source_id, s in stats.items():
        print(
            f"  {source_id}: 라벨 {s['labels']}개 → 그룹 {s['groups']}개 "
            f"(그룹 미판별 {s['fallback(그룹 못 찾음)']}개, 자기 자신이 그룹)"
        )
    print("lib/engine/data/model-groups.json 저장됨")


if __name__ == "__main__":
    main()
