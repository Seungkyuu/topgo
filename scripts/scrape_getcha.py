"""
겟챠(getcha.kr) 브랜드별 전 차종 가격 추출기 (v7).

─── v3 → v4 ────────────────────────────────────────────────────────────────────
  v3까지는 차종마다 검색 → 자동완성 클릭 → 상세 페이지 텍스트를 정규식으로
  긁는 방식이었다. 실사용 중 모든 차종이 똑같은 가격으로 나오는 버그가
  발견됐고, 원인은 "상세 페이지"라 부른 URL이 사실 그 브랜드 전 차종·전
  등급의 표가 담긴 목록 페이지였던 것 — 검색어와 무관하게 항상 같은 페이지의
  같은 값을 가져오고 있었다.

  v4는 차종별 검색을 버리고, 브랜드 페이지를 브랜드당 1번만 열어 그 안에
  박혀 있는 JSON(schema.org AggregateOffer)을 직접 파싱하는 방식으로
  바꿨다. 하지만 이 JSON에는 "price"(출고가)만 있고 할인 정보가 없었다.

─── v4 → v5: 진짜 필요한 데이터는 다른 곳에 있었다 ────────────────────────────────
  사업 규칙: 최종가는 프로모션 할인가 우선, 없으면 출고가. 그런데 출고가만
  가져와선 이 규칙을 못 지킨다. 같은 페이지를 더 뒤져보니 "initialPrices"라는
  또 다른 JSON 조각에 등급별 discount(할인액)·discountRate(할인율)까지
  정확히 들어있었다(화면의 "딜러 최대 제공 혜택" 열이 이 값이다). v5는 이
  JSON을 쓴다 — 등급마다 price(출고가)·discount(할인액)를 같이 얻어서
  finalPrice = discount > 0 ? price - discount : price 로 계산한다.

  로그인도, 검색도, 자동완성 클릭도 필요 없다 — 페이지 하나 열고 이미 있는
  JSON을 꺼내는 것뿐이라 이전 버전들보다 훨씬 안정적이다.

─── v5 → v6: 국산차·EV만이 아니라 수입차도 겟챠 기준 ──────────────────────────────
  사업 규칙 확정: 수입차도 캐피탈사 엑셀 자체 가격이 아니라 겟챠 할인가를
  "차량가" 계산 입력값으로 쓴다 — 즉 국산차·테슬라·BYD 5개 브랜드만으로는
  부족하고, 오릭스·신한·메리츠 수입차 카탈로그에 걸친 20개+ 브랜드가 전부
  필요하다. v6은 겟챠 홈의 "전체 브랜드" 버튼을 스크립트가 직접 눌러서 찾으려
  했지만, 실제로 돌려보니 홈 화면에 원래 고정으로 보이던 7개 아이콘(테슬라·
  BMW·벤츠·아우디·제네시스·현대·기아)만 계속 나왔다 — 버튼 클릭이 실제
  목록을 펼치지 못하고 있다는 뜻.

─── v6 → v7: 클릭 대신 브랜드ID를 직접 순회 ─────────────────────────────────────
  버튼 클릭에 의존하는 대신, 이미 아는 브랜드ID들(2, 23, 36, 64, 73 등)이
  전부 작은 정수라는 점에 착안해 /discount-price/{id} 를 1부터 순서대로 직접
  열어보는 방식으로 바꿨다(discover_brands_by_probe). id가 유효하면
  initialPrices의 brandId가 그 id와 일치하고 modelsGroup이 채워져 있으므로,
  존재하지 않는 id(홈으로 리다이렉트되거나 빈 페이지)는 자동으로 걸러진다.
  브랜드 이름은 JSON에 없어서 페이지 <title> 태그에서 추출한다.

─── 사용법 ────────────────────────────────────────────────────────────────────

1) 준비 (이미 하셨으면 생략):
     python -m pip install playwright
     python -m playwright install chromium

2) 실행:
     python scrape_getcha.py

   먼저 브랜드ID를 1부터 순서대로 열어보면서 실제 존재하는 브랜드를 전부
   찾고(몇 개를 찾았는지 화면에 표시됨), 그 다음 브랜드마다 페이지 하나씩
   열어서(눈으로 보고 싶으면 --headed) 데이터를 뽑는다. id 순회 구간이
   넓어서(기본 1~150) 전체 실행에 10분 안팎 걸릴 수 있다. 결과는
   getcha-offers.json에 저장된다 — 브랜드의 모든 차종·등급마다
   price(출고가)·discount(할인액)·discountRate(할인율)·finalPrice(최종가,
   할인 있으면 할인가·없으면 출고가)가 들어있다.
   우리 카탈로그 매칭은 Claude에게 이 파일을 보내면 처리한다.

     python scrape_getcha.py --headed          # 화면 보면서
     python scrape_getcha.py --fallback-only   # id 순회 없이 기본 5개만
     python scrape_getcha.py --max-id 200      # id 순회 범위를 넓게(기본 150)

─── 주의 ──────────────────────────────────────────────────────────────────────
  · 겟챠가 페이지 구조를 바꾸면(Next.js 빌드가 바뀌면) __next_f.push 안의
    JSON 위치나 필드명이 달라질 수 있다. 그럴 땐 getcha-offers.json이
    비어있거나 브랜드 탐색이 0개로 나오는데, 그러면
    debug/brand-discovery-failed.html(브랜드 탐색 실패 시) 또는 실패한
    브랜드의 debug/<브랜드>.html을 Claude에게 다시 보내주면 된다.
  · <title> 텍스트에서 브랜드명을 자동으로 잘라내는데, 사이트 title 형식이
    예상과 다르면(예: "포르쉐" 대신 "포르쉐 신차 할인가 비교") 이상한 이름이
    나올 수 있다 — 화면에 찍히는 발견 목록을 보고 이상하면 알려주면 된다.
"""

