"""
카탈로그 원본 라벨(오릭스/신한/메리츠수입/메리츠국산/테슬라/BYD)을 다루는
공용 분류 로직 — 원래 `match_import_prices.py`(겟챠 가격 매칭)에만 있던
브랜드 분리·코드 추출·클래스 별칭 규칙을 이 모듈로 옮겨서, 겟챠 매칭
스크립트와 UI용 "모델 그룹" 생성 스크립트(`build_model_groups.py`)가
같은 규칙을 재사용하게 한다.

⚠ 순수 리팩터링 모듈이다 — 이 파일을 고치면 겟챠 매칭 결과도 같이
바뀐다는 뜻이니, 수정 후엔 반드시 `match_import_prices.py`를 재실행해서
매칭 건수가 그대로인지 확인한다.

이 모듈이 제공하는 두 계층:
  1. 저수준 유틸(브랜드 분리, 코드/단어 토큰화, 클래스 별칭) — 원래
     match_import_prices.py에 있던 것 그대로, 겟챠 매칭에 계속 쓰인다.
  2. `classify_group(brand, rest)` — 새로 추가된 고수준 함수. 겟챠 등급
     텍스트와 무관하게 "이 라벨이 같은 모델의 다른 트림들과 어떤 그룹
     키를 공유해야 하는가"만 판단한다(모델 선택 UI 그룹핑용).
"""

import re

# ─── 브랜드 분리 ──────────────────────────────────────────────────────────────

# 메리츠 카탈로그는 "BRANDMODELCODE 사람이 읽는 모델명 트림..." 형태다.
# BMW/Benz/Audi/Tesla/BYD는 원래부터 띄어쓰기가 있고("BMW 320i ..."),
# 그 외 브랜드는 브랜드명+모델코드가 붙어있다("PORSCHE718 718 Cayman").
MERITZ_PLAIN_BRANDS = {
    "BMW": "BMW", "Benz": "벤츠", "Audi": "아우디", "Tesla": "테슬라", "BYD": "BYD",
    # 겟차에 아직 폴스타 상품이 없어(2026-07 기준 스크랩 0건) 지금은 매칭 효과가
    # 없지만, 나중에 겟차가 취급을 시작하면 재스크랩만으로 바로 잡히게 등록해둔다.
    "Polestar": "폴스타",
}
MERITZ_PREFIX_BRANDS = {
    "LANDROVER": "랜드로버",
    "PORSCHE": "포르쉐",
    "JEEP": "지프",
    "MASERATI": "마세라티",
    "MINI": "미니",
    "PEUGEOT": "푸조",
    "VOLVO": "볼보",
    "JAGUAR": "재규어",
    "LEXUS": "렉서스",
    "CADILLAC": "캐딜락",
    "TOYOTA": "토요타",
    "VOLKSWAGEN": "폭스바겐",
    "FORD": "포드",
}
# 정렬: 긴 접두어부터 검사(겹치는 접두어 없지만 안전하게)
MERITZ_PREFIX_SORTED = sorted(MERITZ_PREFIX_BRANDS, key=len, reverse=True)

SHINHAN_DIRECT_BRANDS = {
    "BMW", "아우디", "벤츠", "포르쉐", "랜드로버", "미니", "렉서스", "토요타", "벤틀리",
    "지프", "푸조", "테슬라", "마세라티", "포드", "폭스바겐", "페라리", "로터스",
    "롤스로이스", "캐딜락", "람보르기니", "링컨", "애스턴마틴", "맥라렌", "이네오스",
}


def split_meritz(label: str) -> tuple[str | None, str]:
    parts = label.split(maxsplit=1)
    first = parts[0]
    rest = parts[1] if len(parts) > 1 else ""
    if first in MERITZ_PLAIN_BRANDS:
        return MERITZ_PLAIN_BRANDS[first], rest
    for prefix in MERITZ_PREFIX_SORTED:
        if first.startswith(prefix):
            return MERITZ_PREFIX_BRANDS[prefix], rest
    return None, rest


def split_shinhan(label: str) -> tuple[str | None, str]:
    parts = label.split(maxsplit=1)
    first = parts[0]
    rest = parts[1] if len(parts) > 1 else ""
    if first in SHINHAN_DIRECT_BRANDS:
        return first, rest
    return None, rest


def split_orix(label: str) -> tuple[str | None, str]:
    # 오릭스 카탈로그엔 벤츠/테슬라(Model Y)만 있다 — 브랜드 접두어가 따로 없다.
    return ("테슬라" if label.startswith("Model") else "벤츠"), label


# ─── 코드 추출 ────────────────────────────────────────────────────────────────

# 패키지 코드(P1, P2, P0-0, P1-0)와 소수점 배기량(2.0, 4.0)은 하이픈/점을
# 뺀 채 쪼개면 "0"처럼 의미 없는 노이즈 토큰이 남아 오히려 매칭을 방해한다
# — 하나의 토큰으로 통째로 잡히도록 가장 먼저 시도한다.
_CODE_ALTS = r"[Pp]\d(?:-\d)?|\d+\.\d+|[A-Za-z]*\d+[A-Za-z]*"

# 모델 특정용: 숫자가 섞인 코드만(320d, X5, 911, A3, GLC300...). "AMG" 같은
# 수식어는 여러 모델에 걸쳐 나와서 모델을 잘못 특정시키므로 절대 포함하지 않는다.
MODEL_CODE_RE = re.compile(_CODE_ALTS)

# 등급(트림) 특정용: 모델이 이미 확정된 뒤에만 쓴다. 여기선 AMG/GTS 같은
# 수식어를 포함해도 안전하다(같은 모델 안에서의 등급 구분이니까).
TRIM_CODE_RE = re.compile(
    _CODE_ALTS + r"|GTS|GT3|GT4|JCW|AMG|xDrive|quattro|콰트로|TFSI|TDI|TSI|HSE|BEV|PHEV",
    re.IGNORECASE,
)

