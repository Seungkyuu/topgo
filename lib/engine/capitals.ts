/**
 * 견적 소스(엑셀) 레지스트리 + 차량 라우팅.
 *
 * ─── 근본 원칙 ────────────────────────────────────────────────────────────────
 * 계산의 단위는 "캐피탈"이 아니라 "엑셀 파일 하나"다. 각 엑셀은 자기 안에 든
 * 특정 차량 목록 + 그 차량을 계산하는 로직이 한 덩어리로 묶여 있고, 자기 카탈로그에
 * 든 차만 계산할 수 있다. 그래서 한 캐피탈(예: 메리츠)이 여러 엑셀(수입차·국산차·
 * 테슬라·BYD·렌트…)을 갖고, 각각이 독립된 소스가 된다.
 *
 * 어떤 소스가 어떤 차를 취급하는지는 선언이 아니라 오직 그 소스의 추출된 차량
 * 데이터에 그 차가 실제로 있는지(handles)로만 결정된다. 엑셀에 없으면 = 미취급.
 *
 * ─── 견적 순서 ────────────────────────────────────────────────────────────────
 *   1차 필터 (차량): 그 차가 카탈로그에 있는 소스만 추린다
 *   2차 필터 (상품): 그중 원하는 상품(리스/렌트)을 계산하는 소스만 남긴다
 *   연산: 남은 소스 각각의 계산 로직으로 견적 → 비교
 */

import { quoteOrixOperatingLease, quoteOrixFinanceLease, findOrixVehicle } from "./orix";
import {
  quoteShinhanOperatingLease,
  quoteShinhanFinanceLease,
  quoteShinhanRentalByModel,
  findShinhanVehicle,
  findShinhanRentalVehicle,
} from "./shinhan";
import {
  quoteMeritzOperatingLease,
  quoteMeritzFinanceLease,
  findMeritzVehicle,
} from "./meritz";
import { quoteMeritzDomesticLease, findDomesticVehicle } from "./meritz-domestic";
import { quoteMeritzDomesticRental, findRentalVehicle } from "./meritz-rental-domestic";
import { quoteMeritzImportRental, findImportRentalVehicle } from "./meritz-rental-import";
import { quoteBnkOperatingLease, findBnkVehicle } from "./bnk";
import { quoteMgRental, findMgRentalVehicle } from "./mg-rental";
import { quoteMgLease, findMgLeaseVehicle } from "./mg-lease";
import { quoteMeritzTeslaLease, findTeslaVehicle } from "./meritz-tesla";
import { quoteMeritzBydLease, findBydVehicle } from "./meritz-byd";
import { quoteMeritzPolestarLease, findPolestarLeaseVehicle } from "./meritz-polestar";
import type { MeritzEvLeaseQuote } from "./meritz-ev/lease";

export type DealType = "operatingLease" | "financeLease" | "longTermRental";

export const DEAL_TYPES: { key: DealType; label: string }[] = [
  { key: "operatingLease", label: "운용리스" },
  { key: "financeLease", label: "금융리스" },
  { key: "longTermRental", label: "장기렌트" },
];

export interface CapitalQuoteInput {
  model: string;
  vehiclePrice: number;
  termMonths: number;
  annualMileageKm: number;
  depositRate: number;
  prepayment: number;
  /** 장기렌트 잔가율 재정의. 미지정 시 모델 마스터에서 자동 조회. */
  residualRate?: number;
}

