import { ImageResponse } from "next/og";

// 빌드 시점에 PNG로 미리 생성해 CDN 정적 자산으로 서빙한다. edge 런타임으로
// 두면 요청마다 즉석 렌더라 렌더 오류가 빌드에서 안 잡히고 요청 시점에만
// 터진다(스크래퍼는 이미지를 못 받아 조용히 옛 캐시를 노출한다).
export const alt = "탑고 — 자동차 장기렌트·리스·법인 리스 최저가 랭킹 비교";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "#14170f",
          color: "#f5f6f4",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              border: "3px solid #f5f6f4",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 30,
              fontWeight: 800,
            }}
          >
            T
          </div>
          <div style={{ display: "flex", fontSize: 44, fontWeight: 800, letterSpacing: -1 }}>
            <span>TOP</span>
            <span style={{ color: "#34e37a" }}>G</span>
            <span>O</span>
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 40, fontWeight: 800, marginTop: 48, lineHeight: 1.4 }}>
          자동차 장기렌트·리스·법인 리스
        </div>
        <div style={{ display: "flex", fontSize: 40, fontWeight: 800, lineHeight: 1.4 }}>
          최저가 랭킹으로 한눈에 비교
        </div>
        <div style={{ display: "flex", fontSize: 24, color: "#7fe3a0", marginTop: 24 }}>
          Top Choice, Go Further
        </div>
      </div>
    ),
    { ...size },
  );
}
