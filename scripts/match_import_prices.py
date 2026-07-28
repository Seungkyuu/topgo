"""
getcha-offers.json ↔ 수입차 카탈로그(오릭스/신한/메리츠-수입) 라벨 매칭.

─── 1차 시도(코드 겹침 2개 이상 + 모델 평균 예상가)에서 발견한 문제 ──────────────
  "AMG G 63"(G-클래스)가 "AMG GT"(완전히 다른 2인승 스포츠카) 모델로 잘못
  매칭되는 사고가 나왔다. 원인: 모델을 특정하는 코드 목록에 "AMG"처럼
  여러 모델에 공통으로 붙는 수식어가 섞여 있었던 것. 이후 브랜드별로
  겟챠의 "model" 필드를 전수 조사한 결과, 벤츠·랜드로버·렉서스·포르쉐·
  롤스로이스·벤틀리·재규어·캐딜락·토요타·폭스바겐·마세라티·미니·지프·
  페라리·KGM·르노코리아·로터스 등 대부분의 수입 브랜드가 겟챠에서 숫자가
  아니라 이름/글자(G-클래스, 카이엔, LX, 그란투리스모...)로 모델을 구분하고
  있어서, 숫자 코드만으로 모델을 특정하는 방식 자체가 구조적으로 위험하다는
  걸 확인했다(제네시스·볼보·푸조만 전부 숫자 기반이라 안전).

  그래서 이 스크립트는 "모델 특정"과 "등급 특정"에 쓰는 코드 종류를
  분리한다:
    · 모델 특정(MODEL_CODE_RE): 숫자가 섞인 코드만 사용(320d, X5, 911, A3
      등). "AMG" 같은 수식어는 여러 모델에 걸쳐 나오므로 모델 특정에서는
      아예 제외한다 — 틀리게 맞히느니 미매칭으로 남긴다.
    · 등급(트림) 특정(TRIM_CODE_RE): 모델이 이미 정확히 하나로 좁혀진
      다음에만 AMG/GTS/quattro 같은 수식어까지 포함해서 세부 등급을 고른다.
  순수 이름 기반 브랜드(벤츠·랜드로버 등)는 `vehicle_taxonomy.py`의
  `CLASS_ALIAS_RESOLVERS`로 겟챠 모델 버킷에 직접 연결한다.

⚠ 브랜드 분리·코드/단어 토큰화·클래스 별칭 규칙은 전부 `vehicle_taxonomy.py`
  로 옮겨졌다(UI 모델 그룹핑 스크립트인 `build_model_groups.py`와 공유하기
  위해서). 이 파일은 그 유틸을 갖고 "겟챠 가격에 연결하기"만 담당한다.

사전 준비: node scripts/dump_catalog_labels.mjs
"""

import json
import re
from pathlib import Path

from vehicle_taxonomy import (
    benz_class_space_fix,
    CLASS_ALIAS_RESOLVERS,
    despace_fix,
    match_tokens,
    model_codes,
    split_meritz,
    split_orix,
    split_shinhan,
    trim_codes,
    word_tokens,
)

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "scripts" / ".cache"
OFFERS = json.loads((ROOT / "getcha-offers.json").read_text(encoding="utf-8"))

ORIX_LABELS = json.loads((CACHE / "orix-labels.json").read_text(encoding="utf-8"))
SHINHAN_LABELS = json.loads((CACHE / "shinhan-labels.json").read_text(encoding="utf-8"))
MERITZ_LABELS = json.loads((CACHE / "meritz-import-labels.json").read_text(encoding="utf-8"))

GETCHA_BRANDS = {o["brand"] for o in OFFERS}

OFFERS_BY_BRAND: dict[str, list[dict]] = {}
for o in OFFERS:
    if o.get("finalPrice", 0) > 0:
        OFFERS_BY_BRAND.setdefault(o["brand"], []).append(o)


def fmt(o: dict) -> str:
    tag = f"{o['discount']:,}원 할인" if o.get("discount", 0) > 0 else "할인 없음"
    return f"{o['brand']} {o['model']} {o['grade']} — 출고가 {o['price']:,}원 ({tag}) → 최종 {o['finalPrice']:,}원"