# BMW M퍼포먼스 등급(M135i/M235i/M240i/M340i/M440i/M850i...)은 우리
# 카탈로그엔 공식 표기(끝에 i)로 들어있는데, 겟챠는 시리즈/등급명 양쪽 다
# 그 i를 뺀 "M135"/"M240"/"M340"으로만 표기한다 — 그래서 "m135i" ≠
# "m135"로 코드가 어긋나 M135i·M235i·M240i·M340i·M440i·M850i가 전부
# no-model-match로 빠졌었다. "일반 파워트레인 접미사"(320i의 i처럼
# i/d가 실제로 다른 엔진을 가리키는 경우)는 절대 벗기면 안 되므로, "m" +
# 숫자로 시작하는 코드에 한해서만 끝의 i를 지운다.
_M_PERFORMANCE_I_RE = re.compile(r"^m\d{2,3}i$")
# 일반 가솔린 트림도 브랜드/시리즈에 따라 겟챠가 끝의 i를 붙이거나
# ("320i") 빼기도 한다("120i"를 "120"으로 표기) — 실사용 데이터로 확인한
# 겟챠 쪽 표기 비일관성. d(디젤)는 항상 유지되므로 i만, 순수 숫자+i
# 조합에서만 지운다("320i"→"320", "220i"→"220"). 우리 라벨은 항상 공식
# 표기(i 포함)라 양쪽 다 이 규칙을 통과시키면 동일한 기준으로 비교된다.
_PLAIN_I_RE = re.compile(r"^\d+i$")


def _normalize_code(c: str) -> str:
    if _M_PERFORMANCE_I_RE.fullmatch(c):
        return c[:-1]
    if _PLAIN_I_RE.fullmatch(c):
        return c[:-1]
    return c


# 우리 카탈로그는 "eDrive40"/"xDrive40"처럼 붙여 쓰는데 겟챠는
# "eDrive 40"으로 띄어 쓴다 — 띄어쓰기 차이만으로 코드 하나가 두 토큰으로
# 쪼개져 통째로 매칭에서 빠졌다(i4/i5/i7/iX 전기차 전 트림). 코드를 뽑기
# 전에 이 공백부터 붙인다.
_DRIVE_SPACE_RE = re.compile(r"([exX]Drive)\s+(\d)", re.IGNORECASE)


def _normalize_text(text: str) -> str:
    return _DRIVE_SPACE_RE.sub(r"\1\2", text)


def model_codes(text: str) -> set[str]:
    text = _normalize_text(text)
    return {_normalize_code(c.lower()) for c in MODEL_CODE_RE.findall(text)}


def ordered_model_codes(text: str) -> list[str]:
    """model_codes()와 같은 코드 집합을 라벨에 등장한 순서 그대로 반환한다
    (그룹 키를 고를 때 "첫 번째로 나오는 모델 코드"가 필요해서 집합 대신
    순서가 있는 리스트가 필요하다)."""
    text = _normalize_text(text)
    seen: list[str] = []
    for c in MODEL_CODE_RE.findall(text):
        norm = _normalize_code(c.lower())
        if norm not in seen:
            seen.append(norm)
    return seen


def trim_codes(text: str) -> set[str]:
    text = _normalize_text(text)
    return {_normalize_code(c.lower()) for c in TRIM_CODE_RE.findall(text)}


# ─── 단어 토큰화 ──────────────────────────────────────────────────────────────

# 코드(숫자 섞인 토큰)만으로는 "530e"와 "530e M 스포츠 프로"를 구분할 수
# 없다 — 둘 다 코드로는 {530e, p1}뿐이라 동점이 나고, 그 동점 후보들이
# 서로 가격이 다르면 매칭을 포기(trim-ambiguous)해왔다. 실사용 데이터를
# 까보니 이게 미매칭의 가장 큰 원인이었다(BMW만 40개 가까이). 그래서
# "M 스포츠"/"프로"/"투어링" 같은 등급 수식어도 코드와 동등한 토큰으로
# 취급해 겹치지 않는 쪽에 감점을 주는 방식으로 바꾼다 — 우리 라벨에 없는
# 수식어가 붙은 오퍼(예: 리미티드 에디션, 색상 한정판)는 자동으로 밀려난다.
WORD_TOKEN_RE = re.compile(r"[A-Za-z]+|[가-힣]+")

