import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Montserrat } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/layout/app-shell";
import { Toaster } from "@/components/ui/sonner";
import { QueryProvider } from "@/components/providers/query-provider";
import { SwRegister } from "@/components/providers/sw-register";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// D-day 임베드 — 원본 iframe 시절 사용하던 Montserrat 복원. 700/900 무게만.
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["700", "900"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "매일 캘린더",
  description: "캘린더, 가계부, 메모, 영양제 비교",
  // PWA + iOS 홈화면 추가 시 보이는 아이콘. manifest.ts 의 icons 와 함께 작동.
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    // iOS Safari 홈화면 추가 — apple-touch-icon. 512 를 시스템이 자동 downscale.
    apple: { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // maximumScale 미지정 — 사용자 핀치 줌 허용 (WCAG 1.4.4 접근성).
  // iOS Safari 자동 줌은 input·textarea·select 글자크기 16px 이상으로 방지.
  themeColor: "#0F172A",
  viewportFit: "cover",
  // resizes-content: 키보드가 올라오면 layout viewport 자체가 축소.
  // 100dvh, 바텀시트 bottom:0 등이 자동으로 키보드 위에 맞춰짐 → JS 오프셋
  // 계산 불필요. FormPage 는 100dvh 를 그대로 쓰고, 내부 flex-1 overflow-y-auto
  // 가 자연스럽게 줄어 Textarea 가림 해소.
  interactiveWidget: "resizes-content",
};

/**
 * 다크모드 FOUC 제거 — React hydrate 전에 <html> 에 .dark 클래스를 적용.
 *
 * 기본 동작: 시스템 모드(OS prefers-color-scheme 따라감).
 *  - localStorage.theme === "light" → 라이트 강제
 *  - localStorage.theme === "dark" → 다크 강제
 *  - 그 외(저장값 없음 / "system") → OS 설정 따라감
 *
 * try/catch — localStorage 차단 환경에서도 무해.
 */
const themeBootScript = `(function(){try{var t=localStorage.getItem('theme');var sysDark=window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||((!t||t==='system')&&sysDark)){document.documentElement.classList.add('dark');}var a=localStorage.getItem('accent');if(a){document.documentElement.setAttribute('data-accent',a);}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} ${montserrat.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* 첫 paint 전에 테마 적용 — 라이트→다크 깜빡임 방지. */}
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <QueryProvider>
          <AppShell>{children}</AppShell>
          <Toaster richColors position="top-center" />
          <SwRegister />
        </QueryProvider>
      </body>
    </html>
  );
}
