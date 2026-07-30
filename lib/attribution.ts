/**
 * 유입 추적 — 마케팅 링크(?ref=..., ?utm_source=...)로 들어온 방문자를
 * 감지해서 저장해두고, 상담 제출 시 그 정보를 상담 메시지에 실어 보낸다.
 *
 * 백엔드가 없어서 "자동 집계 대시보드"는 못 만든다 — 대신 카톡으로 전달되는
 * 상담 메시지에 유입경로·추천인 코드를 적어서, 어떤 링크가 실제 상담으로
 * 이어졌는지 사람이 보고 확인할 수 있게 하는 게 이 모듈의 전부다.
 *
 * 링크는 대표님이 직접 만들어서 배포한다(예: topgo.kr/?ref=인스타디엠,
 * ?utm_source=instagram&utm_medium=story). 사이트는 감지·기록만 한다 —
 * 고객에게 보여주는 혜택 안내나 추천 링크 생성 UI는 없다(추적 전용).
 *
 * 첫 방문 값(first-touch)을 기본으로 유지하되, ref는 방문마다 최신 값으로
 * 갱신한다 — utm은 "이 사람이 원래 어디서 왔는가"를, ref는 "이번엔 누구의
 * 링크를 타고 왔는가"를 답해야 하는 서로 다른 질문이라 갱신 정책이 다르다.
 */

export interface Attribution {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  ref?: string;
  landingPath?: string;
  capturedAt?: string;
}

const STORAGE_KEY = "topgo-attribution";
const PARAM_KEYS: (keyof Attribution)[] = [
  "utmSource",
  "utmMedium",
  "utmCampaign",
  "utmContent",
  "utmTerm",
  "ref",
];
const QUERY_MAP: Record<string, keyof Attribution> = {
  utm_source: "utmSource",
  utm_medium: "utmMedium",
  utm_campaign: "utmCampaign",
  utm_content: "utmContent",
  utm_term: "utmTerm",
  ref: "ref",
};

function readFromQuery(): Attribution {
  const params = new URLSearchParams(window.location.search);
  const out: Attribution = {};
  for (const [q, key] of Object.entries(QUERY_MAP)) {
    const v = params.get(q);
    if (v) out[key] = v.slice(0, 80); // 악성/과도한 입력 방어용 길이 제한
  }
  return out;
}

function readStored(): Attribution | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Attribution) : null;
  } catch {
    return null;
  }
}

function write(a: Attribution) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(a));
  } catch {
    // 프라이빗 브라우징 등으로 저장 실패해도 페이지 동작엔 지장 없음
  }
}

/** 페이지 로드 시 1회 호출 — URL에 추적 파라미터가 있으면 저장하고,
 *  없으면 기존에 저장된 값을 그대로 돌려준다. */
export function captureAttribution(): Attribution | null {
  if (typeof window === "undefined") return null;

  const fromQuery = readFromQuery();
  const hasNewParams = PARAM_KEYS.some((k) => fromQuery[k]);
  const stored = readStored();

  if (!stored) {
    if (!hasNewParams) return null;
    const attr: Attribution = {
      ...fromQuery,
      landingPath: window.location.pathname,
      capturedAt: new Date().toISOString(),
    };
    write(attr);
    return attr;
  }

  // ref는 방문마다 갱신(이번 방문이 누구 링크를 탔는지가 중요), utm은
  // 최초 유입 값을 유지(이 방문자가 "원래" 어디서 왔는지가 중요).
  if (fromQuery.ref && fromQuery.ref !== stored.ref) {
    const updated = { ...stored, ref: fromQuery.ref };
    write(updated);
    return updated;
  }
  return stored;
}

/** 상담 메시지에 붙일 한글 라벨 블록. 값이 하나도 없으면 빈 문자열. */
export function formatAttributionForMessage(a: Attribution | null): string {
  if (!a) return "";
  const lines: string[] = [];
  if (a.ref) lines.push(`추천인 코드: ${a.ref}`);
  const utm = [a.utmSource, a.utmMedium, a.utmCampaign].filter(Boolean).join(" / ");
  if (utm) lines.push(`유입경로: ${utm}`);
  return lines.join("\n");
}