def match_label(label: str, split_fn) -> tuple[dict | None, str]:
    brand, rest = split_fn(label)
    if brand is None:
        return None, "brand-not-recognized"
    if brand not in GETCHA_BRANDS:
        return None, f"brand-no-getcha-data({brand})"
    if brand == "포르쉐":
        # xDrive/eDrive 등 브랜드 고유 붙임표기가 있는 BMW/벤츠와 달리
        # 포르쉐(신한 소스)만 원본 스크랩 단계에서 띄어쓰기가 통째로
        # 빠졌으므로 여기서만 좁혀서 적용한다 — 전 브랜드에 걸면 "xDrive"
        # 같은 진짜 붙여 써야 하는 코드까지 갈라져 버린다.
        rest = despace_fix(rest)
    candidates = OFFERS_BY_BRAND.get(brand, [])
    if not candidates:
        return None, f"empty-brand({brand})"

    # 클래스 별칭: 911/718처럼 숫자로 이미 구분되는 모델은 그대로 아래
    # 숫자 코드 경로로 보내고(resolver가 None 반환), 카이엔/타이칸처럼
    # 겟챠가 순수 이름으로만 묶는 모델만 여기서 직접 연결한다 — 그래서
    # None이면 실패 처리하지 않고 숫자 코드 경로로 "폴백"한다.
    class_resolver = CLASS_ALIAS_RESOLVERS.get(brand)
    resolved_model = class_resolver(rest) if class_resolver is not None else None
    if resolved_model is not None:
        # 신한 라벨은 "C200"처럼 클래스 접두어+숫자를 붙여 쓰는데 겟챠
        # 등급 텍스트는 "C 200"으로 띄운다 — 클래스가 이미 확정됐으니
        # 트림 코드 비교 전에 미리 띄워서 숫자 코드("200")만 남긴다.
        # 안 띄우면 우리 쪽 코드는 "c200" 통짜, 겟챠 쪽은 "200"이라
        # 절대 안 겹쳐서 전부 core-trim-mismatch로 빠진다(벤츠 전용 표기
        # 문제라 다른 브랜드엔 적용하지 않는다).
        if brand == "벤츠":
            rest = benz_class_space_fix(rest)
        model = resolved_model
        grades = [o for o in candidates if o["model"] == model]
        if not grades:
            return None, f"class-alias-empty({model})"
        return _score_trim(rest, model, grades)

    label_model_codes = model_codes(rest)
    if not label_model_codes:
        return None, "no-model-code-in-label"

    # 1단계: 모델을 숫자 코드로만 특정한다("911", "A3", "GLC300"의 "GLC300").
    # 겟챠 쪽 모델명에 숫자가 없는 브랜드(벤츠 G-클래스, 랜드로버 등)는
    # 여기서 자연스럽게 미매칭 처리된다 — 잘못 맞히는 것보다 안전하다.
    # "3시리즈"처럼 겟챠가 계열 번호 한 자리(3/5/7...)만 쓰는 경우는, 우리
    # 라벨의 "320i" 같은 세 자리 모델 코드가 그 숫자로 시작하면 매치로 본다
    # (자동차 업계 표준 넘버링 — 3XX는 항상 3시리즈, 예외 없음).
    models: dict[str, set[str]] = {}
    for o in candidates:
        models.setdefault(o["model"], set()).update(model_codes(o["model"]))

    label_words = word_tokens(rest)

    def model_hits(mcodes: set[str], model_name: str) -> bool:
        # "iX"/"XM"처럼 계열명 자체에 숫자가 하나도 없는 모델은 mcodes가
        # 항상 빈 집합이라 숫자 코드 매칭 규칙을 절대 통과할 수 없다
        # (과거 버그: iX/XM 계열이 통째로 no-model-match로 빠졌었다).
        # 이런 코드 없는 계열명은 라벨 텍스트에 그 이름이 단어로 그대로
        # 나오는지(iX, XM 등)로 대신 판정한다.
        if not mcodes:
            name_words = word_tokens(model_name)
            return bool(name_words) and name_words <= label_words
        if mcodes <= label_model_codes:
            return True
        if len(mcodes) == 1:
            mc = next(iter(mcodes))
            if mc.isdigit() and len(mc) <= 2:
                for lc in label_model_codes:
                    if re.fullmatch(rf"{mc}\d{{2}}[a-z]*", lc):
                        return True
                    # M퍼포먼스 코드(M135/M240/M340/M440/M850...)는 "m" 뒤
                    # 첫 숫자가 계열 번호다(M135→1시리즈, M240→2시리즈) —
                    # 일반 코드처럼 맨 앞이 계열 숫자로 시작하지 않아서
                    # 위 패턴엔 안 걸린다. 별도로 확인한다.
                    if re.fullmatch(rf"m{mc}\d{{2}}", lc):
                        return True
        return False

    matched_models = [m for m, mcodes in models.items() if model_hits(mcodes, m)]
    if not matched_models:
        return None, "no-model-match"
    if len(matched_models) > 1:
        # "3시리즈"와 "3시리즈 투어링"처럼 계열 번호(3)만으로는 둘 다 걸리는
        # 경우 — 모델명에 붙은 수식어(투어링/그란쿠페/액티브 투어러 등)를
        # 라벨 텍스트와 겹쳐봐서 하나로 좁힌다. 라벨에 그 수식어가 전혀
        # 없으면 수식어 없는 "베이스" 계열을 우선한다(0표만 있는 후보가
        # 유일하면 채택).
        label_words = word_tokens(rest)
        scored_models = []
        for m_name in matched_models:
            m_words = word_tokens(m_name)
            score = len(m_words & label_words) - len(m_words - label_words)
            scored_models.append((score, m_name))
        scored_models.sort(key=lambda x: -x[0])
        best = scored_models[0][0]
        top_models = [m_name for s, m_name in scored_models if s == best]
        if len(top_models) != 1:
            return None, f"model-ambiguous({len(matched_models)})"
        matched_models = top_models
    model = matched_models[0]
    grades = [o for o in candidates if o["model"] == model]
    return _score_trim(rest, model, grades)