export interface CapitalQuoteRow {
  /** 표시용 캐피탈명 (비교 결과의 그룹 라벨) */
  capital: string;
  /** 소스(엑셀) 식별자 — 같은 캐피탈이 여러 엑셀을 가질 때 구분용 */
  sourceId: string;
  available: boolean;
  monthlyPayment?: number;
  /** 캐피탈사 내부 PMT 계산용 금리(참고용). 고객에게는 customerRate를 보여준다. */
  annualRate?: number;
  /** 고객 실효금리(표시용) — 캐피탈 간 동일 기준 비교값. 화면엔 이 값을 노출. */
  customerRate?: number;
  residualRate?: number;
  /** 잔존가치(원) — 행 상세 표시용. 소스가 계산하지 않으면 없음 */
  residualValue?: number;
  /** 보증금(원, 만기 환급) — 행 상세 표시용 */
  deposit?: number;
  /** 선납금(원, 환급 없음) — 행 상세 표시용. undefined = 이 소스는 선납금 미반영 */
  prepayment?: number;
  /** 사람이 읽는 소스 이름 — quoteVehicle()이 라우팅 시 채워준다 */
  sourceLabel?: string;
  note?: string;
}

/**
 * 견적 소스 = 엑셀 워크북 하나(카탈로그 + 계산 로직).
 * `handles`는 이 엑셀 카탈로그에 그 차가 실제로 있는지만 본다.
 */
export interface QuoteSource {
  id: string;
  capital: string;
  /** 사람이 읽는 소스 이름 (예: "메리츠 수입차") */
  label: string;
  /** 이 엑셀이 계산하는 상품들 */
  deals: DealType[];
  /** 1차 필터: 이 엑셀 카탈로그에 그 차가 있나 */
  handles: (model: string) => boolean;
  /** 연산: 이 엑셀 로직으로 견적 */
  quote: (deal: DealType, input: CapitalQuoteInput) => CapitalQuoteRow;
}

// ─── 소스별 계산 (기존 검증된 엔진을 소스로 감싼다) ──────────────────────────────

function orixQuote(id: string, deal: DealType, input: CapitalQuoteInput): CapitalQuoteRow {
  const capital = "오릭스";
  try {
    if (deal === "operatingLease") {
      const q = quoteOrixOperatingLease({
        model: input.model,
        vehiclePrice: input.vehiclePrice,
        termMonths: input.termMonths,
        annualMileageKm: input.annualMileageKm,
        depositRate: input.depositRate,
      });
      return {
        capital, sourceId: id, available: true,
        monthlyPayment: q.monthlyPayment, annualRate: q.annualRate,
        customerRate: q.customerRate, residualRate: q.residualRate,
        residualValue: q.residualValue, deposit: q.deposit, prepayment: 0,
      };
    }
    if (deal === "financeLease") {
      const q = quoteOrixFinanceLease({
        model: input.model,
        vehiclePrice: input.vehiclePrice,
        termMonths: input.termMonths,
        prepayment: input.prepayment,
      });
      return {
        capital, sourceId: id, available: true,
        monthlyPayment: q.monthlyPayment, annualRate: q.annualRate, customerRate: q.customerRate,
        deposit: 0, prepayment: input.prepayment,
      };
    }
    return { capital, sourceId: id, available: false, note: "미취급" };
  } catch (e) {
    return { capital, sourceId: id, available: false, note: e instanceof Error ? e.message : "계산 불가" };
  }
}

/**
 * 라우터가 받은 vehiclePrice(통합 인덱스의 ref 가격 — 겟챠 실가격이 매칭된
 * 경우 그 값)를 엔진의 가격 재정의 입력으로 변환한다. 0 이하(데이터 결측)면
 * undefined를 돌려 엔진이 자기 엑셀 마스터 가격으로 폴백하게 한다.
 *
 * ⚠ 과거 버그: 신한 리스/렌트·메리츠 수입 5개 경로가 이 값을 아예 넘기지
 * 않아, 겟챠 할인가를 연결해도 이 소스들은 조용히 엑셀 원가격으로만 계산
 * 했었다("수입차도 겟챠 할인가를 계산 입력값으로 쓴다"는 사업 규칙 위반).
 */
function priceOverride(input: CapitalQuoteInput): number | undefined {
  return input.vehiclePrice > 0 ? input.vehiclePrice : undefined;
}