# 영/한 표기가 갈리는 대표적인 등급 수식어를 하나의 토큰으로 합친다.
# (vehicle-image.ts의 TOKEN_SYNONYMS와 같은 패턴 — 못 찾은 단어는
# 원래 형태 그대로 두므로 매핑을 빠뜨려도 안전하게 동작한다.)
QUALIFIER_SYNONYMS: dict[str, str] = {
    "sport": "스포츠", "스포츠": "스포츠",
    "pro": "프로", "프로": "프로",
    "touring": "투어링", "투어링": "투어링",
    "coupe": "쿠페", "쿠페": "쿠페",
    "active": "액티브", "액티브": "액티브",
    "tourer": "투어러", "투어러": "투어러",
    "convertible": "컨버터블", "컨버터블": "컨버터블",
    "cabriolet": "카브리올레", "카브리올레": "카브리올레",
    "sedan": "세단", "세단": "세단",
    "wagon": "왜건", "estate": "왜건", "왜건": "왜건",
    "luxury": "럭셔리", "럭셔리": "럭셔리",
    "dynamic": "다이나믹", "다이나믹": "다이나믹",
    "premium": "프리미엄", "프리미엄": "프리미엄",
    "edition": "에디션", "에디션": "에디션",
    "limited": "리미티드", "리미티드": "리미티드",
    "autobiography": "ab", "ab": "ab",
    "landmark": "랜드마크", "랜드마크": "랜드마크",
    "tempest": "템페스트", "템페스트": "템페스트",
    "boxster": "박스터", "boxtser": "박스터", "박스터": "박스터",
    "cayman": "카이맨", "카이맨": "카이맨",
    "special": "스페셜", "스페셜": "스페셜",
    "exclusive": "익스클루시브", "익스클루시브": "익스클루시브",
    "individual": "인디비주얼", "인디비주얼": "인디비주얼",
    "base": "베이스", "베이스": "베이스",
    "classic": "클래식", "클래식": "클래식",
    "first": "퍼스트", "퍼스트": "퍼스트",
    "gran": "그란", "그란": "그란",
    "hatch": "해치", "hatchback": "해치", "해치": "해치",
    # 모델명 자체가 영/한으로 갈리는 경우(계열은 확정됐지만 라벨 본문에
    # 영문 모델명이 다시 등장해서 label_core_words에 남는 케이스) — i5
    # eDrive40 때처럼 숫자 코드가 아니라 순수 이름이라 model_codes() 뺄셈이
    # 안 먹혀서 별도로 동의어 등록이 필요하다.
    "lyriq": "리릭", "리릭": "리릭",
    "escalade": "에스컬레이드", "에스컬레이드": "에스컬레이드",
    "bentayga": "벤테이가", "벤테이가": "벤테이가",
    "continental": "컨티넨탈", "컨티넨탈": "컨티넨탈",
    "flying": "플라잉", "플라잉": "플라잉",
    "spur": "스퍼", "스퍼": "스퍼",
    "cullinan": "컬리넌", "컬리넌": "컬리넌",
    "ghost": "고스트", "고스트": "고스트",
    "phantom": "팬텀", "팬텀": "팬텀",
    "spectre": "스펙터", "스펙터": "스펙터",
    "eletre": "엘레트레", "엘레트레": "엘레트레",
    "emeya": "에메야", "에메야": "에메야",
    "emira": "에미라", "에미라": "에미라",
    "gladiator": "글래디에이터", "글래디에이터": "글래디에이터",
    "wrangler": "랭글러", "랭글러": "랭글러",
    "renegade": "레니게이드", "레니게이드": "레니게이드",
    "avenger": "어벤저", "어벤저": "어벤저",
    "ranger": "레인저", "레인저": "레인저",
    "mustang": "머스탱", "머스탱": "머스탱",
    "bronco": "브롱코", "브롱코": "브롱코",
    "expedition": "익스페디션", "익스페디션": "익스페디션",
    "explorer": "익스플로러", "익스플로러": "익스플로러",
    "alphard": "알파드", "알파드": "알파드",
    "camry": "캠리", "캠리": "캠리",
    "crown": "크라운", "크라운": "크라운",
    "prius": "프리우스", "프리우스": "프리우스",
    "highlander": "하이랜더", "하이랜더": "하이랜더",
    "sienna": "시에나", "시에나": "시에나",
    "atlas": "아틀라스", "아틀라스": "아틀라스",
    "jetta": "제타", "제타": "제타",
    "touareg": "투아렉", "투아렉": "투아렉",
    "tiguan": "티구안", "티구안": "티구안",
    "golf": "골프", "골프": "골프",
    "atelier": "아뜰리에", "아뜰리에": "아뜰리에",
    "azure": "아주르", "아주르": "아주르",
    "mulliner": "뮬리너", "뮬리너": "뮬리너",
    "speed": "스피드", "스피드": "스피드",
    "black": "블랙", "블랙": "블랙",
    "badge": "뱃지", "뱃지": "뱃지",
    "allure": "알뤼르", "알뤼르": "알뤼르",
    "model": "모델", "모델": "모델",
    "long": "롱", "롱": "롱",
    "range": "레인지", "레인지": "레인지",
    "performance": "퍼포먼스", "퍼포먼스": "퍼포먼스",
    "plaid": "플래드", "플래드": "플래드",
    "standard": "스탠다드", "스탠다드": "스탠다드",
    "tron": "트론", "트론": "트론",
}

# 코드 정규식에 이미 잡히는 순수 알파벳 코드(GTS, AMG, xDrive 등)까지
# 단어 토큰으로 중복 집계하면 스코어가 왜곡되니 제외한다.
_ALREADY_CODE_WORDS = {"gts", "gt3", "gt4", "jck", "jcw", "amg", "xdrive", "quattro", "tfsi", "tdi", "tsi", "hse", "bev", "phev"}

# 영문은 "Gran Coupe"처럼 띄어써서 자연히 두 토큰으로 갈라지는데, 겟챠의
# 모델 그룹명은 같은 말을 "그란쿠페"로 붙여 쓴다 — 붙은 채로 토큰화하면
# 라벨 쪽의 {그란, 쿠페}와 절대 안 겹쳐서 "Gran Coupe" 계열 전체가
# no-model-match/core-trim-mismatch로 빠졌었다. 토큰화 전에 미리 띄어서
# 맞춘다.
_COMPOUND_SPLIT = [
    ("그란쿠페", "그란 쿠페"),
    ("플라잉스퍼", "플라잉 스퍼"),
    ("블랙뱃지", "블랙 뱃지"),
    ("롱레인지", "롱 레인지"),
]


def word_tokens(text: str) -> set[str]:
    # 코드 정규식에 이미 잡히는 부분(120i, P2, M135, xDrive...)을 먼저
    # 지우고 나서 단어를 뽑는다 — 안 그러면 "120i"의 "i", "(P2)"의 "p"처럼
    # 코드에서 떨어져 나온 한 글자 파편이 별개 단어 토큰으로 잡혀 점수를
    # 오염시킨다.
    stripped = TRIM_CODE_RE.sub(" ", _normalize_text(text))
    for compound, spaced in _COMPOUND_SPLIT:
        stripped = stripped.replace(compound, spaced)
    out = set()
    for w in WORD_TOKEN_RE.findall(stripped):
        wl = w.lower()
        if wl in _ALREADY_CODE_WORDS:
            continue
        out.add(QUALIFIER_SYNONYMS.get(wl, wl))
    return out


def match_tokens(text: str) -> set[str]:
    """코드 + 등급 수식어를 한 집합으로 합친 매칭용 토큰."""
    return trim_codes(text) | word_tokens(text)


# ─── 표기 정규화(붙여쓰기 복구) ────────────────────────────────────────────────

# 일부 신한 라벨(포르쉐 등)은 원본 스크랩 단계에서 띄어쓰기가 통째로
# 빠져 "CayenneCoupe가솔린3.0"처럼 이어붙어 있다 — camelCase 경계(소문자→
# 대문자)와 한글⇄영문/숫자 경계에 공백을 되살린다. 이미 정상인 라벨(벤츠/
# BMW 등)에는 이런 전환 지점이 없어 사실상 no-op이라 전 브랜드에 안전하게
# 적용할 수 있다.
_CAMEL_SPLIT_RE = re.compile(r"([a-z])([A-Z])")
_SCRIPT_BOUNDARY_RE = re.compile(r"([a-zA-Z])([가-힣])|([가-힣])([a-zA-Z0-9])")


def despace_fix(text: str) -> str:
    text = _CAMEL_SPLIT_RE.sub(r"\1 \2", text)

    def _script_sub(m: re.Match) -> str:
        if m.group(1):
            return f"{m.group(1)} {m.group(2)}"
        return f"{m.group(3)} {m.group(4)}"

    return _SCRIPT_BOUNDARY_RE.sub(_script_sub, text)