import json
import re
import sys
import time
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
except ImportError:
    print("pip install playwright 후 playwright install chromium 실행")
    sys.exit(1)

BASE_URL = "https://web.getcha.kr"
SLEEP_SECONDS = 2.0
DEBUG_DIR = Path("debug")

# 수동으로 확인해둔 값(자동 탐색이 실패할 경우의 최소 백업, 그리고 탐색된
# 이름과 다르게 표기하고 싶을 때 덮어쓰는 용도). 정상 실행되면
# discover_brands_by_probe()가 찾아낸 전체 브랜드 목록으로 덮어써진다.
FALLBACK_BRAND_IDS: dict[str, int] = {
    "현대": 36,
    "기아": 2,
    "제네시스": 23,
    "테슬라": 64,
    "BYD": 73,
}

PUSH_BLOCK_RE = re.compile(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)</script>')


INITIAL_PRICES_MARKER = "initialPrices"  # raw는 아직 이스케이프된 상태라 따옴표 없이 검색


def extract_initial_prices(html: str, brand_id: int) -> dict | None:
    """페이지 HTML에서 initialPrices JSON(등급별 price+discount 포함)을 찾아 파싱한다."""
    for raw in PUSH_BLOCK_RE.findall(html):
        if INITIAL_PRICES_MARKER not in raw:
            continue
        try:
            # 이 조각 자체가 JSON 문자열 리터럴이라 한 번 더 디코드해야
            # 실제 텍스트가 나온다 (\" → ", \\ → \ 등).
            decoded = json.loads('"' + raw + '"')
        except (json.JSONDecodeError, ValueError):
            continue
        # RSC 스트리밍 포맷이라 앞에 "29:" 같은 청크 번호가 붙어있다.
        m = re.match(r"^\d+:(.*)$", decoded, re.DOTALL)
        payload = m.group(1) if m else decoded
        try:
            data = json.loads(payload)
        except json.JSONDecodeError:
            continue
        # data == ["$","$L2a",null,{"initialPrices":{...}}] 형태 — 재귀적으로 찾는다
        found = _find_initial_prices(data)
        if found and found.get("brandId") == brand_id:
            return found
    return None


def _find_initial_prices(node):
    if isinstance(node, dict):
        if "initialPrices" in node:
            return node["initialPrices"]
        for v in node.values():
            found = _find_initial_prices(v)
            if found:
                return found
    elif isinstance(node, list):
        for v in node:
            found = _find_initial_prices(v)
            if found:
                return found
    return None