function shinhanLeaseQuote(id: string, deal: DealType, input: CapitalQuoteInput): CapitalQuoteRow {
  const capital = "신한카드";
  try {
    if (deal === "operatingLease") {
      const q = quoteShinhanOperatingLease({
        model: input.model,
        vehiclePrice: priceOverride(input),
        termMonths: input.termMonths,
        depositRate: input.depositRate,
        annualMileageKm: input.annualMileageKm,
      });
      return {
        capital, sourceId: id, available: true,
        monthlyPayment: q.monthlyPayment, annualRate: q.annualRate,
        customerRate: q.customerRate, residualRate: q.residualRate,
        residualValue: q.residualValue, deposit: q.deposit, prepayment: 0,
      };
    }
    if (deal === "financeLease") {
      // ⚠ 신한 금융리스 엑셀에는 선납금 입력 자체가 없다 — prepayment 미반영(undefined)
      const q = quoteShinhanFinanceLease({
        model: input.model,
        vehiclePrice: priceOverride(input),
        termMonths: input.termMonths,
        residualRate: input.residualRate,
      });
      return {
        capital, sourceId: id, available: true,
        monthlyPayment: q.monthlyPayment, annualRate: q.annualRate,
        customerRate: q.customerRate, residualRate: q.residualRate,
        residualValue: q.residualValue, deposit: 0,
      };
    }
    return { capital, sourceId: id, available: false, note: "미취급" };
  } catch (e) {
    return { capital, sourceId: id, available: false, note: e instanceof Error ? e.message : "계산 불가" };
  }
}

function shinhanRentalQuote(id: string, deal: DealType, input: CapitalQuoteInput): CapitalQuoteRow {
  const capital = "신한카드";
  try {
    if (deal !== "longTermRental") {
      return { capital, sourceId: id, available: false, note: "미취급" };
    }
    const q = quoteShinhanRentalByModel({
      model: input.model,
      vehiclePrice: priceOverride(input),
      termMonths: input.termMonths,
      residualRate: input.residualRate,
    });
    return {
      capital, sourceId: id, available: true,
      monthlyPayment: q.monthlyPayment, annualRate: q.annualRate,
      customerRate: q.customerRate, residualRate: q.residualRate,
      residualValue: q.residualValue, deposit: 0, prepayment: 0,
    };
  } catch (e) {
    return { capital, sourceId: id, available: false, note: e instanceof Error ? e.message : "계산 불가" };
  }
}

function meritzImportQuote(id: string, deal: DealType, input: CapitalQuoteInput): CapitalQuoteRow {
  const capital = "메리츠";
  try {
    if (deal === "operatingLease") {
      const q = quoteMeritzOperatingLease({
        model: input.model,
        vehiclePrice: priceOverride(input),
        termMonths: input.termMonths,
        depositRate: input.depositRate,
        prepaymentRate: 0,
        annualMileageKm: input.annualMileageKm,
      });
      return {
        capital, sourceId: id, available: true,
        monthlyPayment: q.monthlyPayment, annualRate: q.annualRate,
        customerRate: q.customerRate, residualRate: q.residualRate,
        residualValue: q.residualValue, deposit: q.deposit, prepayment: q.prepayment,
      };
    }
    if (deal === "financeLease") {
      const q = quoteMeritzFinanceLease({
        model: input.model,
        vehiclePrice: priceOverride(input),
        termMonths: input.termMonths,
        prepayment: input.prepayment,
      });
      return {
        capital, sourceId: id, available: true,
        monthlyPayment: q.monthlyPayment, annualRate: q.annualRate, customerRate: q.customerRate,
        deposit: 0, prepayment: q.prepayment,
      };
    }
    return { capital, sourceId: id, available: false, note: "미취급" };
  } catch (e) {
    return { capital, sourceId: id, available: false, note: e instanceof Error ? e.message : "계산 불가" };
  }
}