# ─── 클래스 별칭 테이블(겟챠 모델 버킷명 기준) ──────────────────────────────────
# 벤츠·랜드로버·포르쉐·미니·지프·마세라티 등 대부분의 수입 브랜드는 겟챠가
# 모델을 숫자가 아니라 "X-클래스"/"카이엔"/"컨트리맨" 같은 순수 이름으로
# 묶는다 — 그래서 숫자 코드 기반 1단계 모델 매칭(model_hits)이 원천적으로
# 통과할 수 없고, 전부 no-model-match/no-model-code-in-label로 빠졌다.
# 여기서는 우리 라벨 텍스트의 클래스 접두어(A/C/E/S/GLC/CLE/AMG GT...)를
# 정규식으로 뽑아 겟챠의 정확한 모델 그룹명으로 직접 연결한다.
#
# ⚠ 이 리졸버들의 반환값은 "겟챠 모델 버킷명"이다 — 겟챠 매칭(match_import_
# prices.py)엔 그대로 쓰지만, UI 그룹핑(classify_group)은 겟챠에 없는
# 모델(단종 등)도 그룹핑해야 하므로 이 반환값을 "사람이 읽는 그룹 이름"으로
# 그대로 재사용하되 값이 None이어도(겟챠 버킷이 없어도) 실패시키지 않는다.
#
# 순서가 중요하다: "GLC"가 "C"보다, "AMG GT"가 "AMG G"(G-클래스)보다 먼저
# 검사돼야 짧은 접두어가 긴 접두어를 가로채지 않는다.
def _benz_class_alias(rest: str) -> str | None:
    low = rest.lower()
    is_maybach = "maybach" in low or "마이바흐" in rest
    if is_maybach and "eqs" in low:
        return "EQS SUV"
    if is_maybach:
        return "마이바흐"
    if re.search(r"\bgt\b", low) and "amg" in low and not re.search(r"\bgl[a-z]\b", low):
        return "AMG GT"
    if re.search(r"\bg\s?580\b", low):
        return "Electric G-클래스"
    # EQE/EQS의 "SUV" 표기 순서가 소스마다 다르다 — 신한은 "EQE350 4MATIC
    # SUV"(숫자 뒤), 메리츠는 "EQE SUV 500 4MATIC"(숫자 앞)이라 SUV와
    # 숫자의 상대 위치로 정규식을 걸면 절반은 놓친다. 순서 무관하게
    # "eqe"와 "suv"가 둘 다 있는지만 본다.
    if re.search(r"\beqe", low):
        if "suv" in low:
            return "EQE SUV"
        if re.search(r"\d", low):
            return "EQE"
    if re.search(r"\beqs", low):
        if "suv" in low:
            return "EQS SUV"
        if re.search(r"\d", low):
            return "EQS"
    # 신한 라벨은 "CLA250"처럼 클래스 접두어와 숫자를 붙여 쓴다 — 뒤에
    # \b를 걸면 숫자로 이어지는 지점에서 경계가 안 생겨 매치가 안 되므로
    # (\w는 숫자도 포함) 앞쪽 경계만 확인하고 뒤는 열어둔다.
    ordered = [
        (r"\beqa\s?\d", "EQA"),
        (r"\beqb\s?\d", "EQB"),
        (r"\beqc\s?\d", "EQC"),  # 겟챠엔 없음(단종) — UI 그룹핑 목적으로만 유효
        (r"\bcla\s?\d", "CLA-클래스"),
        (r"\bcle\s?\d", "CLE-클래스"),
        (r"\bcls\s?\d", "CLS-클래스"),  # 겟챠엔 없음(CLE로 단종·대체) — UI 그룹핑 목적으로만 유효
        (r"\bgla\s?\d", "GLA-클래스"),
        (r"\bglb\s?\d", "GLB-클래스"),
        (r"\bglc\s?\d", "GLC-클래스"),
        (r"\bgle\s?\d", "GLE-클래스"),
        (r"\bgls\s?\d", "GLS-클래스"),
        (r"\bsl\s?\d", "SL-클래스"),
        (r"\bg\s?\d", "G-클래스"),
        (r"\ba\s?\d", "A-클래스"),
        (r"\bc\s?\d", "C-클래스"),
        (r"\be\s?\d", "E-클래스"),
        (r"\bs\s?\d", "S-클래스"),
    ]
    for pat, model in ordered:
        if re.search(pat, low):
            return model
    return None


# 랜드로버는 텍스트 자체는 깨끗하다("Defender 110 D250 S", "Range Rover
# Sport 3.0 D300 HSE") — 다만 겟챠 모델 그룹이 숫자가 아니라 순서가
# 뒤섞인 다어절 이름이라(디스커버리/디스커버리 스포츠/레인지로버/레인지로버
# 스포츠·벨라·이보크) 벤츠처럼 정규식 접두어 하나로는 못 뽑는다 — "Range
# Rover"가 들어가는 걸 먼저 걸러내고 그 안에서 Sport/Velar/Evoque
# 수식어로 다시 좁히는 순서가 중요하다(안 그러면 Sport가 그냥
# "레인지로버"로 먼저 잡혀버림).
def _landrover_class_alias(rest: str) -> str | None:
    low = rest.lower()
    if "range rover" in low or "레인지로버" in rest:
        if "sport" in low or "스포츠" in rest:
            return "레인지로버 스포츠"
        if "velar" in low or "벨라" in rest:
            return "레인지로버 벨라"
        if "evoque" in low or "이보크" in rest:
            return "레인지로버 이보크"
        return "레인지로버"
    if "discovery" in low or "디스커버리" in rest:
        if "sport" in low or "스포츠" in rest:
            return "디스커버리 스포츠"
        return "디스커버리"
    if "defender" in low or "디펜더" in rest:
        return "디펜더"
    return None


