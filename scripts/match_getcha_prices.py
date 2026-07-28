"""
getcha-offers.json(브랜드별 전 등급 출고가+할인가) ↔ 우리 카탈로그(국산차·
테슬라·BYD) 라벨을 매칭해 lib/engine/data/real-prices.json을 만든다.

가격 우선순위(사업 규칙): 프로모션 할인이 있으면 그 할인가, 없으면 출고가.
getcha-offers.json의 각 항목은 이미 finalPrice(=discount>0 ? price-discount
: price)로 계산되어 있으므로, 이 스크립트는 항상 finalPrice만 쓴다.

사전 준비: node scripts/dump_catalog_labels.mjs 를 먼저 실행해서
scripts/.cache/{domestic,tesla,byd}-labels.json 을 만들어둬야 한다.
"""

import json
import re
from pathlib import Path

from vehicle_taxonomy import (
    domestic_brand,
    getcha_domestic_model_groups,
    strip_domestic_decor as strip_decor,
)

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "scripts" / ".cache"
OFFERS = json.loads((ROOT / "getcha-offers.json").read_text(encoding="utf-8"))
DOMESTIC_LABELS = json.loads((CACHE / "domestic-labels.json").read_text(encoding="utf-8"))
TESLA_LABELS = json.loads((CACHE / "tesla-labels.json").read_text(encoding="utf-8"))
BYD_LABELS = json.loads((CACHE / "byd-labels.json").read_text(encoding="utf-8"))


def offers_for(brand: str, model: str) -> list[dict]:
    # finalPrice 0/None은 겟챠 쪽 데이터 결측 — 후보에서 아예 제외
    return [
        o for o in OFFERS
        if o["brand"] == brand and o["model"] == model and o.get("finalPrice", 0) > 0
    ]


def model_groups(brand: str) -> list[str]:
    return getcha_domestic_model_groups(OFFERS, brand)


TOKEN_RE = re.compile(r"[0-9]+\.[0-9]+|[0-9]+인승|[0-9]+인치|[a-zA-Z]+|[가-힣]+")


def tokens(text: str) -> set[str]:
    return {t.lower() for t in TOKEN_RE.findall(text)}


def fmt(o: dict) -> str:
    tag = f"{o['discount']:,}원 할인" if o.get("discount", 0) > 0 else "할인 없음"
    return f"{o['brand']} {o['model']} {o['grade']} — 출고가 {o['price']:,}원 ({tag}) → 최종 {o['finalPrice']:,}원"


def match_domestic(label: str) -> tuple[dict | None, str]:
    brand = domestic_brand(label)
    clean = strip_decor(label)
    is_hybrid = bool(re.search(r"hev|하이브리드", clean, re.IGNORECASE))
    is_ev = bool(re.search(r"\bev\b|일렉트릭", clean, re.IGNORECASE))
    is_diesel = bool(re.search(r"디젤|diesel", clean, re.IGNORECASE))

    groups = model_groups(brand)
    best_group = None

    # EV: "일렉트리파이드 {model}" 같은 별도 EV 전용 그룹이 있으면 그걸 우선
    if is_ev:
        for g in groups:
            core = g.replace("일렉트리파이드 ", "").replace(" 일렉트릭", "")
            if core and core in clean and ("일렉트리파이드" in g or "일렉트릭" in g):
                best_group = g
                break

    if best_group is None:
        for g in groups:
            if g in clean:
                if is_hybrid and (g + " 하이브리드") in groups:
                    best_group = g + " 하이브리드"
                elif "하이브리드" not in g and "일렉트리파이드" not in g and " 일렉트릭" not in g:
                    best_group = g
                break
    if best_group is None:
        for g in groups:
            if g.replace(" 하이브리드", "") in clean:
                best_group = g
                break
    if best_group is None:
        return None, "no-group"

    candidates = offers_for(brand, best_group)
    if not candidates:
        return None, "empty-group"

    # 디젤 라벨인데 그 그룹에 디젤 등급이 아예 없으면(겟챠에 현재 판매 안 함)
    # 엉뚱한 연료로 가격을 배정하느니 매칭 포기
    if is_diesel and not any("디젤" in o["grade"] for o in candidates):
        return None, "diesel-unavailable"

    label_tokens = tokens(clean)
    scored = [(len(label_tokens & tokens(o["grade"])), o["finalPrice"], o) for o in candidates]
    scored.sort(key=lambda x: (-x[0], x[1]))
    best_score = scored[0][0]
    if best_score >= 1:
        return scored[0][2], "high"
    # 토큰 겹침이 하나도 없으면, 후보가 많을 때(=세부 트림을 구분 못 하고
    # 찍는 것) 오배정 위험이 크므로 후보가 2개 이하일 때만 조심스럽게 채택
    if len(candidates) <= 2:
        return scored[0][2], "low(후보 2개 이하라 채택)"
    return None, f"low-ambiguous({len(candidates)}개 후보, 구분 불가)"