function meritzDomesticLeaseQuote(id: string, deal: DealType, input: CapitalQuoteInput): CapitalQuoteRow {
  const capital = "메리츠";
  try {
    if (deal !== "operatingLease") {
      return { capital, sourceId: id, available: false, note: "미취급" };
    }
    // 국산차: 차량가는 갓챠(카랩) 시세 입력값, 탁송료 국산 350,000 기본
    const q = quoteMeritzDomesticLease({
      model: input.model,
      vehiclePrice: input.vehiclePrice,
      termMonths: input.termMonths,
      annualMileageKm: input.annualMileageKm,
      depositRate: input.depositRate,
    });
    return {
      capital, sourceId: id, available: true,
      monthlyPayment: q.monthlyPayment, annualRate: q.annualRate,
      customerRate: q.customerRate, residualRate: q.residualRate,
      residualValue: q.residualValue, deposit: q.deposit, prepayment: q.prepayment,
    };
  } catch (e) {
    return { capital, sourceId: id, available: false, note: e instanceof Error ? e.message : "계산 불가" };
  }
}

function meritzDomesticRentalQuote(id: string, deal: DealType, input: CapitalQuoteInput): CapitalQuoteRow {
  const capital = "메리츠";
  try {
    if (deal !== "longTermRental") {
      return { capital, sourceId: id, available: false, note: "미취급" };
    }
    // 국산차: 차량가는 갓챠(카랩) 시세 입력값. 정비상품은 사용자 확정에 따라
    // 항상 Basic 등급으로 처리(quoteMeritzDomesticRental 기본 동작).
    const q = quoteMeritzDomesticRental({
      model: input.model,
      vehiclePrice: input.vehiclePrice,
      termMonths: input.termMonths,
      annualMileageKm: input.annualMileageKm,
      depositRate: input.depositRate,
    });
    return {
      capital, sourceId: id, available: true,
      monthlyPayment: q.monthlyPayment, annualRate: q.annualRate,
      customerRate: q.customerRate, residualRate: q.residualRate,
      residualValue: q.residualValue, deposit: 0, prepayment: 0,
    };
  } catch (e) {
    return { capital, sourceId: id, available: false, note: e instanceof Error ? e.message : "계산 불가" };
  }
}

function meritzImportRentalQuote(id: string, deal: DealType, input: CapitalQuoteInput): CapitalQuoteRow {
  const capital = "메리츠";
  try {
    if (deal !== "longTermRental") {
      return { capital, sourceId: id, available: false, note: "미취급" };
    }
    // 수입(EV) 렌트: 전기차 보조금은 지역·시기별 수기입력값이라 카탈로그에
    // 없음 — 보조금을 몰라 견적이 실제보다 낮게 보이면 안 되므로 기본 0원
    // (보조금 받으면 상담 시 더 낮아질 수 있다는 방향만 안전).
    const q = quoteMeritzImportRental({
      model: input.model,
      vehiclePrice: input.vehiclePrice,
      termMonths: input.termMonths,
      annualMileageKm: input.annualMileageKm,
      depositRate: input.depositRate,
    });
    return {
      capital, sourceId: id, available: true,
      monthlyPayment: q.monthlyPayment, annualRate: q.annualRate,
      customerRate: q.customerRate, residualRate: q.residualRate,
      residualValue: q.residualValue, deposit: 0, prepayment: 0,
    };
  } catch (e) {
    return { capital, sourceId: id, available: false, note: e instanceof Error ? e.message : "계산 불가" };
  }
}

