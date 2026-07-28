"use client";

/**
 * Lee&Kim 고객용 견적 앱 — v3 "차량 우선" 구조.
 *
 *   home ──(차량 선택)──────────────▶ result (상품은 결과 상단 탭)
 *    └──(예산으로 시작)──▶ budget ──▶ result
 *
 * 원칙:
 *   · 금융사명은 비교 결과 화면에서 처음 등장한다 — 그 전엔 브랜드·차명·가격만.
 *   · 계산은 통합 차량 인덱스의 ref(소스 연결)별 정확한 라벨·가격으로.
 *   · 엔진 내부 문구는 고객 언어로 번역해 노출한다.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { lowestCapital, type DealType, type CapitalQuoteRow } from "@/lib/engine/capitals";
import { logoForBrand } from "@/lib/engine/brand-logo";
import {
  buildVehicleIndex,
  buildModelGroups,
  listBrands,
  dealsForIndexed,
  quoteIndexed,
  type IndexedVehicle,
  type ModelGroupSummary,
} from "@/lib/engine/vehicle-index";
import {
  recommendByBudget,
  RECOMMEND_DEFAULTS,
  RECOMMENDABLE_DEALS,
} from "@/lib/engine/recommend";
import { useQuoteSettings } from "./settings-context";
import { useTheme } from "./theme-context";
import getchaUpdatedAt from "@/lib/engine/data/getcha-updated-at.json";
import { quoteMeritzTeslaLease } from "@/lib/engine/meritz-tesla";

const won = (n: number) => n.toLocaleString("ko-KR");
const man = (n: number) => `${Math.round(n / 10_000).toLocaleString("ko-KR")}만원`;

/** 고객 화면엔 캐피탈사 실명을 절대 노출하지 않는다 — 비교 로직(3사 비교 등)은
 *  내부적으로 실명(r.capital)을 그대로 쓰되, 화면에 찍는 자리에서만 이 함수를
 *  거친다. 실제 회사 수(ALL_CAPITALS)와 무관하게 항상 같은 3개 라벨로 매핑돼
 *  있어 제휴사가 늘어나도 새 실명이 그대로 뚫려 나가지 않는다(모르는 이름은
 *  "제휴사"로 안전하게 폴백). */
const CAPITAL_DISPLAY: Record<string, string> = { 오릭스: "A사", 신한카드: "B사", 메리츠: "C사" };
function anonCapital(capital: string): string {
  return CAPITAL_DISPLAY[capital] ?? "제휴사";
}

/** 트림명 끝의 패키지 코드("(P2)", "(P1-0)")를 분리 — 계산 라벨(v.model)은
 *  안 건드리고 표시용으로만 옅게 보여준다(고객에게 의미 없는 내부 코드). */
const PACKAGE_SUFFIX_RE = /\s*\((P\d(?:-\d)?)\)\s*$/i;
function splitTrimLabel(display: string): { main: string; pkg: string | null } {
  const m = display.match(PACKAGE_SUFFIX_RE);
  if (!m) return { main: display, pkg: null };
  return { main: display.slice(0, m.index).trim(), pkg: m[1] };
}

/** 상품 설명 — 정식 상품명이 기본, 쉬운 말은 부제 */
const DEAL_EXPLAIN: Record<DealType, { name: string; desc: string }> = {
  operatingLease: {
    name: "운용리스",
    desc: "만기에 반납·인수·재리스 중 선택할 수 있어요. 초기 부담이 적어요.",
  },
  financeLease: {
    name: "금융리스",
    desc: "만기에 차를 인수해요. 결국 내 차가 되는 방식이에요.",
  },
  longTermRental: {
    name: "장기렌트",
    desc: "차량 관리를 렌트사가 맡아요. 자동차세·보험료는 상담 시 확정돼요.",
  },
};

const DEAL_ORDER: DealType[] = ["operatingLease", "financeLease", "longTermRental"];

/** 상품별 월 납부액을 부르는 정식 명칭 — 리스는 "월 리스료", 렌트는 "월 렌트료".
 *  경쟁사(리스모아·카눈·다나와·겟차) 모두 이 용어를 히어로로 쓴다. */
function monthlyFeeLabel(deal: DealType): string {
  return deal === "longTermRental" ? "월 렌트료" : "월 리스료";
}

/** 엔진 내부 문구 → 고객 언어 */
function customerReason(note?: string): string {
  if (!note) return "이 조건으로는 견적을 낼 수 없어요";
  if (note.includes("미연동") || note.includes("미취급")) return "이 차량을 취급하지 않아요";
  if (note.includes("잔가율") || note.includes("잔가 산정")) return "이 기간은 취급하지 않아요";
  if (note.includes("취급불가")) return "이 차량은 리스로 이용할 수 없어요";
  if (note.includes("100%")) return "보증금·선납금 비율이 너무 높아요";
  return "이 조건으로는 견적을 낼 수 없어요";
}

const POPULAR_QUERIES = ["그랜저", "E 300", "Model Y", "G80", "Dolphin"];
const BUDGET_PRESETS = [500_000, 700_000, 1_000_000, 1_500_000];

const KAKAO_URL = "https://open.kakao.com/o/sQJ56vFi";
const BLOG_URL = "https://blog.naver.com/leenkim_lease_";

const TRUST_STATS: { num: string; unit: string; label: string }[] = [
  { num: "10", unit: "년+", label: "업력" },
  { num: "3,400", unit: "+", label: "누적 계약" },
  { num: "98", unit: "%", label: "고객 만족도" },
  { num: "10", unit: "+", label: "제휴 금융사" },
];

const RENTO_FEATURES: { title: string; desc: string }[] = [
  {
    title: "실시간 최저가 비교",
    desc: "여러 금융사 견적을 한 번에 비교해요. 하루 지난 시세가 아니라 항상 최신 가격 기준이에요.",
  },
  {
    title: "숨김 없는 계산 근거",
    desc: "잔존가치·초기 비용·총 납부액까지 전부 펼쳐서 보여드려요. 눌러야 나오는 작은 글씨는 없어요.",
  },
  {
    title: "전담 컨설턴트 상담",
    desc: "조건이 애매해도 괜찮아요. 오픈카톡으로 편하게 물어보시면 바로 비교해드려요.",
  },
];

const PROMO_CONDITIONS = { termMonths: 48, annualMileageKm: 20000, depositRate: 0.3, prepayment: 0 };
const PROMO_DEAL_TRY_ORDER: DealType[] = ["operatingLease", "financeLease", "longTermRental"];

/** 홈 히어로의 "즉시출고 가능 차량" 카드 — 테슬라 실제 즉시출고 재고
 *  리스트에서 고른 4대. 색상·휠·인테리어·차량가는 고정 재고 사양이라
 *  전달받은 재고표 그대로 쓰고 바꾸지 않는다(허구 아님, 선택 불가).
 *  월 리스료만 그 자리에서 quoteMeritzTeslaLease()로 계산한다
 *  (48개월·주행거리 20,000km·보증금 30% 기준, 하드코딩 아님). */
