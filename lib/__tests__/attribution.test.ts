import { beforeEach, describe, expect, it, vi } from "vitest";

// 이 저장소는 jsdom 없이 순수 Node 환경에서 vitest를 돌린다(다른 테스트도
// 전부 그렇다) — attribution.ts가 쓰는 window.location/localStorage를
// 최소한으로 직접 스텁한다.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(k: string) {
    return this.store.has(k) ? this.store.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.store.set(k, v);
  }
  removeItem(k: string) {
    this.store.delete(k);
  }
  clear() {
    this.store.clear();
  }
}

const memoryStorage = new MemoryStorage();
const globalAny = globalThis as unknown as {
  localStorage: MemoryStorage;
  window: { location: { search: string; pathname: string } };
};
globalAny.localStorage = memoryStorage;
globalAny.window = { location: { search: "", pathname: "/" } };

function setUrl(search: string) {
  globalAny.window.location.search = search;
}

// 모듈은 최상단에서 window.location을 참조하지 않고 함수 호출 시점에만
// 읽으므로, 스텁을 먼저 세팅한 뒤 동적 import해도 안전하다.
const { captureAttribution, formatAttributionForMessage } = await import("../attribution");

describe("captureAttribution", () => {
  beforeEach(() => {
    memoryStorage.clear();
    setUrl("");
  });

  it("URL에 추적 파라미터가 없고 저장된 값도 없으면 null", () => {
    expect(captureAttribution()).toBeNull();
  });

  it("첫 방문에서 utm_source/ref를 저장한다", () => {
    setUrl("?utm_source=instagram&utm_medium=story&ref=인스타디엠");
    const a = captureAttribution();
    expect(a?.utmSource).toBe("instagram");
    expect(a?.utmMedium).toBe("story");
    expect(a?.ref).toBe("인스타디엠");
  });

  it("UTM은 최초 유입값을 유지한다(첫 터치 고정)", () => {
    setUrl("?utm_source=instagram");
    captureAttribution();
    setUrl("?utm_source=naver");
    const a = captureAttribution();
    expect(a?.utmSource).toBe("instagram");
  });

  it("ref는 방문마다 최신 값으로 갱신된다", () => {
    setUrl("?ref=철수");
    captureAttribution();
    setUrl("?ref=영희");
    const a = captureAttribution();
    expect(a?.ref).toBe("영희");
  });

  it("파라미터 없이 재방문하면 저장된 값을 그대로 돌려준다", () => {
    setUrl("?utm_source=instagram&ref=철수");
    captureAttribution();
    setUrl("");
    const a = captureAttribution();
    expect(a?.utmSource).toBe("instagram");
    expect(a?.ref).toBe("철수");
  });

  it("localStorage 저장 실패해도(프라이빗 브라우징 등) 예외를 던지지 않는다", () => {
    const spy = vi.spyOn(memoryStorage, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    setUrl("?ref=철수");
    expect(() => captureAttribution()).not.toThrow();
    spy.mockRestore();
  });
});

describe("formatAttributionForMessage", () => {
  it("null이면 빈 문자열", () => {
    expect(formatAttributionForMessage(null)).toBe("");
  });

  it("ref와 utm을 한글 라벨로 조립한다", () => {
    const msg = formatAttributionForMessage({
      ref: "철수",
      utmSource: "instagram",
      utmMedium: "story",
      utmCampaign: "summer",
    });
    expect(msg).toContain("추천인 코드: 철수");
    expect(msg).toContain("유입경로: instagram / story / summer");
  });

  it("값이 하나도 없으면 빈 문자열", () => {
    expect(formatAttributionForMessage({})).toBe("");
  });
});
