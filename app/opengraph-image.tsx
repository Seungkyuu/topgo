import { ImageResponse } from "next/og";

export const runtime = "edge";
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