function bnkOperatingLeaseQuote(id: string, deal: DealType, input: CapitalQuoteInput): CapitalQuoteRow {
  const capital = "BNK캐피탈";
  try {
    if (deal !== "operatingLease") {
      return { capital, sourceId: id, available: false, note: "미취급" };
    }
    // 딜러사별 제휴 우대금리(annualRate)는 우리 UI가 딜러사를 안 물어봐서
    // 모른다 — 항상 "비제휴" 최고금리를 쓰는 안전한 기본값(quoteBnkOperatingLease
    // 내부 기본값)을 그대로 사용한다. 실제로 제휴 딜러면 상담에서 더 낮아질 수 있음.
    const q = quoteBnkOperatingLease({
      model: input.model,
      vehiclePrice: input.vehiclePrice,
      termMonths: input.termMonths,
      annualMileageKm: input.annualMileageKm,
      depositRate: input.depositRate,
    });
    return {
      capital, sourceId: id, available: true,
      monthlyPayment: q.monthlyPayment, annualRate: q.annualRate,
      customerRate: q.customerRate, residualRate: q.residualRate,
      residualValue: q.residualValue, deposit: q.deposit, prepayment: q.prepayment,
    };
  } catch (e) {
    return { capital, sourceId: id, available: false, note: e instanceof Error ? e.message : "계산 불가" };
  }
}

function mgRentalQuote(id: string, deal: DealType, input: CapitalQuoteInput): CapitalQuoteRow {
  const capital = "MG캐피탈";
  try {
    if (deal !== "longTermRental") {
      return { capital, sourceId: id, available: false, note: "미취급" };
    }
    // 전기차보조금은 지역·시기별 수기입력값이라 카탈로그에 없음 — 기본 0원
    // (몰라서 낮게 보이는 것보단 안전, 보조금 받으면 상담에서 더 낮아질 수 있음).
    const q = quoteMgRental({
      model: input.model,
      vehiclePrice: input.vehiclePrice,
      termMonths: input.termMonths,
      annualMileageKm: input.annualMileageKm,
    });
    return {
      capital, sourceId: id, available: true,
      monthlyPayment: q.monthlyPayment, annualRate: q.annualRate,
      customerRate: q.customerRate, residualRate: q.residualRate,
      residualValue: q.residualValue, deposit: 0, prepayment: 0,
    };
  } catch (e) {
    return { capital, sourceId: id, available: false, note: e instanceof Error ? e.message : "계산 불가" };
  }
}

function mgLeaseQuote(id: string, deal: DealType, input: CapitalQuoteInput): CapitalQuoteRow {
  const capital = "MG캐피탈";
  try {
    if (deal !== "operatingLease") {
      return { capital, sourceId: id, available: false, note: "미취급" };
    }
    const q = quoteMgLease({
      model: input.model,
      vehiclePrice: input.vehiclePrice,
      termMonths: input.termMonths,
      depositRate: input.depositRate,
    });
    return {
      capital, sourceId: id, available: true,
      monthlyPayment: q.monthlyPayment, annualRate: q.annualRate,
      customerRate: q.customerRate, residualRate: q.residualRate,
      residualValue: q.residualValue, deposit: 0, prepayment: 0,
    };
  } catch (e) {
    return { capital, sourceId: id, available: false, note: e instanceof Error ? e.message : "계산 불가" };
  }
}

function evLeaseQuote(
  id: string,
  quoteFn: (input: {
    model: string; vehiclePrice: number; termMonths: number;
    annualMileageKm: number; depositRate?: number;
  }) => MeritzEvLeaseQuote,
  deal: DealType,
  input: CapitalQuoteInput,
): CapitalQuoteRow {
  const capital = "메리츠";
  try {
    if (deal !== "operatingLease") {
      return { capital, sourceId: id, available: false, note: "미취급" };
    }
    // 전기차: 차량가는 갓챠 시세 입력값, 탁송 해외 150,000 기본
    const q = quoteFn({
      model: input.model,
      vehiclePrice: input.vehiclePrice,
      termMonths: input.termMonths,
      annualMileageKm: input.annualMileageKm,
      depositRate: input.depositRate,
    });
    return {
      capital, sourceId: id, available: true,
      monthlyPayment: q.monthlyPayment, annualRate: q.annualRate,
      customerRate: q.customerRate, residualRate: q.residualRate,
      residualValue: q.residualValue, deposit: q.deposit, prepayment: q.prepayment,
    };
  } catch (e) {
    return { capital, sourceId: id, available: false, note: e instanceof Error ? e.message : "계산 불가" };
  }
}