# 2~3단계(등급/트림 코어 코드 확정 + 스코어링)는 모델을 어떤 방식으로
# 정했든(숫자 코드 기반이든 클래스 별칭 기반이든) 동일하게 재사용된다.
def _score_trim(rest: str, model: str, grades: list[dict]) -> tuple[dict | None, str]:
    # 2단계: 트림 코드 중 "핵심 코드"(파워트레인을 가리키는 숫자+글자 조합,
    # 예: 530e/40d/50e/M50i)는 전부 일치해야 한다. P1/P2/xDrive/quattro
    # 같은 패키지·구동방식 표시는 여러 등급에 공통으로 붙어서 구분력이
    # 없으므로 "핵심 코드"에서 제외한다 — 예전 버전에서 X5 50e가 40i로
    # 잘못 매칭된 사고(P1-0·xDrive만 겹쳤을 뿐 파워트레인 코드는 다름)를
    # 겪은 뒤 추가한 안전장치다.
    # v8/v12/v6: 벤틀리처럼 카탈로그엔 엔진 배열이 트림명에 붙어있는데
    # (Bentayga "V8" Atelier Edition) 겟챠 등급 텍스트엔 그게 아예 없는
    # 브랜드가 있다 — 지금 라인업이 사실상 그 엔진 하나뿐이라 겟챠가 굳이
    # 안 적는 것으로 보인다. 필수 코드로 요구하면 전부 core-trim-mismatch로
    # 빠지므로 일반 수식어 취급.
    # 4matic: 벤츠 구동방식 배지도 xDrive/quattro와 같은 처지다 — 우리
    # 라벨엔 거의 항상 붙어있는데, 겟챠는 그 등급이 사실상 4matic
    # 하나뿐인 경우(마이바흐 GLS600 등) 등급 텍스트에서 통째로 생략한다.
    # ⚠ tfsi/tdi/tsi는 절대 여기 넣으면 안 된다 — xDrive/quattro/4matic과
    # 달리 이건 구동방식이 아니라 연료(휘발유 vs 경유) 표시라 실제로 다른
    # 등급·가격을 가리킨다. 예전엔 여기 포함돼 있어서 아우디 "A5 40 TDI"가
    # "A5 40 TFSI"(휘발유)로 잘못 매칭되는 사고가 있었다 — 발견 즉시 제거.
    GENERIC_TRIM = {
        "xdrive", "quattro", "콰트로", "hse", "bev", "phev",
        "v8", "v12", "v6", "4matic",
    }
    PACKAGE_RE = re.compile(r"^p\d(-\d)?$")

    def core_codes(text: str) -> set[str]:
        cs = trim_codes(text)
        return {c for c in cs if c not in GENERIC_TRIM and not PACKAGE_RE.fullmatch(c)}

    # i4/i5/i7/iX 같은 전기차 계열은 라벨에 "i5 eDrive40 (P1)"처럼 계열
    # 이름(i5) 자체가 등급 텍스트 앞에 붙어있다(내연기관은 "320i"처럼
    # 계열 번호가 트림 코드에 녹아있어 따로 안 붙는 것과 다르다). i5는
    # 이미 모델 단계에서 확정됐으니, 등급 텍스트에 "i5"라는 글자가 다시
    # 나올 거라 기대하면 안 된다 — 모델 확정에 쓴 코드는 트림 핵심 코드
    # 비교에서 뺀다.
    label_core = core_codes(rest) - model_codes(model)
    # 캐딜락 리릭/에스컬레이드, 벤틀리, 롤스로이스처럼 트림 자체가 파워트레인
    # 숫자 코드 없이 순수 한글/영문 수식어로만 구분되는 브랜드는(예: "스포츠",
    # "프리미엄 럭셔리 플래티넘", "아뜰리에 에디션") label_core가 항상
    # 비어서 전부 no-core-trim-code로 빠졌다. 숫자 코드가 아예 없을 때만
    # 단어 토큰(word_tokens)을 대신 "필수 조건"으로 쓴다 — 숫자 코드가 하나라도
    # 있는 브랜드(BMW/벤츠 등)는 여전히 기존 방식 그대로라 안전장치가 안 풀린다.
    label_core_words: set[str] = set()
    if not label_core:
        label_core_words = word_tokens(rest) - word_tokens(model)
        # 라벨에 모델명 말고는 남는 게 하나도 없어도(예: "Audi S e-tron
        # GT" — 계열 이름 자체가 사실상 등급명까지 겸함) 실패시키지 않는다
        # — 빈 집합은 "필수 조건 없음"으로 취급돼 모든 등급이 3단계
        # 스코어링 후보가 되고, 후보가 여럿에 가격까지 다르면 아래
        # trim-ambiguous가 여전히 걸러준다.

    # 3단계: 트림 스코어링. 코드 겹침 개수만 세면 "530e"와 "530e M 스포츠
    # 프로"가 서로 다른 실제 등급(가격도 다름)인데도 둘 다 {530e, p1}만
    # 겹쳐서 동점이 났다. 라벨에 없는 수식어(M 스포츠/프로/한정판 색상 등)가
    # 오퍼 쪽에 더 붙어있으면 그만큼 감점해서, "라벨과 가장 가깝게 일치하는"
    # 쪽이 유일하게 이기도록 한다.
    label_tokens = match_tokens(rest)
    scored = []
    for o in grades:
        g_core = core_codes(o["grade"])
        required_ok = (
            label_core <= g_core
            if label_core
            else label_core_words <= word_tokens(o["grade"])
        )
        if required_ok:
            g_tokens = match_tokens(o["grade"])
            score = len(g_tokens & label_tokens) - len(g_tokens - label_tokens)
            scored.append((score, o))
    if not scored:
        return None, "core-trim-mismatch"
    scored.sort(key=lambda x: -x[0])
    best_score = scored[0][0]
    top = [o for s, o in scored if s == best_score]
    prices = {o["finalPrice"] for o in top}
    if len(prices) > 1:
        return None, f"trim-ambiguous(동점 {len(top)}개, 가격 다름)"
    return top[0], f"exact-trim({best_score})"