def extract_brand_logos(html: str) -> dict[str, str]:
    """페이지 HTML(어느 브랜드 페이지든 공용 네비게이션에 있음)에서
    브랜드명→로고 URL 목록(domesticBrands/incomeBrands)을 찾아 반환한다.
    """
    for raw in PUSH_BLOCK_RE.findall(html):
        if "domesticBrands" not in raw:
            continue
        try:
            decoded = json.loads('"' + raw + '"')
        except (json.JSONDecodeError, ValueError):
            continue
        m = re.match(r"^\d+:(.*)$", decoded, re.DOTALL)
        payload = m.group(1) if m else decoded
        try:
            data = json.loads(payload)
        except json.JSONDecodeError:
            continue
        found = _find_brands_block(data)
        if not found:
            continue
        result: dict[str, str] = {}
        for group in ("domesticBrands", "incomeBrands"):
            for item in found.get(group, []):
                name = item.get("brand")
                logo = item.get("logoTrimmed") or item.get("logoUrl")
                if name and logo:
                    result[name] = logo
        if result:
            return result
    return {}


def _find_brands_block(node):
    if isinstance(node, dict):
        if "domesticBrands" in node:
            return node
        for v in node.values():
            found = _find_brands_block(v)
            if found:
                return found
    elif isinstance(node, list):
        for v in node:
            found = _find_brands_block(v)
            if found:
                return found
    return None


TITLE_SUFFIX_RE = re.compile(r"\s*[|\-–]\s*겟챠.*$", re.IGNORECASE)


def brand_name_from_title(page) -> str | None:
    title = (page.title() or "").strip()
    if not title:
        return None
    title = TITLE_SUFFIX_RE.sub("", title).strip()
    # 흔한 패턴: "현대 할인가 - 겟챠" / "현대 신차 할인 가격 비교" 등에서
    # 앞쪽 첫 토큰(브랜드명)만 뽑는다. 못 자르겠으면 title 전체를 그대로 씀.
    m = re.match(r"^([가-힣A-Za-z0-9]+)", title)
    return m.group(1) if m else title


def discover_brands_by_probe(page, max_id: int) -> dict[str, int]:
    """브랜드ID를 1..max_id까지 직접 열어보며 실제 존재하는 브랜드를 찾는다.

    "전체 브랜드" 버튼 클릭은 실제로 목록을 펼치지 못하는 것으로 확인돼
    (v6 실사용 결과 홈 고정 아이콘 7개만 반환) 이 방식으로 대체했다.
    """
    found: dict[str, int] = {}
    for brand_id in range(1, max_id + 1):
        url = f"{BASE_URL}/discount-price/{brand_id}"
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=8000)
        except PWTimeout:
            continue
        data = extract_initial_prices(page.content(), brand_id)
        if not data or not data.get("modelsGroup"):
            continue
        name = brand_name_from_title(page) or f"브랜드{brand_id}"
        found[name] = brand_id
        print(f"    · id={brand_id}: {name}")
        time.sleep(0.4)
    return found


def dump_debug(page, label: str):
    DEBUG_DIR.mkdir(exist_ok=True)
    safe = re.sub(r"[^\w가-힣]+", "_", label)[:60]
    html_path = DEBUG_DIR / f"{safe}.html"
    png_path = DEBUG_DIR / f"{safe}.png"
    try:
        html_path.write_text(page.content(), encoding="utf-8")
        page.screenshot(path=str(png_path), full_page=True)
        print(f"    ⚠ 디버그 저장: {html_path}, {png_path}")
    except Exception as e:
        print(f"    (디버그 저장 실패: {e})")


def fetch_brand_offers(
    page, brand: str, brand_id: int
) -> tuple[list[dict], dict[str, str], dict[str, str]]:
    """반환: (등급별 가격 offers, {모델명: 차량 이미지 URL}, {브랜드명: 로고 URL})"""
    url = f"{BASE_URL}/discount-price/{brand_id}"
    print(f"→ {brand} ({url})")
    page.goto(url, wait_until="domcontentloaded")
    try:
        page.wait_for_load_state("networkidle", timeout=10000)
    except PWTimeout:
        pass

    html = page.content()
    brand_logos = extract_brand_logos(html)

    data = extract_initial_prices(html, brand_id)
    if not data:
        print("    ✗ initialPrices 데이터를 못 찾음")
        dump_debug(page, brand)
        return [], {}, brand_logos

    models = data.get("modelsGroup", [])
    out = []
    images: dict[str, str] = {}
    for m in models:
        model_name = m.get("model")
        # 이미지는 모델 단위(등급 공통). ?format=auto 쿼리는 떼고 저장.
        img = m.get("imageUrl")
        if model_name and img:
            images[model_name] = img.split("?")[0]
        for grade in (m.get("groups") or {}).get("grades", []):
            price = grade.get("price")
            discount = grade.get("discount") or 0
            if price is None:
                continue
            final_price = price - discount if discount > 0 else price
            out.append(
                {
                    "brand": brand,
                    "model": model_name,
                    "grade": grade.get("grade"),
                    "price": price,
                    "discount": discount,
                    "discountRate": grade.get("discountRate") or 0,
                    "finalPrice": final_price,
                }
            )
    print(
        f"    ✓ {len(out)}개 등급 확보 (모델 {len(models)}종, 이미지 {len(images)}개, "
        f"할인 적용 {sum(1 for o in out if o['discount'] > 0)}건)"
    )
    return out, images, brand_logos


