import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "렌토(RENTO) — 자동차 장기렌트·리스·법인 리스 비교";
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
          background: "#0f2044",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              border: "3px solid #ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 30,
              fontWeight: 800,
            }}
          >
            R
          </div>
          <div style={{ display: "flex", fontSize: 44, fontWeight: 800, letterSpacing: -1 }}>
            <span>REN</span>
            <span style={{ color: "#3dd6e8" }}>T</span>
            <span>O</span>
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 40, fontWeight: 800, marginTop: 48, lineHeight: 1.4 }}>
          자동차 장기렌트·리스·법인 리스
        </div>
        <div style={{ display: "flex", fontSize: 40, fontWeight: 800, lineHeight: 1.4 }}>
          여러 금융사 견적을 한 번에 비교
        </div>
        <div style={{ display: "flex", fontSize: 24, color: "#a9bcf2", marginTop: 24 }}>
          RENTO — Driven by Precision
        </div>
      </div>
    ),
    { ...size },
  );
}