const INSTANT_DELIVERY_TESLA: {
  model: string;
  group: string;
  trimLabel: string;
  wheel: string;
  color: string;
  interior: string;
  vehiclePrice: number;
}[] = [
  {
    model: "Model 3 Long Range",
    group: "모델 3",
    trimLabel: "Long Range RWD",
    wheel: "18\" Photon Wheels",
    color: "Stealth Grey",
    interior: "Black Premium Interior",
    vehiclePrice: 61_276_000,
  },
  {
    model: "Model 3 RWD",
    group: "모델 3",
    trimLabel: "RWD",
    wheel: "18\" Prismata Wheels",
    color: "Stealth Grey",
    interior: "All Black Interior",
    vehiclePrice: 46_990_000,
  },
  {
    model: "Model 3 Performance",
    group: "모델 3",
    trimLabel: "Performance",
    wheel: "20\" Warp Wheels",
    color: "Stealth Grey",
    interior: "Black Premium Interior",
    vehiclePrice: 69_990_000,
  },
  {
    model: "Model Y RWD",
    group: "모델 Y",
    trimLabel: "Standard Range RWD",
    wheel: "19\" Crossflow Wheels",
    color: "Stealth Grey",
    interior: "All Black Premium Interior",
    vehiclePrice: 49_990_000,
  },
];

/** 랜딩 "인기 모델" — 고정 4개(브랜드+모델그룹). buildModelGroups()/
 *  quoteIndexed()로 그 자리에서 실시간 계산한다. */
const POPULAR_TARGETS: { brand: string; group: string }[] = [
  { brand: "BMW", group: "3시리즈" },
  { brand: "테슬라", group: "모델 Y" },
  { brand: "현대", group: "그랜저" },
  { brand: "제네시스", group: "G80" },
];

type Screen = "landing" | "home" | "budget" | "result" | "quote-doc";

/** 견적번호 — RT-YYMMDD-XXXX (백엔드 없이 표시용으로만 생성, 저장/추적 안 함) */
function makeQuoteNumber(): string {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `RT-${ymd}-${rand}`;
}

// ─── 공용 소품 ────────────────────────────────────────────────────────────────

/**
 * 로고 마크 — 원형 배지 + R 모노그램. 대표님이 공유한 CI 시안(원형 링 +
 * R/U 모노그램, 딥네이비 × 실버 × 청록 포인트, 링 아래 작은 원 디테일)의
 * 구도를 그대로 따르되, 벡터로 다시 그렸다 — 원본은 채팅에 붙여넣기된
 * 이미지라 파일로 못 가져왔고(포토리얼 크롬 렌더는 파비콘 같은 작은
 * 크기에서도 잘 안 뭉개지는 평면 벡터가 실사용에도 더 낫다). 실제
 * 로고 파일을 파일로 첨부해주시면 이 자리에 그대로 교체 가능하다.
 */
function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      className="logo-mark"
    >
      <circle cx="20" cy="19" r="17" stroke="currentColor" strokeWidth="2.25" />
      <path
        d="M15 12.5h6.2a4.6 4.6 0 0 1 0 9.2h-2.6l6 6.3"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M15 12.5v15.5" className="logo-mark-accent" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="20" cy="34.5" r="1.5" fill="currentColor" />
    </svg>
  );
}

function Wordmark() {
  return (
    <p className="brand">
      <LogoMark />
      <span>
        REN<span className="amp">T</span>O
      </span>
    </p>
  );
}

/** 라이트/다크 수동 토글 — 시스템 설정을 따라가지 않고 사용자가 직접 고른다 */
function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}
      title={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}
    >
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );
}

function TopBar({ title }: { title: string }) {
  return (
    <div className="topbar">
      <button type="button" className="back-btn" onClick={() => history.back()} aria-label="뒤로">
        ←
      </button>
      <span className="topbar-title">{title}</span>
      <ThemeToggle />
    </div>
  );
}

// ─── 브랜드 로고 / 차량 사진 ────────────────────────────────────────────────

/**
 * 브랜드 로고 배지. 좁은 목록 행(검색·추천)에서 정체성 표시용 — 겟챠
 * 차량 실사진은 가로로 넓은 컷이라 좁은 정사각 자리에 넣으면 크롭돼
 * 보이므로, 이런 자리엔 로고(정사각 아이콘)를 쓰고 차량 실사진은
 * 공간이 넉넉한 결과 화면 히어로에서만 크게 보여준다.
 */
function BrandLogo({ brand, size = "sm" }: { brand: string; size?: "sm" | "lg" }) {
  const [failed, setFailed] = useState(false);
  const src = logoForBrand(brand);
  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className={`brand-logo brand-logo-${size}`}
        src={src}
        alt={brand}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }
  const label = /^[A-Za-z]/.test(brand) ? brand.slice(0, 3).toUpperCase() : brand.slice(0, 2);
  return (
    <span className={`brand-logo brand-logo-${size} brand-logo-fallback`} aria-hidden="true">
      {label}
    </span>
  );
}

/**
 * 차량 실사진 — 밝은 회색 "포토 스테이지" 안에 넣는다. 겟챠 사진은
 * 투명/흰 배경 컷이라, 페이지 배경이 흰색이면 사진이 페이지에 묻혀버려서
 * 이 스테이지 배경(약간 어두운 회색)이 경계를 만들어준다. 실사진이
 * 아예 없는 브랜드는(핫링크 실패 포함) 빈 자리를 남기지 않고 브랜드
 * 로고를 크게 채운다 — 차를 골랐는데 그 자리가 비어있는 게 제일 나쁜
 * 경험이라, 항상 뭔가는 보이게 한다.
 */
function VehiclePhoto({ brand, src }: { brand: string; src?: string }) {
  const [failed, setFailed] = useState(false);
  const showPhoto = src && !failed;
  return (
    <div className="veh-photo-stage">
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="veh-photo"
          src={src}
          alt={brand}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <BrandLogo brand={brand} size="lg" />
      )}
    </div>
  );
}

// ─── 비교 결과 카드 ──────────────────────────────────────────────────────────

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="row-line">
      <span>{label}</span>
      <i className="leader" aria-hidden="true" />
      <span>{value}</span>
    </div>
  );
}

/**
 * 펼친 행의 상세 — 2단 공개.
 *   기본: 초기 비용 + 총 납부액(대표·사업자가 결정에 쓰는 두 숫자)만.
 *   "계산 근거 자세히": 계약 조건·잔존가치·환산 금리 등 기술적 항목은
 *   눌러야 나온다. 특히 환산 금리는 오해 소지가 커서 기본 노출에서 뺐다.
 */
