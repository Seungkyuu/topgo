/**
 * Excel 호환 금융/반올림 함수.
 * 캐피탈사 엑셀의 PMT/ROUNDUP/ROUNDDOWN 동작을 그대로 재현해 오차 0을 보장한다.
 */

/** Excel PMT(rate, nper, pv, fv=0, type=0) 와 동일한 규약(부호 포함). */
export function excelPmt(
  rate: number,
  nper: number,
  pv: number,
  fv = 0,
  type: 0 | 1 = 0,
): number {
  if (rate === 0) return -(pv + fv) / nper;
  const p = Math.pow(1 + rate, nper);
  return (-(pv * p + fv) / ((p - 1) / rate)) / (1 + rate * type);
}

/** Excel ROUNDUP: 0에서 멀어지는 방향으로 digits 자리까지 올림(음수 digits = 정수부). */
export function roundUp(value: number, digits: number): number {
  const f = Math.pow(10, digits);
  const scaled = value * f;
  const rounded =
    scaled >= 0 ? Math.ceil(scaled - 1e-6) : Math.floor(scaled + 1e-6);
  // 음수 digits는 정수 곱으로 복원해 부동소수 잡음 제거 (rounded / 1e-4 ≠ rounded * 1e4)
  const result = digits < 0 ? rounded * Math.pow(10, -digits) : rounded / f;
  return result === 0 ? 0 : result; // -0 정규화
}

/** Excel ROUNDDOWN: 0을 향해 digits 자리까지 버림(음수 digits = 정수부). */
export function roundDown(value: number, digits: number): number {
  const f = Math.pow(10, digits);
  const scaled = value * f;
  const rounded =
    scaled >= 0 ? Math.floor(scaled + 1e-6) : Math.ceil(scaled - 1e-6);
  const result = digits < 0 ? rounded * Math.pow(10, -digits) : rounded / f;
  return result === 0 ? 0 : result; // -0 정규화
}

/**
 * 보증금율·선납율 같은 "차량가 대비 비율" 입력값이 0~100%(0~1) 범위를 벗어나면
 * 즉시 에러로 막는다. 실제 엑셀에도 "보증+선수(선납)+잔가 100%초과" 같은 상한
 * 체크가 있는데(IF AI3>=2 ... >100%), 그 취지를 각 엔진 입구에서 재현한다.
 * label은 에러 메시지에 그대로 노출되는 필드명이다.
 */
export function assertRatio(label: string, value: number): void {
  if (value < 0 || value > 1) {
    throw new Error(`${label}은(는) 0~100% 사이여야 합니다`);
  }
}

/**
 * 고객 실효금리(표시용) — 캐피탈사별 내부 금리 산정 방식이 달라도
 * 동일한 기준으로 비교할 수 있는 "체감 금리"를 결과값에서 역산한다.
 * 카랩 등 비교 플랫폼이 쓰는 방식과 동일한 단순(비복리) 근사식이다.
 *
 *   실효금리 = ((월납입액 × 개월수) + (잔가 − 취득원가)) / (개월수/12) / 취득원가
 *
 * ⚠ PMT의 진짜 복리금리(annualRate)와는 다른 값이다. 계산에 넣는 입력이 아니라
 *   결과를 고객에게 "몇 % 짜리 상품인지" 감 잡게 보여주는 표시 전용 지표.
 */
export function impliedCustomerRate(
  monthlyPayment: number,
  termMonths: number,
  residualValue: number,
  acquisitionCost: number,
): number {
  if (acquisitionCost === 0) return 0;
  const years = termMonths / 12;
  const totalCost = monthlyPayment * termMonths + residualValue - acquisitionCost;
  return totalCost / years / acquisitionCost;
}

/**
 * Excel RATE(nper, pmt, pv, fv=0, type=0) — 뉴턴법으로 주기 이자율을 역산.
 * 신한 렌터카 엑셀이 PMT로 구한 결과를 다시 RATE로 역산해 "표시금리"를
 * 산출하는 구조(BG18→BH18)를 재현하는 데 쓴다.
 */
export function excelRate(
  nper: number,
  pmt: number,
  pv: number,
  fv = 0,
  guess = 0.006,
): number {
  let r = guess;
  for (let i = 0; i < 100; i++) {
    const f = (r === 0 ? nper : (Math.pow(1 + r, nper) - 1) / r) as number;
    const value = pv * Math.pow(1 + r, nper) + pmt * f + fv;
    const dr = 1e-8;
    const f2 = (Math.pow(1 + r + dr, nper) - 1) / (r + dr);
    const value2 = pv * Math.pow(1 + r + dr, nper) + pmt * f2 + fv;
    const deriv = (value2 - value) / dr;
    if (deriv === 0) break;
    const next = r - value / deriv;
    if (Math.abs(next - r) < 1e-12) {
      r = next;
      break;
    }
    r = next;
  }
  return r;
}
