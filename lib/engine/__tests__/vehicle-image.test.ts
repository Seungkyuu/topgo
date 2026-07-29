import { describe, expect, it } from "vitest";
import { imageForVehicle } from "../vehicle-image";
import { buildVehicleIndex } from "../vehicle-index";

describe("차량 이미지 매칭 (겟챠 모델 단위 사진)", () => {
  it("BMW 트림을 계열 사진으로 연결한다", () => {
    // 320i·M340i 는 모두 3시리즈 사진
    expect(imageForVehicle("BMW", "320i M Sport (P1)")).toMatch(/^\/car-img\//);
    expect(imageForVehicle("BMW", "M340i 프로")).toBe(imageForVehicle("BMW", "320i (P1)"));
    // X5 는 X5 사진 (X5M 아님)
    const x5 = imageForVehicle("BMW", "X5 xDrive 40d M Sport");
    expect(x5).toMatch(/^\/car-img\//);
    expect(x5).not.toBe(imageForVehicle("BMW", "X5M"));
  });

  it("계열 숫자가 다르면 다른 사진을 준다", () => {
    const s3 = imageForVehicle("BMW", "320i M Sport");
    const s5 = imageForVehicle("BMW", "530e xDrive");
    expect(s3).toBeTruthy();
    expect(s5).toBeTruthy();
    expect(s3).not.toBe(s5);
  });

  it("겟챠 데이터에 아예 없는 브랜드는 undefined (모노그램 폴백)", () => {
    expect(imageForVehicle("존재하지않는브랜드", "아무 모델")).toBeUndefined();
  });

  it("국산차도 모델 사진에 연결된다 (28개 브랜드 전체 시드)", () => {
    expect(imageForVehicle("현대", "그랜저 2.5")).toMatch(/^\/car-img\//);
    expect(imageForVehicle("기아", "쏘렌토 하이브리드")).toMatch(/^\/car-img\//);
  });

  it("인덱스의 BMW 차량 상당수가 이미지를 얻고, 얻은 건 모두 유효 URL이다", () => {
    const index = buildVehicleIndex();
    const bmw = index.filter((v) => v.brand === "BMW");
    const withImg = bmw.filter((v) => v.image);
    expect(withImg.length).toBeGreaterThan(bmw.length * 0.5);
    for (const v of withImg) {
      expect(v.image).toMatch(/^\/car-img\//);
    }
  });

  it("국산차(현대/기아/제네시스) 인덱스도 상당수 이미지가 연결된다", () => {
    const index = buildVehicleIndex();
    const domestic = index.filter((v) => ["현대", "기아", "제네시스"].includes(v.brand));
    const withImg = domestic.filter((v) => v.image);
    expect(withImg.length).toBeGreaterThan(domestic.length * 0.3);
  });

  it("'클래스' 같은 장식성 접미사 때문에 매칭이 통째로 실패하지 않는다 (벤츠)", () => {
    // 겟챠 모델명 "E-클래스"의 "클래스"는 영문 라벨에 절대 안 나오는
    // 장식어라, 이걸 무시하지 않으면 벤츠 전 모델이 매칭 실패한다.
    expect(imageForVehicle("벤츠", "E 300 4M AMG Line")).toMatch(/^\/car-img\//);
    const index = buildVehicleIndex();
    const benz = index.filter((v) => v.brand === "벤츠");
    const withImg = benz.filter((v) => v.image);
    expect(withImg.length).toBeGreaterThan(benz.length * 0.5);
  });

  it("마이바흐(영문 라벨)는 S-클래스가 아니라 마이바흐 사진으로 연결된다", () => {
    // "Maybach"(영문)는 겟챠의 "마이바흐"(한글)와 안 겹쳐서, 예전엔 아무
    // 브랜드 사진('그 브랜드 첫 항목')이나 'S' 한 글자가 겹치는 S-클래스로
    // 잘못 매칭됐다(플래그십이 소형 해치백/일반 세단 사진으로 뜨는 사고).
    const maybach1 = imageForVehicle("벤츠", "Mercedes-Maybach S580");
    const maybach2 = imageForVehicle("벤츠", "Maybach S 580 4MATIC");
    const sClass = imageForVehicle("벤츠", "S 450 4M");
    expect(maybach1).toMatch(/^\/car-img\//);
    expect(maybach1).toBe(maybach2);
    expect(maybach1).not.toBe(sClass);
  });

  it("토큰이 하나도 안 겹치면 undefined — 브랜드의 아무 사진이나 주지 않는다", () => {
    // '그 브랜드 첫 항목'을 마지막 폴백으로 쓰던 예전 로직 재발 방지
    expect(imageForVehicle("벤츠", "완전히 관련 없는 임의의 라벨 zzz")).toBeUndefined();
  });
});