function RowDetail({
  r,
  deal,
  termMonths,
  annualMileageKm,
  totalPayment,
  onViewDocument,
}: {
  r: CapitalQuoteRow;
  deal: DealType;
  termMonths: number;
  annualMileageKm: number;
  totalPayment: number;
  onViewDocument: () => void;
}) {
  const [showBasis, setShowBasis] = useState(false);
  const deposit = r.deposit ?? 0;
  const prepay = r.prepayment ?? 0;
  const refundNote =
    deposit > 0
      ? "보증금은 만기에 전액 돌려받아요"
      : prepay > 0
        ? "선납금은 돌려받지 않아요"
        : null;

  return (
    <div className="row-detail">
      <Line
        label="초기 비용"
        value={
          r.prepayment !== undefined
            ? `보증금 ${won(deposit)}원 · 선납금 ${won(prepay)}원`
            : `보증금 ${won(deposit)}원`
        }
      />
      {refundNote && <div className="row-sub">{refundNote}</div>}
      <div className="row-line hl">
        <span>총 납부액 ({termMonths}개월)</span>
        <i className="leader" aria-hidden="true" />
        <span>{won(totalPayment)}원</span>
      </div>

      <button type="button" className="doc-btn" onClick={onViewDocument}>
        정식 견적서 보기
      </button>

      <button
        type="button"
        className="basis-toggle"
        aria-expanded={showBasis}
        onClick={() => setShowBasis((v) => !v)}
      >
        계산 근거 {showBasis ? "접기" : "자세히"}
        <span className={`row-caret${showBasis ? " open" : ""}`} aria-hidden="true">⌄</span>
      </button>

      {showBasis && (
        <div className="row-basis">
          <Line
            label="계약 조건"
            value={`${termMonths}개월${deal !== "financeLease" ? ` · 연 ${annualMileageKm / 10000}만km` : ""}`}
          />
          {r.residualValue !== undefined && r.residualRate !== undefined && (
            <>
              <Line
                label={`잔존가치 (${(r.residualRate * 100).toFixed(0)}%)`}
                value={`${won(r.residualValue)}원`}
              />
              <div className="row-sub">
                {deal === "financeLease"
                  ? "만기에 차를 인수할 때 정산하는 금액이에요"
                  : "만기에 반납하면 이 금액은 내지 않아요"}
              </div>
            </>
          )}
          {r.customerRate !== undefined && (
            <>
              <Line label="환산 금리(연)" value={`${(r.customerRate * 100).toFixed(2)}%`} />
              <div className="row-sub">
                금융사마다 계산 방식이 달라, 같은 기준으로 환산한 비교용 금리예요
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function CompareResult({
  rows,
  deal,
  termMonths,
  annualMileageKm,
  onViewDocument,
}: {
  rows: CapitalQuoteRow[];
  deal: DealType;
  termMonths: number;
  annualMileageKm: number;
  onViewDocument: (r: CapitalQuoteRow) => void;
}) {
  const { settings } = useQuoteSettings();

  const visibleRows =
    settings.enabledCapitals.length > 0
      ? rows.filter((r) => settings.enabledCapitals.includes(r.capital))
      : rows;
  const available = visibleRows.filter((r) => r.available);
  const pending = visibleRows.filter((r) => !r.available);
  const best = lowestCapital(visibleRows);
  const savings =
    available.length >= 2
      ? Math.max(...available.map((r) => r.monthlyPayment!)) -
        Math.min(...available.map((r) => r.monthlyPayment!))
      : null;
  const sorted = [...available].sort((a, b) => a.monthlyPayment! - b.monthlyPayment!);

  // 최저가 행은 진입 시 자동 펼침 — "근거를 보여주는 서비스"
  const [expandedKey, setExpandedKey] = useState<string | null>(() =>
    sorted.length > 0 ? `${sorted[0].capital}-${sorted[0].sourceId}` : null,
  );

  const multiSource = available.length >= 2;

  return (
    <div className="card compare-card">
      <div className="compare-header">
        <span className="compare-title">
          {multiSource ? "금융사별 " : ""}
          {monthlyFeeLabel(deal)}
        </span>
        {savings !== null && savings > 0 && (
          <span className="savings-badge">최대 {won(savings)}원 차이</span>
        )}
      </div>
      <div className="trust-badge-row">
        <span className="trust-badge">
          <i className="dot" aria-hidden="true" />
          RENTO가 확인한 차량가 기준
        </span>
      </div>
      {available.length === 1 && (
        <div className="single-src-note">
          이 차량·조건은 현재 <b>{anonCapital(available[0].capital)}</b>에서 견적 가능해요
        </div>
      )}

      {available.length === 0 ? (
        <div className="compare-empty">선택한 조건으로 견적 가능한 금융사가 없어요</div>
      ) : (
        <div className="compare-list">
          {sorted.map((r, i) => {
            const key = `${r.capital}-${r.sourceId}`;
            const isOpen = expandedKey === key;
            const totalPayment = r.monthlyPayment! * termMonths + (r.prepayment ?? 0);
            return (
              <div key={key} className={`compare-item${i > 0 ? " not-first" : ""}`}>
                <button
                  type="button"
                  className={`compare-row${multiSource && best === r.capital ? " best" : ""}`}
                  aria-expanded={isOpen}
                  onClick={() => setExpandedKey(isOpen ? null : key)}
                >
                  <div className="compare-left">
                    <span className="company-name">
                      {anonCapital(r.capital)}
                      {multiSource && best === r.capital && <span className="best-tag">최저</span>}
                    </span>
                    {r.sourceLabel && <span className="src-chip">{r.sourceLabel}</span>}
                  </div>
                  <div className="compare-right">
                    <div className="compare-amt-wrap">
                      <span className="monthly-amt">{won(r.monthlyPayment!)}</span>
                      <span className="monthly-unit">원/월</span>
                    </div>
                    <span className={`row-caret${isOpen ? " open" : ""}`} aria-hidden="true">⌄</span>
                  </div>
                </button>
                {isOpen && (
                  <RowDetail
                    r={r}
                    deal={deal}
                    termMonths={termMonths}
                    annualMileageKm={annualMileageKm}
                    totalPayment={totalPayment}
                    onViewDocument={() => onViewDocument(r)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {pending.length > 0 && (
        <div className="pending-section">
          {pending.map((r) => (
            <div key={`${r.capital}-${r.sourceId}`} className="pending-line">
              <span className="pending-name">{anonCapital(r.capital)}</span>
              <span className="pending-reason">{customerReason(r.note)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 정식 견적서 — 겟차 등 경쟁사가 카톡으로 보내는 포맷을 참고해, 비교
 * 화면에서 고른 한 줄을 인쇄·공유 가능한 문서로 뽑아준다. 계산·저장은
 * 전혀 새로 안 하고 이미 계산된 CapitalQuoteRow를 그대로 표로 옮기는
 * 뷰일 뿐이라 안전하다(서버·DB 없이도 가능). 견적번호는 표시용일 뿐
 * 어디에도 저장·추적되지 않는다.
 */
function QuoteDocument({
  vehicle,
  row,
  rows,
  deal,
  termMonths,
  annualMileageKm,
  onBack,
}: {
  vehicle: IndexedVehicle;
  row: CapitalQuoteRow;
  rows: CapitalQuoteRow[];
  deal: DealType;
  termMonths: number;
  annualMileageKm: number;
  onBack: () => void;
}) {
  const [quoteNumber] = useState(makeQuoteNumber);
  const [shareState, setShareState] = useState<"idle" | "copied">("idle");

  const deposit = row.deposit ?? 0;
  const prepay = row.prepayment ?? 0;
  const totalPayment = row.monthlyPayment! * termMonths + prepay;
  const today = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // 겟차 이런 단일 회사 견적서는 절대 못 넣는 부분 — 비교 근거를 문서에
  // 그대로 남긴다. RENTO 정체성이 "비교해서 골라준 결과"라는 게 여기서
  // 드러나야 한다.
  const compared = [...rows]
    .filter((r) => r.available && typeof r.monthlyPayment === "number")
    .sort((a, b) => a.monthlyPayment! - b.monthlyPayment!);
  const isBest = compared.length > 0 && compared[0] === row;
  const priceDate = (getchaUpdatedAt as { date: string }).date;

  async function handleShare() {
    const summary =
      `[RENTO 견적서 ${quoteNumber}]\n` +
      `${vehicle.brand} ${vehicle.display}\n` +
      `${anonCapital(row.capital)} · ${DEAL_EXPLAIN[deal].name}\n` +
      `${monthlyFeeLabel(deal)} ${won(row.monthlyPayment!)}원 · ${termMonths}개월\n` +
      `보증금 ${won(deposit)}원 · 선납금 ${won(prepay)}원` +
      (compared.length >= 2
        ? `\n${compared.length}개 금융사 비교${isBest ? " 결과 최저가" : ""}`
        : "");
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "RENTO 견적서", text: summary });
        return;
      } catch {
        // 사용자가 공유 취소한 경우 등 — 조용히 무시
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(summary);
      setShareState("copied");
      setTimeout(() => setShareState("idle"), 2000);
    } catch {
      // 클립보드도 안 되면 별도 안내 없이 넘어간다(인쇄 버튼은 항상 동작)
    }
  }

  return (
    <main className="wrap doc-wrap">
      <div className="doc-toolbar">
        <button type="button" className="back-btn" onClick={onBack} aria-label="뒤로">
          ←
        </button>
        <button type="button" className="doc-toolbar-btn" onClick={() => window.print()}>
          인쇄·PDF 저장
        </button>
        <button type="button" className="doc-toolbar-btn" onClick={handleShare}>
          {shareState === "copied" ? "복사됨!" : "공유하기"}
        </button>
      </div>

      <div className="doc-sheet">
        <div className="doc-head">
          <Wordmark />
          <div className="doc-head-meta">
            <span>견적서</span>
            <span>{quoteNumber}</span>
            <span>{today}</span>
          </div>
        </div>

        <div className="doc-hero">
          <div className="doc-hero-label">{monthlyFeeLabel(deal)}</div>
          <div className="doc-hero-amt">
            {won(row.monthlyPayment!)}
            <span>원</span>
          </div>
        </div>

        <table className="doc-table">
          <caption>계약 차량</caption>
          <tbody>
            <tr>
              <th>모델</th>
              <td>
                {vehicle.brand} {vehicle.display}
              </td>
            </tr>
            <tr>
              <th>차량가</th>
              <td>
                {won(vehicle.displayPrice)}원{vehicle.priceIsEstimate && " (예상가)"}
              </td>
            </tr>
          </tbody>
        </table>

        <table className="doc-table">
          <caption>계약 조건</caption>
          <tbody>
            <tr>
              <th>금융사</th>
              <td>
                {row.sourceLabel
                  ? `${anonCapital(row.capital)} · ${row.sourceLabel}`
                  : anonCapital(row.capital)}
              </td>
            </tr>
            <tr>
              <th>상품</th>
              <td>{DEAL_EXPLAIN[deal].name}</td>
            </tr>
            <tr>
              <th>계약 기간</th>
              <td>{termMonths}개월</td>
            </tr>
            {deal !== "financeLease" && (
              <tr>
                <th>주행거리</th>
                <td>연 {annualMileageKm / 10000}만km</td>
              </tr>
            )}
            <tr>
              <th>보증금</th>
              <td>{won(deposit)}원{deposit > 0 && " (만기 환급)"}</td>
            </tr>
            <tr>
              <th>선납금</th>
              <td>{won(prepay)}원{prepay > 0 && " (환급 없음)"}</td>
            </tr>
            {row.residualValue !== undefined && row.residualRate !== undefined && (
              <tr>
                <th>잔존가치</th>
                <td>
                  {won(row.residualValue)}원 ({(row.residualRate * 100).toFixed(0)}%)
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {compared.length >= 2 && (
          <table className="doc-table doc-compare-table">
            <caption>
              {monthlyFeeLabel(deal)} 비교 ({compared.length}개 금융사)
              {isBest && <span className="doc-best-chip">최저</span>}
            </caption>
            <tbody>
              {compared.map((r) => {
                const picked = r === row;
                const gap = r.monthlyPayment! - compared[0].monthlyPayment!;
                return (
                  <tr key={`${r.capital}-${r.sourceId}`} className={picked ? "doc-compare-picked" : undefined}>
                    <th>
                      {picked && "▶ "}
                      {anonCapital(r.capital)}
                    </th>
                    <td>
                      {won(r.monthlyPayment!)}원
                      {gap > 0 && <span className="doc-compare-gap"> (+{won(gap)}원)</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div className="doc-total">
          <span>총 납부액 ({termMonths}개월)</span>
          <b>{won(totalPayment)}원</b>
        </div>

        <p className="doc-consultant">
          문의: <a href={KAKAO_URL} target="_blank" rel="noopener noreferrer">오픈카톡 상담</a>
        </p>

        <p className="doc-disclaimer">
          차량가는 {priceDate} 기준 RENTO가 확인한 시세예요. 이 견적은 입력하신 조건 기준
          예상 견적이며, 실제 계약 조건은 상담 시 확정돼요.
        </p>
      </div>
    </main>
  );
}

function ConsultantFooter() {
  return (
    <div className="consultant-footer">
      <a href={KAKAO_URL} target="_blank" rel="noopener noreferrer" className="consultant-phone">
        💬 오픈카톡 상담
      </a>
    </div>
  );
}

/** 결과 화면 전용 상담 CTA — 개인 연락처 대신 항상 오픈카톡으로 연결 */
function ConsultantCta() {
  return (
    <div className="cta-bar">
      <div className="cta-bar-text">
        <span className="cta-bar-title">
          이 조건으로 상담받고 싶으신가요?
        </span>
        <span className="cta-bar-sub">담당 컨설턴트가 도와드려요</span>
      </div>
      <a href={KAKAO_URL} target="_blank" rel="noopener noreferrer" className="cta-bar-btn">
        카카오톡 상담
      </a>
    </div>
  );
}

// ─── 메인 앱 ─────────────────────────────────────────────────────────────────

export default function QuoteApp() {
  const index = useMemo(() => buildVehicleIndex(), []);
  const groups = useMemo(() => buildModelGroups(), []);
  const brands = useMemo(() => listBrands(), []);

  const [screen, setScreen] = useState<Screen>("landing");
  const [vehicle, setVehicle] = useState<IndexedVehicle | null>(null);
  const [docRow, setDocRow] = useState<CapitalQuoteRow | null>(null);
  const [dealType, setDealType] = useState<DealType>("operatingLease");
  const [termMonths, setTermMonths] = useState(48);
  const [annualMileageKm, setAnnualMileageKm] = useState(20000);
  const [depositPct, setDepositPct] = useState(30);
  const [prepayment, setPrepayment] = useState(0);

  // 홈 검색 — 모델 그룹 → 트림 2단계. activeGroup이 있으면 그 그룹의
  // 트림 리스트를, 없으면 모델 그룹 리스트를 보여준다.
  const [query, setQuery] = useState("");
  const [activeBrand, setActiveBrand] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState<ModelGroupSummary | null>(null);

  // 예산 흐름
  const [budget, setBudget] = useState(1_000_000);
  const [budgetDeal, setBudgetDeal] = useState<DealType>("operatingLease");
  const [budgetTerm, setBudgetTerm] = useState(48);

  // ── 브라우저 뒤로가기 = 화면 뒤로 ──
  useEffect(() => {
    history.replaceState({ screen: "landing" }, "");
    const onPop = (e: PopStateEvent) => {
      setScreen((e.state?.screen as Screen) ?? "landing");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function navigate(next: Screen) {
    setScreen(next);
    history.pushState({ screen: next }, "");
  }

  // ── 하단 고정 바: 비교 카드가 화면 밖일 때만 ──
  const compareRef = useRef<HTMLDivElement | null>(null);
  const [compareVisible, setCompareVisible] = useState(true);
  useEffect(() => {
    if (screen !== "result" || !compareRef.current) return;
    const ob = new IntersectionObserver(
      ([e]) => setCompareVisible(e.isIntersecting),
      { threshold: 0.1 },
    );
    ob.observe(compareRef.current);
    return () => ob.disconnect();
  }, [screen, vehicle, dealType]);

  // 1단계: 모델 그룹 검색 — 그룹명·브랜드가 매치되거나, 그룹 안의 트림
  // 중 하나라도 매치되면 그 그룹을 노출한다("E 300"처럼 트림 수준
  // 검색어도 그 트림이 속한 그룹으로 자연스럽게 이어지도록).
  const groupResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q && !activeBrand) return [];
    return groups
      .filter(
        (g) =>
          (!activeBrand || g.brand === activeBrand) &&
          (!q ||
            g.name.toLowerCase().includes(q) ||
            g.brand.toLowerCase().includes(q) ||
            `${g.brand} ${g.name}`.toLowerCase().includes(q) ||
            g.trims.some((t) => t.display.toLowerCase().includes(q))),
      )
      .slice(0, 30);
  }, [groups, query, activeBrand]);

  // 2단계: 그룹을 골랐을 때 그 안의 트림들 — 검색어가 있으면 트림명으로도
  // 다시 좁혀준다(그룹 안에 트림이 많을 때 유용).
  const trimResults = useMemo(() => {
    if (!activeGroup) return [];
    const q = query.trim().toLowerCase();
    if (!q) return activeGroup.trims;
    return activeGroup.trims.filter((t) => t.display.toLowerCase().includes(q));
  }, [activeGroup, query]);

  const popular = useMemo(
    () =>
      POPULAR_QUERIES.map((q) =>
        index.find((v) => v.display.toLowerCase().includes(q.toLowerCase())),
      ).filter((v): v is IndexedVehicle => !!v),
    [index],
  );

  // 48개월·보증금30% 조건으로 실제 최저가 견적을 뽑는다(하드코딩 가격
  // 아님) — 랜딩의 "할인 특가"·"인기 모델" 카드가 공용으로 쓴다.
  function bestLandingQuote(v: IndexedVehicle): {
    deal: DealType;
    monthlyPayment: number;
    residualRate?: number;
    spread: number;
    sourceCount: number;
  } | null {
    const deals = dealsForIndexed(v);
    for (const deal of PROMO_DEAL_TRY_ORDER) {
      if (!deals.includes(deal)) continue;
      const ok = quoteIndexed(v, deal, PROMO_CONDITIONS).filter(
        (r) => r.available && typeof r.monthlyPayment === "number",
      );
      if (ok.length === 0) continue;
      const best = ok.reduce((a, b) => (b.monthlyPayment! < a.monthlyPayment! ? b : a));
      // 카드에 "최대 XXX원 차이"를 보여주려고 같은 조건으로 계산된 다른
      // 금융사 견적과의 격차도 같이 뽑는다(결과 화면의 savings-badge와
      // 같은 계산, 새 데이터 없이 이미 계산되는 rows에서 가져오는 것뿐).
      const amounts = ok.map((r) => r.monthlyPayment!);
      const spread = amounts.length >= 2 ? Math.max(...amounts) - Math.min(...amounts) : 0;
      // 실명(오릭스/신한/메리츠)은 카드에 안 밝히고 "N사 비교"로만 말하되,
      // N은 하드코딩이 아니라 이 차량·조건에서 실제로 비교된 금융사 수다.
      const sourceCount = new Set(ok.map((r) => r.capital)).size;
      return { deal, monthlyPayment: best.monthlyPayment!, residualRate: best.residualRate, spread, sourceCount };
    }
    return null;
  }

  function groupTargetCards(targets: { brand: string; group: string }[]) {
    const cards: {
      vehicle: IndexedVehicle;
      deal: DealType;
      monthlyPayment: number;
      residualRate?: number;
      spread: number;
      sourceCount: number;
    }[] = [];
    for (const { brand, group } of targets) {
      const g = groups.find((g) => g.brand === brand && g.name === group);
      const v = g?.trims[0];
      if (!v) continue;
      const q = bestLandingQuote(v);
      if (q) cards.push({ vehicle: v, ...q });
    }
    return cards;
  }

  const instantDeliveryCards = useMemo(() => {
    return INSTANT_DELIVERY_TESLA.map((item) => {
      let monthlyPayment: number;
      let residualRate: number;
      try {
        const q = quoteMeritzTeslaLease({
          model: item.model,
          vehiclePrice: item.vehiclePrice,
          termMonths: PROMO_CONDITIONS.termMonths,
          annualMileageKm: PROMO_CONDITIONS.annualMileageKm,
          depositRate: PROMO_CONDITIONS.depositRate,
          prepaymentRate: PROMO_CONDITIONS.prepayment,
        });
        monthlyPayment = q.monthlyPayment;
        residualRate = q.residualRate;
      } catch {
        return null;
      }
      const group = groups.find((g) => g.brand === "테슬라" && g.name === item.group);
      return { ...item, monthlyPayment, residualRate, image: group?.image };
    }).filter((c): c is NonNullable<typeof c> => !!c);
  }, [groups]);
  const popularCards = useMemo(() => groupTargetCards(POPULAR_TARGETS), [groups]);

  function goToSearch(q?: string) {
    if (q !== undefined) setSearchQuery(q);
    navigate("home");
  }

  const availableDeals = useMemo(
    () => (vehicle ? dealsForIndexed(vehicle) : []),
    [vehicle],
  );
  const effectiveDeal = availableDeals.includes(dealType)
    ? dealType
    : availableDeals[0] ?? "operatingLease";

  const rows = useMemo(
    () =>
      vehicle
        ? quoteIndexed(vehicle, effectiveDeal, {
            termMonths,
            annualMileageKm,
            depositRate: depositPct / 100,
            prepayment,
          })
        : [],
    [vehicle, effectiveDeal, termMonths, annualMileageKm, depositPct, prepayment],
  );

  const recommendations = useMemo(
    () => (screen === "budget" ? recommendByBudget(budget, budgetDeal, budgetTerm) : []),
    [screen, budget, budgetDeal, budgetTerm],
  );

  const bestRow = useMemo(() => {
    const usable = rows.filter((r) => r.available && typeof r.monthlyPayment === "number");
    if (usable.length === 0) return null;
    return usable.reduce((a, b) => (b.monthlyPayment! < a.monthlyPayment! ? b : a));
  }, [rows]);

  function pickVehicle(next: IndexedVehicle) {
    setVehicle(next);
    const deals = dealsForIndexed(next);
    setDealType(deals.includes("operatingLease") ? "operatingLease" : deals[0] ?? "operatingLease");
    setQuery("");
    setActiveGroup(null);
    navigate("result");
  }

  /** 그룹 클릭 — 트림이 하나뿐이면 굳이 한 번 더 클릭시키지 않고 바로 선택. */
  function pickGroup(group: ModelGroupSummary) {
    if (group.trimCount === 1) {
      pickVehicle(group.trims[0]);
      return;
    }
    setActiveGroup(group);
  }

  function setSearchQuery(next: string) {
    setQuery(next);
    setActiveGroup(null);
  }

  function setSearchBrand(next: string | null) {
    setActiveBrand(next);
    setActiveGroup(null);
  }

  function pickRecommendation(next: IndexedVehicle) {
    setVehicle(next);
    setDealType(budgetDeal);
    setTermMonths(budgetTerm);
    setDepositPct(RECOMMEND_DEFAULTS.depositRate * 100);
    setAnnualMileageKm(RECOMMEND_DEFAULTS.annualMileageKm);
    navigate("result");
  }

  // ─── 화면: 랜딩(홈페이지) ────────────────────────────────────────────────────

  if (screen === "landing") {
    return (
      <main className="landing">
        <header className="landing-header">
          <div className="landing-inner landing-header-row">
            <Wordmark />
            <nav className="landing-nav">
              <ThemeToggle />
              <button type="button" className="landing-nav-cta" onClick={() => navigate("home")}>
                견적 시작하기
              </button>
            </nav>
          </div>
        </header>

        <section className="landing-hero landing-hero-compact">
          <div className="landing-inner">
            <div className="landing-hero-row">
              <h1>
                다음 차, <em>가장 합리적인 조건</em>으로
              </h1>
              <a
                className="landing-hero-kakao"
                href={KAKAO_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                💬 오픈카톡 상담
              </a>
            </div>
            <p className="landing-hero-sub">
              장기렌트·리스·법인 리스까지, 여러 금융사 견적을 실시간으로 비교해 최저가를 확인합니다
            </p>
            <form
              className="landing-search"
              onSubmit={(e) => {
                e.preventDefault();
                goToSearch(query);
              }}
            >
              <input
                type="text"
                placeholder="차량명으로 검색 (예: 그랜저, E 300, Model Y)"
                value={query}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="차량 검색"
              />
              <button type="submit">검색</button>
            </form>
            <div className="brand-chips landing-hero-chips">
              {brands.slice(0, 8).map((b) => (
                <button
                  key={b}
                  type="button"
                  className="brand-chip"
                  onClick={() => {
                    setSearchBrand(b);
                    navigate("home");
                  }}
                >
                  {b}
                </button>
              ))}
              <button
                type="button"
                className="brand-chip"
                onClick={() => navigate("home")}
              >
                +{Math.max(brands.length - 8, 0)}개 브랜드
              </button>
            </div>
          </div>
        </section>

        {(instantDeliveryCards.length > 0 || popularCards.length > 0) && (
          <section className="landing-section">
            <div className="landing-inner">
              <div className="landing-sec-head">
                <div>
                  <h2>이달의 추천 차량</h2>
                  <p className="landing-sec-desc">
                    48개월 · 보증금 30% 기준 실시간 계산가 · 클릭하면 트림 선택 → 최저가 비교로 이동
                  </p>
                </div>
              </div>

              {instantDeliveryCards.length > 0 && (
                <div className="landing-row-block">
                  <p className="landing-row-label">
                    <span className="landing-tag landing-tag-promo">즉시출고 가능 차량</span>
                    이미 확보된 재고, 색상·옵션 변경 없이 바로 인도
                  </p>
                  <div className="landing-promo-grid">
                    {instantDeliveryCards.map((item) => (
                      <button
                        key={`${item.model}-${item.color}-${item.interior}`}
                        type="button"
                        className="landing-promo-card"
                        onClick={() => goToSearch(item.group)}
                      >
                        <span className="landing-promo-badge">즉시출고 가능</span>
                        <VehiclePhoto brand="테슬라" src={item.image} />
                        <span className="landing-promo-body">
                          <span className="landing-promo-brand">테슬라</span>
                          <span className="landing-promo-name">
                            Model {item.group === "모델 Y" ? "Y" : "3"} {item.trimLabel}
                          </span>
                          <span className="landing-promo-row">
                            <span>차량가</span>
                            <span>{man(item.vehiclePrice)}</span>
                          </span>
                          <span className="landing-promo-cond">
                            {item.color} · {item.wheel}
                          </span>
                          <span className="landing-promo-cond">
                            운용리스 · 잔가 {Math.round(item.residualRate * 100)}% 반영
                          </span>
                          <span className="landing-promo-price-lbl">월 리스료</span>
                          <span className="landing-promo-price">
                            {won(item.monthlyPayment)}
                            <small>원부터</small>
                          </span>
                          <span className="landing-promo-spread landing-spread-muted">
                            고정 사양 재고 · 색상·옵션 변경 불가 · 소진 시 마감
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {popularCards.length > 0 && (
                <div className="landing-row-block">
                  <p className="landing-row-label">
                    <span className="landing-tag">인기 모델</span>
                    지금 많이 찾는 모델
                  </p>
                  <div className="landing-model-grid">
                    {popularCards.map(({ vehicle: v, monthlyPayment, spread, sourceCount }) => (
                      <button
                        key={v.id}
                        type="button"
                        className="landing-model-card"
                        onClick={() => pickVehicle(v)}
                      >
                        <span className="landing-model-badge">
                          {sourceCount > 1 ? `${sourceCount}사 비교` : "단독 취급"}
                        </span>
                        <VehiclePhoto brand={v.brand} src={v.image} />
                        <span className="landing-model-name">{v.display}</span>
                        <span className="landing-model-price">
                          월 <b>{won(monthlyPayment)}</b>원부터
                        </span>
                        {spread > 0 ? (
                          <span className="landing-model-spread">최대 {won(spread)}원 차이</span>
                        ) : (
                          <span className="landing-model-spread landing-spread-muted">비교 대상 없음</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        <section className="landing-contact landing-contact-compact">
          <div className="landing-inner landing-contact-bar">
            <div className="landing-contact-bar-text">
              <p className="landing-contact-bar-title">
                차량명으로 바로 찾거나, 확신이 서면 오픈카톡으로 상담하세요
              </p>
              <p className="landing-contact-bar-meta">
                이두영 대표 · 주식회사 RENTO · 본점 서울 강남구 선릉로 129길 25 · 지점 서울
                영등포구 영등포로 144 ·{" "}
                <a href={BLOG_URL} target="_blank" rel="noopener noreferrer">
                  블로그
                </a>
              </p>
            </div>
            <div className="landing-contact-bar-btns">
              <button type="button" className="landing-nav-cta" onClick={() => navigate("home")}>
                내 차 견적 만들기
              </button>
              <a
                className="landing-kakao-btn"
                href={KAKAO_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                💬 오픈카톡 상담
              </a>
            </div>
          </div>
        </section>

        <section className="landing-section landing-features landing-features-compact">
          <div className="landing-inner">
            <p className="landing-mini-label">왜 RENTO인가 · 비교 사이트가 아니라 비교 계산기입니다</p>
            <div className="landing-feature-list">
              {RENTO_FEATURES.map((f) => (
                <div key={f.title} className="landing-feature-item">
                  <b>{f.title}</b>
                  <span>{f.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-stats landing-stats-compact">
          <div className="landing-inner landing-stats-grid">
            {[
              ...TRUST_STATS,
              { num: index.length.toLocaleString("ko-KR"), unit: "+", label: "취급 차량" },
              { num: String(brands.length), unit: "개", label: "취급 브랜드" },
            ].map((s) => (
              <div key={s.label} className="landing-stat-item">
                <div className="landing-stat-num">
                  {s.num}
                  <span>{s.unit}</span>
                </div>
                <div className="landing-stat-label">{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        <footer className="landing-footer">
          <div className="landing-inner landing-footer-row">
            <span>주식회사 유니디아 자회사 · RENTO — Driven by Precision</span>
            <span>
              <a href={KAKAO_URL} target="_blank" rel="noopener noreferrer">
                오픈카톡
              </a>{" "}
              ·{" "}
              <a href={BLOG_URL} target="_blank" rel="noopener noreferrer">
                블로그
              </a>
            </span>
          </div>
        </footer>
      </main>
    );
  }

  // ─── 화면: 홈 ──────────────────────────────────────────────────────────────

  if (screen === "home") {
    return (
      <main className="wrap">
        <header className="masthead">
          <div className="masthead-top">
            <button type="button" className="wordmark-btn" onClick={() => navigate("landing")} aria-label="홈으로">
              <Wordmark />
            </button>
            <ThemeToggle />
          </div>
          <h1>
            다음 차, 가장 <em>합리적인</em> 조건으로
          </h1>
          <p className="sub">리스·렌트 월 납부액을 한눈에 비교합니다</p>
        </header>

        <section className="panel">
          <div className="field">
            <input
              type="text"
              placeholder="차량명으로 검색 (예: 그랜저, E 300, Model Y)"
              value={query}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="차량 검색"
            />
          </div>
          <div className="brand-chips">
            {brands.map((b) => (
              <button
                key={b}
                type="button"
                className={`brand-chip${activeBrand === b ? " on" : ""}`}
                onClick={() => setSearchBrand(activeBrand === b ? null : b)}
              >
                {b}
              </button>
            ))}
          </div>

          {activeGroup ? (
            <>
              <button type="button" className="group-back" onClick={() => setActiveGroup(null)}>
                ← {activeGroup.brand} {activeGroup.name}
              </button>
              {trimResults.length > 0 && (
                <div className="search-list">
                  {trimResults.map((v) => {
                    const { main, pkg } = splitTrimLabel(v.display);
                    return (
                      <button key={v.id} type="button" className="search-row trim-row" onClick={() => pickVehicle(v)}>
                        <span className="search-row-lead">
                          <span className="search-row-name">
                            {main}
                            {pkg && <span className="trim-pkg">{pkg}</span>}
                          </span>
                        </span>
                        <span className="search-row-meta">
                          {v.displayPrice > 0 ? `차량가 ${man(v.displayPrice)}` : ""}
                          {v.priceIsEstimate && v.displayPrice > 0 ? "~" : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {trimResults.length === 0 && <div className="search-empty">검색 결과가 없어요</div>}
            </>
          ) : (
            <>
              {groupResults.length > 0 && (
                <div className="search-list">
                  {groupResults.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      className="search-row model-group-row"
                      onClick={() => pickGroup(g)}
                    >
                      <span className="search-row-lead">
                        <BrandLogo brand={g.brand} />
                        <span className="search-row-name">
                          <b>{g.brand}</b> {g.name}
                        </span>
                      </span>
                      <span className="search-row-meta">
                        {g.trimCount > 1 ? `${g.trimCount}개 트림 · ` : ""}
                        {g.minPrice > 0 ? `${man(g.minPrice)}부터` : ""}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {(query.trim() || activeBrand) && groupResults.length === 0 && (
                <div className="search-empty">검색 결과가 없어요</div>
              )}

              {!query.trim() && !activeBrand && popular.length > 0 && (
                <>
                  <p className="popular-label">인기 모델로 바로 시작</p>
                  <div className="popular-chips">
                    {popular.map((v) => (
                      <button key={v.id} type="button" className="popular-chip" onClick={() => pickVehicle(v)}>
                        {v.display}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </section>

        {/* 예산 기준 추천 진입점 비활성화(2026-07) — 로직/화면은 유지, 노출만 숨김.
            <button type="button" className="budget-banner" onClick={() => navigate("budget")}>
              <span className="budget-banner-title">차량을 아직 정하지 않으셨나요?</span>
              <span className="budget-banner-sub">월 예산에 맞는 차량 찾기 →</span>
            </button> */}

        <ConsultantFooter />
      </main>
    );
  }

  // ─── 화면: 예산으로 찾기 ───────────────────────────────────────────────────

  if (screen === "budget") {
    return (
      <main className="wrap">
        <TopBar title="예산으로 찾기" />
        <section className="panel">
          <p className="panel-label">월 예산</p>
          <div className="seg budget-seg">
            {BUDGET_PRESETS.map((b) => (
              <button key={b} type="button" aria-pressed={budget === b} onClick={() => setBudget(b)}>
                {b / 10_000}만원
              </button>
            ))}
          </div>
          <div className="field">
            <label htmlFor="budget-custom">직접 입력 (원/월)</label>
            <input
              id="budget-custom"
              type="number"
              inputMode="numeric"
              value={budget || ""}
              onChange={(e) => setBudget(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
          <div className="field">
            <label>이용 방식</label>
            <div className="seg">
              {DEAL_ORDER.filter((d) => RECOMMENDABLE_DEALS.includes(d)).map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={budgetDeal === d}
                  onClick={() => setBudgetDeal(d)}
                >
                  {DEAL_EXPLAIN[d].name}
                </button>
              ))}
            </div>
            <span className="help-note">{DEAL_EXPLAIN[budgetDeal].desc}</span>
          </div>
          <div className="field">
            <label>이용 기간</label>
            <div className="seg">
              {[36, 48, 60].map((t) => (
                <button key={t} type="button" aria-pressed={budgetTerm === t} onClick={() => setBudgetTerm(t)}>
                  {t}개월
                </button>
              ))}
            </div>
          </div>
          <p className="note">
            보증금(만기 환급) 30% · 연 2만km 기준으로 계산해요. 선택 후 조건을 바꿀 수 있어요.
          </p>
        </section>

        <section className="panel">
          <p className="panel-label">월 {won(budget)}원이면 이런 차를 탈 수 있어요</p>
          {recommendations.length === 0 ? (
            <div className="search-empty">
              이 조건으로 예산 안에 들어오는 차량이 없어요. 예산이나 방식을 바꿔보세요.
            </div>
          ) : (
            <div className="reco-list">
              {recommendations.map((r) => (
                <button
                  key={r.vehicle.id}
                  type="button"
                  className="reco-row"
                  onClick={() => pickRecommendation(r.vehicle)}
                >
                  <span className="reco-left">
                    <BrandLogo brand={r.vehicle.brand} />
                    <span className="reco-text">
                      {r.vehicle.modelGroup !== r.vehicle.display && (
                        <span className="reco-group">
                          {r.vehicle.brand} {r.vehicle.modelGroup}
                        </span>
                      )}
                      <span className="reco-name">
                        <b>{r.vehicle.brand}</b> {r.vehicle.display}
                      </span>
                      <span className="reco-meta">
                        차량가 {man(r.vehicle.displayPrice)}
                        {r.vehicle.priceIsEstimate && " (예상)"}
                      </span>
                    </span>
                  </span>
                  <span className="reco-right">
                    <span className="reco-amt">{won(r.monthlyPayment)}</span>
                    <span className="reco-unit">원/월~</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </main>
    );
  }

  // ─── 화면: 결과 (차량 선택 즉시 기본 조건으로 계산) ────────────────────────

  if (screen === "result" && vehicle) {
    return (
      <main className="wrap wrap-wide">
        <TopBar title="견적 비교" />

        <div className="vehicle-summary">
          <div className="vehicle-summary-id">
            <BrandLogo brand={vehicle.brand} size="lg" />
            <div className="vehicle-summary-text">
              <span className="vehicle-summary-name">
                <b>{vehicle.brand}</b> {vehicle.display}
              </span>
              <span className="vehicle-summary-meta">
                차량가 {won(vehicle.displayPrice)}원
                {vehicle.priceIsEstimate && (
                  <span className="est-tag" title="시세 기준 예상가입니다. 정확한 가격은 상담 시 확정돼요">
                    예상
                  </span>
                )}
              </span>
            </div>
          </div>
          <VehiclePhoto brand={vehicle.brand} src={vehicle.image} />
        </div>

        {availableDeals.length > 0 && (
          <div className="deal-tabs" role="tablist">
            {DEAL_ORDER.filter((d) => availableDeals.includes(d)).map((d) => (
              <button
                key={d}
                type="button"
                role="tab"
                aria-selected={effectiveDeal === d}
                className={`deal-tab${effectiveDeal === d ? " on" : ""}`}
                onClick={() => setDealType(d)}
              >
                {DEAL_EXPLAIN[d].name}
              </button>
            ))}
          </div>
        )}
        <p className="deal-desc">{DEAL_EXPLAIN[effectiveDeal].desc}</p>

        <div className="result-grid">
          <div className="result-aside">
            <section className="panel">
              <p className="panel-label">조건 바꿔보기</p>
              <p className="aside-note">기본 조건: 48개월 · 보증금 30% · 연 2만km</p>
              <ConditionFields
                deal={effectiveDeal}
                termMonths={termMonths}
                setTermMonths={setTermMonths}
                annualMileageKm={annualMileageKm}
                setAnnualMileageKm={setAnnualMileageKm}
                depositPct={depositPct}
                setDepositPct={setDepositPct}
                prepayment={prepayment}
                setPrepayment={setPrepayment}
              />
            </section>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => {
                setVehicle(null);
                navigate("home");
              }}
            >
              다른 차량 알아보기
            </button>
          </div>

          <div className="result-main">
            <div ref={compareRef}>
              <CompareResult
                key={`${vehicle.id}-${effectiveDeal}`}
                rows={rows}
                deal={effectiveDeal}
                termMonths={termMonths}
                annualMileageKm={annualMileageKm}
                onViewDocument={(r) => {
                  setDocRow(r);
                  navigate("quote-doc");
                }}
              />
            </div>
            <p className="trust-note">
              실제 금융사 계산식 기반 · 행을 누르면 초기 비용과 총 납부액이 보여요 · 최종 조건은 상담 시 확정돼요
            </p>
            <ConsultantCta />
            <ConsultantFooter />
          </div>
        </div>

        {bestRow && !compareVisible && (
          <div className="sticky-best" role="status">
            <span className="sticky-best-label">최저 {monthlyFeeLabel(effectiveDeal)} · {anonCapital(bestRow.capital)}</span>
            <span className="sticky-best-amt">{won(bestRow.monthlyPayment!)}원/월</span>
          </div>
        )}
      </main>
    );
  }

  if (screen === "quote-doc" && vehicle && docRow) {
    return (
      <QuoteDocument
        vehicle={vehicle}
        row={docRow}
        rows={rows}
        deal={effectiveDeal}
        termMonths={termMonths}
        annualMileageKm={annualMileageKm}
        onBack={() => history.back()}
      />
    );
  }

  // vehicle 없이 result에 진입한 예외 상태 → 홈으로
  return (
    <main className="wrap">
      <Wordmark />
      <button type="button" className="save-btn" onClick={() => navigate("home")}>
        처음으로
      </button>
    </main>
  );
}

// ─── 조건 입력 필드 묶음 ──────────────────────────────────────────────────────

function ConditionFields({
  deal,
  termMonths,
  setTermMonths,
  annualMileageKm,
  setAnnualMileageKm,
  depositPct,
  setDepositPct,
  prepayment,
  setPrepayment,
}: {
  deal: DealType;
  termMonths: number;
  setTermMonths: (v: number) => void;
  annualMileageKm: number;
  setAnnualMileageKm: (v: number) => void;
  depositPct: number;
  setDepositPct: (v: number) => void;
  prepayment: number;
  setPrepayment: (v: number) => void;
}) {
  return (
    <>
      <div className="field">
        <label>{deal === "financeLease" ? "리스 기간" : "계약 기간"}</label>
        <div className="seg">
          {[36, 48, 60].map((t) => (
            <button key={t} type="button" aria-pressed={termMonths === t} onClick={() => setTermMonths(t)}>
              {t}개월
            </button>
          ))}
        </div>
      </div>

      {deal !== "financeLease" && (
        <div className="field">
          <label>연간 약정 주행거리</label>
          <div className="seg">
            {[10000, 20000, 30000].map((km) => (
              <button
                key={km}
                type="button"
                aria-pressed={annualMileageKm === km}
                onClick={() => setAnnualMileageKm(km)}
              >
                {km / 10000}만 km
              </button>
            ))}
          </div>
        </div>
      )}

      {deal === "operatingLease" && (
        <div className="field">
          <label>보증금 비율 (만기 환급)</label>
          <div className="seg">
            {[0, 10, 20, 30].map((p) => (
              <button key={p} type="button" aria-pressed={depositPct === p} onClick={() => setDepositPct(p)}>
                {p}%
              </button>
            ))}
          </div>
          <span className="help-note">
            계약할 때 맡겼다가 만기에 전액 돌려받는 돈이에요. 많이 맡길수록 월 납부액이 내려가요.
          </span>
        </div>
      )}

      {deal === "financeLease" && (
        <div className="field">
          <label htmlFor="pre">선납금 (원 · 환급 없음)</label>
          <input
            id="pre"
            type="number"
            inputMode="numeric"
            value={prepayment || ""}
            placeholder="0"
            onChange={(e) => setPrepayment(Math.max(0, Number(e.target.value) || 0))}
          />
          <span className="help-note">
            처음에 미리 내는 금액이에요. 낸 만큼 월 납부액이 내려가요. 돌려받지 않아요.
          </span>
        </div>
      )}
    </>
  );
}