def main():
    result = {}
    offer_keys = {}
    report_lines = []
    stats = {}

    for source_name, labels, split_fn in [
        ("오릭스", ORIX_LABELS, split_orix),
        ("신한", SHINHAN_LABELS, split_shinhan),
        ("메리츠수입", MERITZ_LABELS, split_meritz),
    ]:
        exact = 0
        for label in labels:
            offer, confidence = match_label(label, split_fn)
            if offer:
                result[label] = offer["finalPrice"]
                # "브랜드|모델|등급"을 같은 실차 식별자로 쓴다 — 오릭스·신한·
                # 메리츠 세 카탈로그가 라벨 표기는 서로 다르게 써도 같은
                # 겟챠 등급에 매칭됐다면 사실상 같은 실제 차라는 뜻이라,
                # vehicle-index.ts가 이 키로 소스 간 병합에 쓴다("수입차가
                # 캐피탈 한 곳에서만 잡히는" 문제의 원인 중 하나).
                offer_keys[label] = f"{offer['brand']}|{offer['model']}|{offer['grade']}"
                exact += 1
                report_lines.append(f"[{source_name}][정확:{confidence}] {label}  ->  {fmt(offer)}")
            else:
                report_lines.append(f"[{source_name}][미매칭:{confidence}] {label}")
        stats[source_name] = (exact, 0, len(labels))

    Path("match-report-import.txt").write_text("\n".join(report_lines), encoding="utf-8")
    out_dir = ROOT / "lib" / "engine" / "data"
    out_dir.mkdir(exist_ok=True)
    (out_dir / "real-prices-import.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (out_dir / "import-offer-key.json").write_text(
        json.dumps(offer_keys, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print("매칭 결과 (정확 / 예상 / 전체):")
    total_e = total_est = total_n = 0
    for source_name, (e, est, n) in stats.items():
        print(f"  {source_name}: {e} / {est} / {n}")
        total_e += e
        total_est += est
        total_n += n
    print(f"  합계: {total_e} / {total_est} / {total_n}  (매칭률 {round((total_e+total_est)/total_n*100)}%)")
    print("match-report-import.txt, lib/engine/data/real-prices-import.json, "
          "lib/engine/data/import-offer-key.json 저장됨")


if __name__ == "__main__":
    main()