def main():
    headed = "--headed" in sys.argv
    only_fallback = "--fallback-only" in sys.argv
    max_id = 150
    if "--max-id" in sys.argv:
        idx = sys.argv.index("--max-id")
        if idx + 1 < len(sys.argv):
            max_id = int(sys.argv[idx + 1])

    all_offers = []
    all_images: dict[str, dict[str, str]] = {}
    brand_logos: dict[str, str] = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not headed)
        page = browser.new_page()

        brand_ids = dict(FALLBACK_BRAND_IDS)
        if not only_fallback:
            print(f"→ 브랜드ID 1~{max_id} 순회 탐색 중... (몇 분 걸릴 수 있음)")
            discovered = discover_brands_by_probe(page, max_id)
            if discovered:
                print(f"    ✓ {len(discovered)}개 브랜드 발견: {', '.join(sorted(discovered))}")
                brand_ids.update(discovered)
            else:
                print("    ✗ 자동 탐색 실패 — 기본 5개 브랜드로만 진행합니다")
                print("      (debug/ 에 저장된 스크린샷을 Claude에게 보내주면 고칠 수 있어요)")
                dump_debug(page, "brand-discovery-failed")

        print(f"\n총 {len(brand_ids)}개 브랜드 수집 시작\n")
        for brand, brand_id in brand_ids.items():
            try:
                offers, images, logos = fetch_brand_offers(page, brand, brand_id)
                all_offers.extend(offers)
                if images:
                    all_images[brand] = images
                if logos and not brand_logos:
                    brand_logos = logos  # 공용 네비게이션 데이터라 한 번만 잡으면 충분
            except Exception as e:
                print(f"    ✗ 오류: {e}")
                dump_debug(page, f"{brand}_error")
            time.sleep(SLEEP_SECONDS)
        browser.close()

    out_path = Path("getcha-offers.json")
    out_path.write_text(json.dumps(all_offers, ensure_ascii=False, indent=2), encoding="utf-8")

    # 차량 이미지·브랜드 로고는 매칭이 필요 없어(모델/브랜드 단위) 앱이
    # 바로 읽는 위치에 저장한다.
    img_path = Path("lib/engine/data/getcha-images.json")
    img_path.parent.mkdir(parents=True, exist_ok=True)
    img_path.write_text(json.dumps(all_images, ensure_ascii=False, indent=2), encoding="utf-8")
    n_imgs = sum(len(v) for v in all_images.values())

    logo_path = Path("lib/engine/data/brand-logos.json")
    logo_path.write_text(json.dumps(brand_logos, ensure_ascii=False, indent=2), encoding="utf-8")

    # 가격 기준일 — 견적서 화면에 "이 가격은 언제 확인됐는지" 표시하는 데 쓴다.
    # match_getcha_prices.py가 real-prices.json을 만드는 것도 보통 이 직후라
    # 스크래핑 시각을 "가격 기준일"로 써도 실질적으로 같은 날짜다.
    meta_path = Path("lib/engine/data/getcha-updated-at.json")
    meta_path.write_text(
        json.dumps({"date": time.strftime("%Y-%m-%d")}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"\n완료: 총 {len(all_offers)}개 등급 → {out_path}")
    print(f"      차량 이미지 {n_imgs}개({len(all_images)}개 브랜드) → {img_path}")
    print(f"      브랜드 로고 {len(brand_logos)}개 → {logo_path}")
    print(f"      가격 기준일 → {meta_path}")
    print("getcha-offers.json은 Claude에게 보내주시면 카탈로그와 매칭해 반영합니다.")
    print("getcha-images.json·brand-logos.json·getcha-updated-at.json은 그대로 커밋하면 앱에 바로 반영됩니다.")


if __name__ == "__main__":
    main()
