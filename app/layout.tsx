import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "./providers";

const TITLE = "렌토(RENTO) — 자동차 장기렌트·리스·법인 리스 비교";
const DESCRIPTION =
  "렌토(RENTO)는 자동차 장기렌트·리스·법인 리스 견적을 여러 금융사와 실시간으로 비교하는 플랫폼입니다. 차량을 고르면 최저가를 바로 확인할 수 있어요.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "렌토",
    "RENTO",
    "자동차 리스",
    "장기렌트",
    "법인 리스",
    "법인차 리스",
    "리스 비교",
    "렌트 비교",
    "장기렌트 비교",
    "차량 리스",
  ],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "https://rento-project.vercel.app",
    siteName: "렌토(RENTO)",
    locale: "ko_KR",
    type: "website",
  },
  verification: {
    google: "Rw6U5zAI7wwxTD1-FyYmEms1kEsq9OgffTeHF6tOyOg",
    other: {
      "naver-site-verification": "1d7fc30cf0d998623e9414bcd8f5703a91af6596",
    },
  },
};

const ORG_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "주식회사 RENTO",
  alternateName: "렌토",
  url: "https://rento-project.vercel.app",
  description: DESCRIPTION,
  address: {
    "@type": "PostalAddress",
    streetAddress: "선릉로 129길 25",
    addressLocality: "강남구",
    addressRegion: "서울특별시",
    addressCountry: "KR",
  },
  sameAs: ["https://blog.naver.com/leenkim_lease_"],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* Pretendard — 한국 금융앱 사실상 표준 서체(카카오뱅크·K뱅크 등).
            동적 서브셋 CDN이라 실제 쓰는 글자만 내려받는다. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        {/* 하이드레이션 전에 저장된 테마를 먼저 적용 — 라이트→다크 깜빡임 방지.
            기본값은 시스템 설정과 무관하게 항상 라이트 — 사용자가 토글을
            직접 눌러야만 다크로 바뀐다(시스템이 다크면 자동으로 어두워지는
            동작 없음). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('rento-theme')||'light';document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`,
          }}
        />
        {/* 검색엔진에 회사 정보를 구조화 데이터로 제공 — 네이버·구글 검색결과에
            상호·주소가 더 풍부하게 노출되도록 돕는다. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_JSON_LD) }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