# 911/718(박스터/카이맨)은 이미 숫자 코드로 잘 걸리니 여기선 손 안 대고
# None을 돌려 숫자 코드 경로로 흘려보낸다 — 카이엔/파나메라/타이칸/마칸처럼
# 순수 이름인 것만 가로챈다.
def _porsche_class_alias(rest: str) -> str | None:
    low = rest.lower()
    is_electric = "electric" in low or "일렉트릭" in rest
    is_coupe = "coupe" in low or "쿠페" in rest
    if "cayenne" in low or "카이엔" in rest:
        if is_coupe and is_electric:
            return "카이엔 쿠페 일렉트릭"
        if is_coupe:
            return "카이엔 쿠페"
        if is_electric:
            return "카이엔 일렉트릭"
        return "카이엔"
    if "macan" in low or "마칸" in rest:
        if is_electric:
            return "마칸 일렉트릭"
        return "마칸"  # 겟챠 매칭 목적으론 실패 처리했지만(단종), UI 그룹핑은 여전히 유효
    if "panamera" in low or "파나메라" in rest:
        return "파나메라"
    if "taycan" in low or "타이칸" in rest:
        return "타이칸"
    return None


# 미니는 "MINIElectricSEClassic"처럼 포르쉐와 같은 붙임 문제도 있고,
# 메리츠 라벨은 "Hatch"라는 차체명 자체를 빼고 "3 Door"/"5 Door"로만
# 표기해서 겟챠의 "3도어 해치"/"5도어 해치"와 또 다르게 갈린다.
def _mini_class_alias(rest: str) -> str | None:
    r = despace_fix(rest)
    low = r.lower()
    if "clubman" in low:
        return "클럽맨"  # 겟챠 매칭 목적으론 실패 처리했지만(단종), UI 그룹핑은 여전히 유효
    if "countryman" in low or "컨트리맨" in r:
        if "electric" in low or "일렉트릭" in r:
            return "일렉트릭 컨트리맨"
        return "컨트리맨"
    if "aceman" in low or "에이스맨" in r:
        return "에이스맨"
    if "convertible" in low or "컨버터블" in r:
        return "컨버터블"
    if "3도어" in r or re.search(r"\b3\s*door", low):
        return "3도어 해치"
    if "5도어" in r or re.search(r"\b5\s*door", low):
        return "5도어 해치"
    if "hatch" in low:
        return "해치"
    if "electric" in low or "일렉트릭" in r:
        return "일렉트릭 쿠퍼"
    return None


# 지프: "Grand Cherokee L"/"Grand Cherokee ... 4xe"/"Grand Cherokee"(베이스)를
# 순서대로 좁혀야 한다 — L을 먼저 안 걸면 "Grand Cherokee L"이 그냥
# "그랜드 체로키"(베이스)로 잘못 잡힌다.
def _jeep_class_alias(rest: str) -> str | None:
    low = rest.lower()
    if "grand cherokee" in low or "그랜드 체로키" in rest:
        if re.search(r"\bl\b", low) and "4xe" not in low:
            return "그랜드 체로키 L"
        if "4xe" in low:
            return "그랜드 체로키 4XE"
        return "그랜드 체로키"
    # 순정 "Cherokee"(그랜드 체로키가 아닌 일반 체로키)는 겟챠엔 없지만
    # (단종) UI 그룹핑엔 여전히 필요하다 — "grand cherokee" 체크를 먼저
    # 통과 못 한 경우에만 걸리므로 순서상 안전하다.
    if "cherokee" in low or "체로키" in rest:
        return "체로키"
    if "compass" in low or "컴패스" in rest:
        return "컴패스"
    if "gladiator" in low or "글래디에이터" in rest:
        return "글래디에이터"
    if "wrangler" in low or "랭글러" in rest:
        if "4xe" in low:
            return "랭글러 4XE"
        return "랭글러"
    if "renegade" in low or "레니게이드" in rest:
        return "레니게이드"
    if "avenger" in low or "어벤저" in rest:
        return "어벤저"
    return None


def _toyota_class_alias(rest: str) -> str | None:
    low = rest.lower()
    if re.search(r"\bgr\s?86\b", low):
        return "GR86"
    if "gr supra" in low:
        return "GR수프라"
    if "rav4" in low or re.search(r"\brav\s?4\b", low):
        return "RAV4"
    if "sienna" in low or "시에나" in rest:
        return "시에나"
    if "alphard" in low or "알파드" in rest:
        return "알파드"
    if "avalon" in low or "아발론" in rest:
        return "아발론"
    if "camry" in low or "캠리" in rest:
        return "캠리"
    if "crown" in low or "크라운" in rest:
        return "크라운"
    if "prius" in low or "프리우스" in rest:
        return "프리우스"
    if "highlander" in low or "하이랜더" in rest:
        return "하이랜더"
    return None


def _cadillac_class_alias(rest: str) -> str | None:
    low = rest.lower()
    if "lyriq" in low or "리릭" in rest:
        return "리릭"
    if "escalade" in low or "에스컬레이드" in rest:
        if re.search(r"\biql?\b", low) or "iq" in rest.lower():
            return "에스컬레이드 IQ"
        return "에스컬레이드"
    m = re.search(r"\b(ct\d|xt\d)\b", low)
    if m:
        return m.group(1).upper()  # CT4/CT5/CT6/XT4/XT5/XT6 — 겟챠엔 없지만(단종) UI 그룹핑엔 유효
    return None


def _jaguar_class_alias(rest: str) -> str | None:
    low = rest.lower()
    if "e-pace" in low or "e pace" in low or "epace" in low:
        return "E-Pace"
    if "f-pace" in low or "f pace" in low or "fpace" in low:
        return "F-Pace"
    if "f-type" in low or "f type" in low or "ftype" in low:
        return "F-Type"
    if re.search(r"\bxe\b", low):
        return "XE"
    if re.search(r"\bxf\b", low):
        return "XF"
    if re.search(r"\bxj\b", low):
        return "XJ"  # 겟챠엔 없음(단종) — UI 그룹핑 목적으로만 유효
    return None


def _bentley_class_alias(rest: str) -> str | None:
    low = rest.lower()
    if "bentayga" in low:
        return "벤테이가"
    if "continental" in low:
        return "컨티넨탈"
    if "flying spur" in low:
        return "플라잉스퍼"
    return None


def _rollsroyce_class_alias(rest: str) -> str | None:
    low = rest.lower()
    if "cullinan" in low:
        return "컬리넌"
    if "ghost" in low:
        return "고스트"
    if "phantom" in low:
        return "팬텀"
    if "spectre" in low:
        return "스펙터"
    return None


def _lotus_class_alias(rest: str) -> str | None:
    low = rest.lower()
    if "eletre" in low:
        return "엘레트레"
    if "emeya" in low:
        return "에메야"
    if "emira" in low:
        return "에미라"
    return None