TESLA_ALIASES = {
    "모델3 rwd": ("모델 3", "RWD"),
    "모델3 롱레인지": ("모델 3", "프리미엄 롱레인지 RWD"),
    "model 3 rwd": ("모델 3", "RWD"),
    "model 3 long range": ("모델 3", "프리미엄 롱레인지 RWD"),
    "model 3 performance": ("모델 3", "퍼포먼스 AWD"),
    "모델y rwd": ("모델 Y", "프리미엄 RWD"),
    "모델y 롱레인지": ("모델 Y", "프리미엄 롱레인지 AWD"),
    "모델y 롱레인지 20인치": ("모델 Y", "프리미엄 롱레인지 AWD"),
    "모델y 롱레인지 19인치": ("모델 Y", "프리미엄 롱레인지 AWD"),
    "모델y 퍼포먼스": ("모델 Y", "L AWD"),  # 겟챠엔 별도 "퍼포먼스" 등급이 없어 최상위 L AWD로 근사
    "model y rwd": ("모델 Y", "프리미엄 RWD"),
    "model y long range": ("모델 Y", "프리미엄 롱레인지 AWD"),
    "model y l awd": ("모델 Y", "L AWD"),
}


def match_tesla(label: str) -> tuple[dict | None, str]:
    clean = re.sub(r"[♣<>()]|프로모션|특가|보조금|지원금|\d{2}\.\d{2}|1-1", "", label).strip()
    clean = re.sub(r"\s+", " ", clean).lower()
    key = clean
    if key not in TESLA_ALIASES:
        # "Model Y Launch" 같이 별칭 테이블에 없는 것 — 매칭 안 함
        return None, "no-alias"
    model, grade = TESLA_ALIASES[key]
    for o in offers_for("테슬라", model):
        if o["grade"] == grade:
            return o, "alias-exact"
    return None, "alias-grade-not-found"


# BYD 아토3는 두 "플러스" 등급이 배터리 용량만 다르고 이름이 같아 grade
# 텍스트로 구분이 안 된다 — 가격 오름차순으로 [기본형, Plus] 순서라고 가정.
BYD_ALIASES = {
    "byd atto 3": ("아토 3", 0),
    "byd atto 3 plus": ("아토 3", 1),
    "byd 씨라이언 7": ("씨라이언 7", "베이스"),
    "byd 씨라이언 7 plus": ("씨라이언 7", "플러스"),
    "byd seal": ("씰", "베이스"),
    "byd seal plus": ("씰", "플러스"),
    "byd seal dynamic awd": ("씰", "다이나믹 AWD"),
    "byd dolphin": ("돌핀", "베이스"),
    "byd dolphin active": ("돌핀", "액티브"),
}


def match_byd(label: str) -> tuple[dict | None, str]:
    key = label.strip().lower()
    if key not in BYD_ALIASES:
        return None, "no-alias"
    model, grade_or_index = BYD_ALIASES[key]
    if isinstance(grade_or_index, int):
        same_grade = sorted(
            (o for o in offers_for("BYD", model) if o["grade"] == "플러스"),
            key=lambda o: o["finalPrice"],
        )
        if len(same_grade) > grade_or_index:
            return same_grade[grade_or_index], "alias-index"
        return None, "alias-index-not-found"
    for o in offers_for("BYD", model):
        if o["grade"] == grade_or_index:
            return o, "alias-exact"
    return None, "alias-grade-not-found"


def main():
    result = {}
    report_lines = []

    for label in DOMESTIC_LABELS:
        offer, confidence = match_domestic(label)
        if offer:
            result[label] = offer["finalPrice"]
            report_lines.append(f"[국산][{confidence}] {label}  ->  {fmt(offer)}")
        else:
            report_lines.append(f"[국산][미매칭:{confidence}] {label}")

    for label in TESLA_LABELS:
        offer, confidence = match_tesla(label)
        if offer:
            result[label] = offer["finalPrice"]
            report_lines.append(f"[테슬라][{confidence}] {label}  ->  {fmt(offer)}")
        else:
            report_lines.append(f"[테슬라][미매칭:{confidence}] {label}")

    for label in BYD_LABELS:
        offer, confidence = match_byd(label)
        if offer:
            result[label] = offer["finalPrice"]
            report_lines.append(f"[BYD][{confidence}] {label}  ->  {fmt(offer)}")
        else:
            report_lines.append(f"[BYD][미매칭:{confidence}] {label}")

    Path("match-report.txt").write_text("\n".join(report_lines), encoding="utf-8")
    out_dir = ROOT / "lib" / "engine" / "data"
    out_dir.mkdir(exist_ok=True)
    (out_dir / "real-prices.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    total = len(DOMESTIC_LABELS) + len(TESLA_LABELS) + len(BYD_LABELS)
    print(f"매칭 {len(result)}/{total} — match-report.txt, lib/engine/data/real-prices.json 저장됨")


if __name__ == "__main__":
    main()
