import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/layout/app-shell";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "매일 캘린더",
  description: "캘린더, 가계부, 메모, 영양제 비교",
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
 * 정책: 사용자가 명시적으로 "dark" 또는 "system" 을 고른 경우에만 적용.
 *  - localStorage.theme === "dark" → .dark 적용
 *  - localStorage.theme === "system" → OS 가 dark 면 .dark 적용
 *  - 그 외(저장값 없음 / "light") → 라이트 (기본). OS 가 dark 여도 따라가지 않음.
 *
 * 처음 진입 사용자는 라이트로 시작 — 사용자 본인이 의도하지 않은 다크 적용 방지.
 *
 * try/catch — localStorage 차단 환경에서도 무해.
 */
const themeBootScript = `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'){document.documentElement.classList.add('dark');}else if(t==='system'){if(window.matchMedia('(prefers-color-scheme: dark)').matches){document.documentElement.classList.add('dark');}}var a=localStorage.getItem('accent');if(a){document.documentElement.setAttribute('data-accent',a);}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* 첫 paint 전에 테마 적용 — 라이트→다크 깜빡임 방지. */}
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <AppShell>{children}</AppShell>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