# 폭스바겐: Golf는 GTI 여부로 갈린다.
def _vw_class_alias(rest: str) -> str | None:
    low = rest.lower()
    if "arteon" in low:
        return "아떼온"  # 겟챠엔 없지만(단종) UI 그룹핑엔 유효
    if "passat" in low:
        return "파사트"
    if "atlas" in low:
        return "아틀라스"
    if "t-roc" in low or "troc" in low:
        return "티록"
    if "golf" in low:
        return "골프 GTI" if "gti" in low else "골프"
    if re.search(r"\bid\.?4\b", low):
        return "ID.4"
    if re.search(r"\bid\.?5\b", low):
        return "ID.5"
    if "jetta" in low:
        return "제타"
    if "touareg" in low:
        return "투아렉"
    if "tiguan" in low:
        return "티구안"
    return None


# 링컨: 신한 렌터카는 브랜드를 "링컨"으로 제대로 분류해서 넘긴다(메리츠
# 카탈로그의 "FORD" 오분류와 다름) — 겟챠엔 링컨 자체가 없어 가격 매칭
# 대상은 아니지만 UI 그룹핑은 여전히 필요하다.
def _lincoln_class_alias(rest: str) -> str | None:
    low = rest.lower()
    if "aviator" in low:
        return "에비에이터"
    if "navigator" in low:
        return "내비게이터"
    if "nautilus" in low:
        return "노틸러스"
    if "continental" in low:
        return "컨티넨탈(링컨)"
    if "corsair" in low:
        return "코세어"
    if "mkz" in low:
        return "MKZ"
    if "mkc" in low:
        return "MKC"
    if "mkx" in low:
        return "MKX"
    return None


# 포드: 메리츠 카탈로그에 실제로는 링컨 배지 모델(Aviator/Continental/
# Corsair/MKZ)이 "FORD" 접두로 잘못 묶여 들어와 있다(카탈로그 쪽 브랜드
# 오분류) — 겟챠엔 링컨 자체가 없어 어차피 매칭 안 되지만, UI 그룹핑은
# 이 라벨들도 자기들끼리는 묶여야 하므로 그대로 이름을 돌려준다.
def _ford_class_alias(rest: str) -> str | None:
    low = rest.lower()
    if "ranger" in low:
        return "레인저"
    if "mustang" in low:
        return "머스탱"
    if "bronco" in low:
        return "브롱코"
    if "expedition" in low:
        return "익스페디션"
    if "explorer" in low:
        return "익스플로러"
    if "aviator" in low:
        return "에비에이터"
    if "continental" in low:
        return "컨티넨탈(포드)"
    if "corsair" in low:
        return "코세어"
    if "mkz" in low:
        return "MKZ"
    if "mondeo" in low:
        return "몬데오"
    if "nautilus" in low:
        return "노틸러스"
    if "navigator" in low:
        return "내비게이터"
    return None


# 테슬라: 우리 라벨은 "Model 3"(영문), 겟챠는 "모델 3"(한글) — 숫자 코드
# "3"만으로 걸기엔 Model S/X/Y가 숫자가 없어 절반이 빠지고, S/X/Y 한
# 글자는 다른 코드와 충돌 위험이 있어 계열 전체를 별칭으로 직접 잇는다.
# 메리츠는 "Model_3"처럼 언더스코어 표기라 그것도 흡수한다.
def _tesla_class_alias(rest: str) -> str | None:
    low = rest.lower().replace("_", " ")
    # 메리츠 테슬라 카탈로그는 "Model 3"(영문)와 "모델3"(한글) 라벨이
    # 섞여 있다 — 영문 정규식만 걸면 "모델3"/"모델Y" 계열은 계열 판별
    # 자체가 안 돼 트림 숫자(3, 20, 19...)로 잘못 그룹핑됐다.
    m = re.search(r"\bmodel\s*([3sxy])\b", low)
    if m:
        return {"3": "모델 3", "s": "모델 S", "x": "모델 X", "y": "모델 Y"}[m.group(1)]
    m = re.search(r"모델\s*([3syxSYX])\b", rest)
    if m:
        return {"3": "모델 3", "s": "모델 S", "y": "모델 Y", "x": "모델 X"}[m.group(1).lower()]
    if "cybertruck" in low or "사이버트럭" in rest:
        return "사이버트럭"
    return None


# 폴스타: "POLESTAR 2 STANDARD RANGE..." 처럼 계열 숫자 뒤에 트림 설명이
# 길게 붙는다 — generic 숫자 코드 경로에 맡기면 "STANDARD"/"RANGE"/
# "SINGLE"/"MOTOR" 같은 트림 토큰은 다 걸러지고 계열 숫자 "2"/"4"만 코드로
# 잡혀서 그룹명이 "2"/"4"라는 의미 없는 한 글자가 돼버린다("폴스타 2"가
# 아니라 그냥 "2"로 보이는 사고). 계열 숫자 앞에 "폴스타"를 직접 붙여준다.
def _polestar_class_alias(rest: str) -> str | None:
    m = re.search(r"\bpolestar\s*(\d)\b", rest.lower())
    if m:
        return f"폴스타 {m.group(1)}"
    return None


# 아우디: A3/A5/A6/Q5/Q7 등 대부분은 이미 숫자 코드로 잘 걸리니 여기선
# 손 안 대고(None → 숫자 코드 경로로 폴백) "e-tron GT"만 가로챈다 — 이
# 계열은 숫자가 하나도 없어(RS/S 접두만으로 등급 구분) 숫자 코드 경로가
# 원천적으로 못 찾는다. RS 접두가 없는 쪽은 아우디가 기본 트림을 "S
# e-트론 GT"로 재명명한 것에 대응한다.
# 렉서스: 모델 코드(ES/IS/LS/LM/LX/NX/RC/CT/GX/UX)가 앞에 붙고 뒤에 트림
# 숫자(300h/500 등)가 따라온다 — 숫자만 보고 그룹핑하면 "IS 300"과 "NX
# 300"처럼 완전히 다른 차종이 "300" 하나로 섞여버린다(제네릭 숫자 그룹핑의
# 함정). 앞 2글자 모델 코드를 그룹으로 쓴다.
_LEXUS_MODEL_RE = re.compile(r"\b(ES|GS|IS|LC|LS|LM|LX|NX|RC|RX|CT|GX|UX)\b", re.IGNORECASE)


