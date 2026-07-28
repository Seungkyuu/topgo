/**
 * 차량 이미지 조회 — 겟챠 모델 단위 사진(getcha-images.json)을 우리 카탈로그
 * 차량에 연결한다.
 *
 * 가격과 달리 이미지는 장식용(참고 사진)이라 "차를 골랐는데 사진 자리가
 * 비어있는" 게 더 나쁜 경험이다. 그래서 2단계로 폴백한다:
 *   1) 정확: 모델명의 모든 토큰이 우리 라벨에 있음
 *   2) 근사: 정확히 안 맞아도 그 브랜드 안에서 토큰이 제일 많이 겹치는 모델
 *      (score ≥ 1 — 뭐라도 겹치는 게 있어야 한다)
 * 토큰이 하나도 안 겹치면 매칭하지 않는다(undefined) — 예전엔 "그 브랜드
 * 아무 모델 사진이나" 식으로 마지막 폴백을 뒀는데, 그 탓에 "Mercedes-
 * Maybach S580"이 (마이바흐가 한글이라 안 겹쳐서) 엉뚱하게 A-클래스
 * 해치백 사진으로 뜨는 사고가 났다. 브랜드는 맞지만 완전히 다른 차
 * 사진을 보여주는 건 사진이 아예 없는 것보다 나쁘다 — 매칭 안 되면
 * undefined를 반환해 호출부가 브랜드 로고로 자리를 채우게 한다.
 *
 * 데이터: scripts/scrape_getcha.py 가 브랜드 페이지의 model.imageUrl 을
 * { 브랜드: { 모델명: URL } } 로 저장한다.
 */

import imagesJson from "./data/getcha-images.json";

const IMAGES: Record<string, Record<string, string>> = imagesJson;

const TOKEN_RE = /[a-z]*\d+[a-z]*|[가-힣]+|[a-z]+/gi;

/** 카탈로그가 영문으로 쓰지만 겟챠는 한글로 쓰는 서브브랜드/트림명 —
 * 매칭용 토큰 집합에 한글쪽 동의어를 추가해준다. 겟챠 쪽 자체는 이미
 * 한글이라 손댈 필요 없다. */
const TOKEN_SYNONYMS: Record<string, string[]> = {
  maybach: ["마이바흐"],
};

function tokens(s: string): string[] {
  const base = s.toLowerCase().match(TOKEN_RE) ?? [];
  const extra = base.flatMap((t) => TOKEN_SYNONYMS[t] ?? []);
  return extra.length ? [...base, ...extra] : base;
}

/** 브랜드 불문하고 붙는 순수 장식성 한글 접미사 — 영문 카탈로그 라벨엔
 * 절대 나오지 않으니(예: 벤츠 "E-클래스"의 "클래스") 매칭에서 무시한다.
 * 이걸 빼먹으면 해당 접미사가 붙은 모델 전체가 통째로 매칭 실패한다
 * (실제로 벤츠 전 모델이 이 문제로 사진이 하나도 안 붙었었다). */
const DECORATIVE_TOKENS = new Set(["시리즈", "클래스"]);

/** 겟챠 "3시리즈" 같은 계열명에서 계열 숫자 추출 */
function seriesNum(model: string): string | null {
  const m = model.match(/^(\d)\s*시리즈/);
  return m ? m[1] : null;
}

/**
 * modelGroup(scripts/vehicle_taxonomy.py의 classify_group() 결과)은 수입차
 * 라벨을 겟챠와 같은 한글 모델명으로 이미 정규화해둔 값이라("Defender 130
 * ..." → "디펜더"), 카탈로그가 영문 라벨을 쓰는 브랜드(랜드로버·포드 등)에서
 * display 토큰 매칭보다 훨씬 잘 맞는다 — 겟챠 키와 정확히 같은 문자열이면
 * 그 자리에서 확정한다.
 */
export function imageForVehicle(
  brand: string,
  display: string,
  modelGroup?: string,
): string | undefined {
  const brandImages = IMAGES[brand];
  if (modelGroup && brandImages?.[modelGroup]) {
    return brandImages[modelGroup];
  }
  const entries = Object.entries(brandImages ?? {});
  if (entries.length === 0) return undefined;

  const dispTokens = new Set([...tokens(display), ...(modelGroup ? tokens(modelGroup) : [])]);
  const dispList = [...dispTokens];

  let bestExact: { url: string; score: number } | null = null;
  let bestLoose: { url: string; score: number } | null = null;

  for (const [modelName, url] of entries) {
    const series = seriesNum(modelName);
    const mTokens = tokens(modelName).filter((t) => !DECORATIVE_TOKENS.has(t));
    // 점수는 토큰 "글자 수"로 매긴다(개수가 아니라) — "S"(1글자, S-클래스)
    // 같은 흔한 한 글자 코드가 "마이바흐"(4글자) 같은 구체적인 서브브랜드
    // 매칭과 동점으로 묶여 잘못 이기는 걸 막는다(실제로 Maybach가
    // S-클래스 사진으로 잘못 뜨던 사고).
    let score = 0;
    let allMatched = true;
    for (const t of mTokens) {
      let matched: boolean;
      if (series && t === series) {
        // 계열 숫자: 우리 라벨에 320i·M340i 처럼 [글자?]+계열숫자+두자리
        // 코드가 있으면 그 계열로 본다.
        const re = new RegExp(`^[a-z]?${series}\\d\\d`);
        matched = dispList.some((dt) => re.test(dt));
      } else {
        matched = dispTokens.has(t);
      }
      if (matched) score += t.length;
      else allMatched = false;
    }
    if (score === 0) continue;
    if (allMatched && (!bestExact || score > bestExact.score)) {
      bestExact = { url, score };
    }
    if (!bestLoose || score > bestLoose.score) {
      bestLoose = { url, score };
    }
  }
  return bestExact?.url ?? bestLoose?.url;
}