function polestarLeaseQuote(id: string, deal: DealType, input: CapitalQuoteInput): CapitalQuoteRow {
  const capital = "메리츠";
  try {
    if (deal !== "operatingLease") {
      return { capital, sourceId: id, available: false, note: "미취급" };
    }
    const q = quoteMeritzPolestarLease({
      model: input.model,
      vehiclePrice: input.vehiclePrice,
      termMonths: input.termMonths,
      depositRate: input.depositRate,
    });
    return {
      capital, sourceId: id, available: true,
      monthlyPayment: q.monthlyPayment, annualRate: q.annualRate,
      customerRate: q.customerRate, residualRate: q.residualRate,
      residualValue: q.residualValue, deposit: q.deposit, prepayment: q.prepayment,
    };
  } catch (e) {
    return { capital, sourceId: id, available: false, note: e instanceof Error ? e.message : "계산 불가" };
  }
}

// ─── 소스 레지스트리 (추출·검증된 엑셀만 등록. 없는 파일은 등록하지 않음) ─────────
//
// 아직 미추출인 메리츠 국산차·테슬라·BYD·렌트 엑셀은 데이터가 없으므로 등록하지
// 않는다. 추출이 끝나면 그때 소스로 추가된다 — 엑셀에 실제로 있는 것만 존재한다.

export const QUOTE_SOURCES: QuoteSource[] = [
  {
    id: "orix",
    capital: "오릭스",
    label: "수입 전문 (벤츠·테슬라)",
    deals: ["operatingLease", "financeLease"],
    handles: (m) => findOrixVehicle(m) !== undefined,
    quote: (deal, input) => orixQuote("orix", deal, input),
  },
  {
    id: "shinhan-lease",
    capital: "신한카드",
    label: "오토리스",
    deals: ["operatingLease", "financeLease"],
    handles: (m) => findShinhanVehicle(m) !== null,
    quote: (deal, input) => shinhanLeaseQuote("shinhan-lease", deal, input),
  },
  {
    id: "shinhan-rental",
    capital: "신한카드",
    label: "장기렌터카",
    deals: ["longTermRental"],
    handles: (m) => findShinhanRentalVehicle(m) !== null,
    quote: (deal, input) => shinhanRentalQuote("shinhan-rental", deal, input),
  },
  {
    id: "meritz-import",
    capital: "메리츠",
    label: "수입차 전문",
    deals: ["operatingLease", "financeLease"],
    handles: (m) => findMeritzVehicle(m) !== null,
    quote: (deal, input) => meritzImportQuote("meritz-import", deal, input),
  },
  {
    id: "meritz-domestic-lease",
    capital: "메리츠",
    label: "국산차 리스",
    deals: ["operatingLease"],
    handles: (m) => findDomesticVehicle(m) !== null,
    quote: (deal, input) => meritzDomesticLeaseQuote("meritz-domestic-lease", deal, input),
  },
  {
    id: "meritz-rental-domestic",
    capital: "메리츠",
    label: "국산 장기렌트",
    deals: ["longTermRental"],
    handles: (m) => findRentalVehicle(m) !== null,
    quote: (deal, input) => meritzDomesticRentalQuote("meritz-rental-domestic", deal, input),
  },
  {
    id: "meritz-rental-import",
    capital: "메리츠",
    label: "수입(EV) 장기렌트",
    deals: ["longTermRental"],
    handles: (m) => findImportRentalVehicle(m) !== null,
    quote: (deal, input) => meritzImportRentalQuote("meritz-rental-import", deal, input),
  },
  {
    id: "bnk-operating-lease",
    capital: "BNK캐피탈",
    label: "운용리스",
    deals: ["operatingLease"],
    handles: (m) => findBnkVehicle(m) !== null,
    quote: (deal, input) => bnkOperatingLeaseQuote("bnk-operating-lease", deal, input),
  },
  {
    id: "mg-rental",
    capital: "MG캐피탈",
    label: "장기렌터카(EV)",
    deals: ["longTermRental"],
    handles: (m) => findMgRentalVehicle(m) !== null,
    quote: (deal, input) => mgRentalQuote("mg-rental", deal, input),
  },
  {
    id: "mg-lease",
    capital: "MG캐피탈",
    label: "운용리스",
    deals: ["operatingLease"],
    handles: (m) => findMgLeaseVehicle(m) !== null,
    quote: (deal, input) => mgLeaseQuote("mg-lease", deal, input),
  },
  {
    id: "meritz-tesla-lease",
    capital: "메리츠",
    label: "테슬라 전용",
    deals: ["operatingLease"],
    handles: (m) => findTeslaVehicle(m) !== null,
    quote: (deal, input) => evLeaseQuote("meritz-tesla-lease", quoteMeritzTeslaLease, deal, input),
  },
  {
    id: "meritz-byd-lease",
    capital: "메리츠",
    label: "BYD 전용",
    deals: ["operatingLease"],
    handles: (m) => findBydVehicle(m) !== null,
    quote: (deal, input) => evLeaseQuote("meritz-byd-lease", quoteMeritzBydLease, deal, input),
  },
  {
    id: "meritz-polestar-lease",
    capital: "메리츠",
    label: "Polestar 전용",
    deals: ["operatingLease"],
    handles: (m) => findPolestarLeaseVehicle(m) !== null,
    quote: (deal, input) => polestarLeaseQuote("meritz-polestar-lease", deal, input),
  },
];