def _lexus_class_alias(rest: str) -> str | None:
    m = _LEXUS_MODEL_RE.search(rest)
    return m.group(1).upper() if m else None


def _audi_class_alias(rest: str) -> str | None:
    low = rest.lower()
    if "e-tron gt" in low or "etron gt" in low:
        if re.search(r"\brs\b", low):
            return "RS e-트론 GT"
        return "S e-트론 GT"
    # 1세대 순정 e-tron(SUV)은 A6/Q4/Q6/Q8처럼 앞에 모델 코드가 안 붙고
    # "e-tron 50 Qu."처럼 바로 시작한다 — 코드가 없어서 숫자 그룹핑 경로로
    # 새면 배터리 용량("50"/"55")만으로 그룹이 갈려 "50"·"55"라는 의미
    # 없는 이름이 되므로 여기서 먼저 잡는다. A6/Q4/Q6/Q8 e-tron은 그
    # 모델 코드 자체가 이미 숫자를 포함해서 generic 경로로 잘 걸린다.
    if re.match(r"^e-?tron\b", low):
        return "e-tron"
    return None


# BYD는 겟챠 가격 매칭엔 안 쓰지만(match_getcha_prices.py가 국산차와 같은
# 별도 방식으로 처리) UI 그룹핑엔 필요하다 — 모델명이 전부 영문 고유명사라
# 숫자 코드가 없다.
def _byd_class_alias(rest: str) -> str | None:
    low = rest.lower()
    if "atto" in low:
        return "아토 3"
    if "sealion" in low or "씨라이언" in rest:
        return "씨라이언 7"
    if "seal" in low or "씰" in rest:
        return "씰"
    if "dolphin" in low or "돌핀" in rest:
        return "돌핀"
    return None


# 마세라티: Ghibli/Levante/Quattroporte는 겟챠 라인업엔 없지만(단종) UI
# 그룹핑엔 여전히 필요하다. GranCabrio/GranTurismo/Grecale/MC20/MC Pura는
# 현재 판매 중.
def _maserati_class_alias(rest: str) -> str | None:
    low = rest.lower()
    if "ghibli" in low:
        return "기블리"
    # 신한 렌터카는 "Levante"/"Quattroporte"를 "LEV"/"QP"로 줄여 쓴다.
    if "levante" in low or re.search(r"\blev\b", low):
        return "르반떼"
    if "quattroporte" in low or re.search(r"\bqp\b", low):
        return "콰트로포르테"
    if "grancabrio" in low or "gran cabrio" in low:
        return "그란카브리오"
    if "granturismo" in low or "gran turismo" in low:
        return "그란투리스모"
    if "grecale" in low:
        return "그레칼레"
    if "mc20" in low or "mc 20" in low:
        return "MC20"
    if "mc pura" in low or "mcpura" in low.replace(" ", ""):
        return "MC푸라"
    return None


# 혼다: "All New Pilot"/"New Accord"처럼 세대 접두어("All New"/"New")가
# 라벨마다 있다 없다 해서 붙어있으면 같은 모델의 트림끼리도 다른 그룹으로
# 갈라진다 — generic 경로엔 숫자 코드가 없어서(트림 배기량만 숫자) 걸리지도
# 않는다.
def _honda_class_alias(rest: str) -> str | None:
    low = rest.lower()
    if "pilot" in low:
        return "파일럿"
    if "accord" in low:
        return "어코드"
    if "odyssey" in low:
        return "오디세이"
    if "cr-v" in low or "crv" in low:
        return "CR-V"
    return None


def _astonmartin_class_alias(rest: str) -> str | None:
    low = rest.lower()
    if "dbs" in low:
        return "DBS"
    if "dbx" in low:
        return "DBX"
    if "vantage" in low:
        return "밴티지"
    return None


CLASS_ALIAS_RESOLVERS: dict[str, "callable"] = {
    "벤츠": _benz_class_alias,
    "랜드로버": _landrover_class_alias,
    "포르쉐": _porsche_class_alias,
    "마세라티": _maserati_class_alias,
    "아우디": _audi_class_alias,
    "렉서스": _lexus_class_alias,
    "미니": _mini_class_alias,
    "지프": _jeep_class_alias,
    "토요타": _toyota_class_alias,
    "캐딜락": _cadillac_class_alias,
    "재규어": _jaguar_class_alias,
    "벤틀리": _bentley_class_alias,
    "롤스로이스": _rollsroyce_class_alias,
    "로터스": _lotus_class_alias,
    "폭스바겐": _vw_class_alias,
    "포드": _ford_class_alias,
    "링컨": _lincoln_class_alias,
    "테슬라": _tesla_class_alias,
    "폴스타": _polestar_class_alias,
    "BYD": _byd_class_alias,
    "혼다": _honda_class_alias,
    "애스턴마틴": _astonmartin_class_alias,
}

_BENZ_CLASS_SPACE_RE = re.compile(
    r"\b(AMG\s+)?(CLA|CLE|CLS|GLA|GLB|GLC|GLE|GLS|EQA|EQB|EQC|EQE|EQS|SL|A|C|E|S|G)(\d)",
    re.IGNORECASE,
)


def benz_class_space_fix(rest: str) -> str:
    """신한 라벨의 "C200"(붙여쓰기)을 "C 200"(겟챠 표기)으로 정규화."""
    return _BENZ_CLASS_SPACE_RE.sub(r"\1\2 \3", rest)


# ─── UI 그룹핑용 고수준 함수 ───────────────────────────────────────────────────

# BMW는 모델 코드(320i/M240i 등)에 시리즈 번호가 파묻혀 있어서, 겟챠 매칭
# 때처럼 "겟챠가 아는 시리즈 목록과 대조"하지 않고도 그룹 키를 뽑으려면
# 이 패턴들이 필요하다. 다른 숫자 코드 브랜드(아우디/제네시스/볼보/푸조)는
# 모델 코드 자체가 이미 계열명이라 별도 변환이 필요 없다(generic 경로).
# 트레일링 최대 2글자까지 허용("M760Li"의 "li") — M35i/M40i처럼 뒤에 숫자가
# 2자리뿐인 코드는 여기 안 걸린다(계열이 여러 모델에 걸쳐 애매해서 의도적으로
# 미분류로 남긴다: M40i는 X3/X4/Z4에 전부 쓰인다).
_BMW_MPERF_RE = re.compile(r"^m(\d)\d{2}[a-z]{0,2}$")
# 끝 글자는 최대 1개(엔진 접미사 d/e/i)만 허용한다 — 안 그러면 "i3 120Ah"의
# 배터리 용량 표기 "120ah"(끝에 두 글자)가 "1시리즈" 트림 코드로 잘못
# 읽혀서 BMW i3(완전히 다른 구형 EV 해치백)가 1시리즈 그룹에 섞여
# 들어가는 사고가 났다.
_BMW_SERIES_RE = re.compile(r"^(\d)\d{2}[a-z]?$")
# X1~X7/Z4/M2~M8뿐 아니라 iX1/iX2/iX3처럼 두 글자+숫자 한 자리 코드도
# 커버해야 한다("iX2 eDrive20 M Sport"의 "ix2").
_BMW_LETTER_SERIES_RE = re.compile(r"^([a-z]{1,2})(\d)$")
# iX/XM은 숫자가 전혀 없는 순수 이름 계열이라 애초에 model_codes()에 안
# 잡힌다(코드 정규식이 숫자 포함을 요구) — 단어 토큰에서 직접 찾는다.
_BMW_BARE_SERIES = {"ix", "xm"}

# 그룹 키로 쓰기엔 부적절한 코드(패키지 코드, 순수 배기량 소수)는
# generic 숫자-브랜드 그룹핑에서 제외한다.
_PACKAGE_ONLY_RE = re.compile(r"^p\d(-\d)?$")
_DECIMAL_ONLY_RE = re.compile(r"^\d+\.\d+$")


def _bmw_group(rest: str) -> str | None:
    for c in ordered_model_codes(rest):
        m = _BMW_MPERF_RE.fullmatch(c)
        if m:
            return f"{m.group(1)}시리즈"
        m = _BMW_SERIES_RE.fullmatch(c)
        if m:
            return f"{m.group(1)}시리즈"
    for c in ordered_model_codes(rest):
        m = _BMW_LETTER_SERIES_RE.fullmatch(c)
        if m:
            return c.upper()  # X1~X7, Z4, M2~M8, iX1~iX3 등
    words = word_tokens(rest)
    for name in _BMW_BARE_SERIES:
        if name in words:
            return name.upper()  # iX, XM
    return None


def _generic_digit_group(rest: str) -> str | None:
    """아우디/제네시스/볼보/푸조 등: 모델 코드 자체가 곧 계열명이다
    (A4, G80, XC60, 308...) — 라벨에 처음 등장하는, 패키지/순수배기량이
    아닌 코드를 그대로 그룹 키로 쓴다."""
    for c in ordered_model_codes(rest):
        if _PACKAGE_ONLY_RE.fullmatch(c) or _DECIMAL_ONLY_RE.fullmatch(c):
            continue
        return c.upper()
    return None


def classify_group(brand: str, rest: str) -> str | None:
    """수입차 라벨(브랜드 제거된 나머지 텍스트)을 "모델 그룹 키"로 분류한다.
    같은 실제 모델의 트림들은 항상 같은 문자열을 돌려받아야 한다.

    규칙이 없거나 애매하면 None을 돌려준다 — 호출부는 이 경우 라벨 자체를
    그룹 키로 쓰는 폴백(1인 그룹)을 적용해야 한다(안전 우선, 오분류 방지).
    """
    if brand == "포르쉐":
        rest = despace_fix(rest)

    resolver = CLASS_ALIAS_RESOLVERS.get(brand)
    if resolver is not None:
        resolved = resolver(rest)
        if resolved is not None:
            return resolved

    if brand == "BMW":
        return _bmw_group(rest)

    return _generic_digit_group(rest)


# ─── 국산차/테슬라/BYD 베이스 모델명 추출 ───────────────────────────────────────
# match_getcha_prices.py에서 옮겨온 로직 — "더 뉴"/"디 올 뉴"/"신형" 같은
# 마케팅 접두어를 떼어내는 것과, 겟챠 자신의 모델 그룹 목록(model_groups)에
# 대고 라벨이 어떤 그룹에 속하는지 부분 문자열로 판별하는 것 두 가지다.
DOMESTIC_DECOR_RE = re.compile(
    r"더\s*뉴|디\s*올\s*뉴|디\s*뉴|올\s*뉴|신형|\(NX4\)|\(CN7\)|Ⅰ|Ⅱ", re.IGNORECASE
)


def strip_domestic_decor(label: str) -> str:
    return DOMESTIC_DECOR_RE.sub("", label).strip()


_DOMESTIC_TRIM_START_RE = re.compile(
    r"\d+\.\d+|\d+인승|\d+인치|가솔린|디젤|하이브리드|일렉트릭|LPG|HEV|EV\b"
    r"|성능형|항속형|스탠다드|롱레인지|[24]WD\b|AWD\b|RWD\b",
    re.IGNORECASE,
)


def domestic_base_model(label: str) -> str:
    """겟챠 모델 그룹 목록 없이도 쓸 수 있는 자체완결형 폴백 — "더 뉴"류
    접두어를 떼고, 배기량/연료/인승 같은 트림 토큰이 처음 등장하는 지점
    앞까지를 베이스 모델명으로 본다. (참고용 폴백이며, `getcha_domestic_
    group()`이 우선이다 — 그쪽이 실제 겟챠 모델명과 정확히 일치해서 더
    정확하다.)"""
    clean = strip_domestic_decor(label)
    m = _DOMESTIC_TRIM_START_RE.search(clean)
    base = clean[: m.start()] if m else clean
    return base.strip() or clean.strip()


def getcha_domestic_model_groups(offers: list[dict], brand: str) -> list[str]:
    """겟챠 오퍼 목록에서 brand의 모델 그룹명들을 뽑는다(긴 이름 우선 —
    "그랜저" 앞에 "디 올 뉴 그랜저"가 먼저 매치되는 걸 방지)."""
    return sorted({o["model"] for o in offers if o["brand"] == brand}, key=len, reverse=True)


GENESIS_RE = re.compile(r"\b(G70|G80|G90|GV60|GV70|GV80)\b", re.IGNORECASE)


def domestic_brand(label: str) -> str:
    return "제네시스" if GENESIS_RE.search(label) else "현대"