/** 등록된 모든 캐피탈명 (중복 제거) — 관리자 화면의 금융사 선택 등에 사용 */
export const ALL_CAPITALS: string[] = [
  ...new Set(QUOTE_SOURCES.map((s) => s.capital)),
];

// ─── 라우팅: 차량 → 상품 → 연산 ────────────────────────────────────────────────

/** 1차 필터: 그 차를 카탈로그에 가진 소스들 */
export function sourcesForVehicle(model: string): QuoteSource[] {
  return QUOTE_SOURCES.filter((s) => s.handles(model));
}

/** 그 차에 대해 가능한 상품들 (탐색 화면에서 상품 선택지 구성용) */
export function dealsForVehicle(model: string): DealType[] {
  const set = new Set<DealType>();
  for (const s of sourcesForVehicle(model)) s.deals.forEach((d) => set.add(d));
  return DEAL_TYPES.map((d) => d.key).filter((k) => set.has(k));
}

/**
 * 차량 → 상품으로 필터링한 소스들의 견적 목록.
 *   1차 필터(차량) → 2차 필터(상품) → 각 소스 연산.
 * 취급하는 소스가 하나도 없으면 빈 배열.
 */
export function quoteVehicle(
  model: string,
  deal: DealType,
  input: CapitalQuoteInput,
): CapitalQuoteRow[] {
  return QUOTE_SOURCES
    .filter((s) => s.handles(model))       // 1차: 차량
    .filter((s) => s.deals.includes(deal)) // 2차: 상품
    .map((s) => ({ ...s.quote(deal, input), sourceLabel: s.label })); // 연산
}

/** 견적 가능한 행 중 최저 월납입 캐피탈명 (없으면 null) */
export function lowestCapital(rows: CapitalQuoteRow[]): string | null {
  const usable = rows.filter(
    (r): r is CapitalQuoteRow & { monthlyPayment: number } =>
      r.available && typeof r.monthlyPayment === "number",
  );
  if (usable.length === 0) return null;
  return usable.reduce((a, b) => (b.monthlyPayment < a.monthlyPayment ? b : a)).capital;
}
