"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bell } from "lucide-react";
import { useNotifications } from "@/hooks/use-notifications";
import NotificationsPanel from "./notifications-panel";

interface Props {
  title: React.ReactNode;
  /** 타이틀 왼쪽에 뒤로가기 ← 버튼 표시 (기본 router.back()) */
  showBack?: boolean;
  /** showBack=true 일 때 클릭 핸들러 오버라이드 — 지정 안 하면 router.back() */
  onBack?: () => void;
  /** 타이틀 아래에 부제/서브텍스트 */
  subtitle?: React.ReactNode;
  /** 타이틀과 bell 사이에 페이지별 액션 (예: + 추가 버튼) */
  actions?: React.ReactNode;
  /** 기본값 true — 우측 끝에 알림 벨 표시 */
  showBell?: boolean;
  /** 기본값 true — sticky/backdrop. 모달(FormPage) 안에서는 false 로. */
  sticky?: boolean;
}

/**
 * 모바일/데스크톱 공용 페이지 헤더.
 * 모든 페이지가 같은 높이와 여백을 쓰도록 표준화.
 * 좌측: (옵션) 뒤로가기 + 타이틀
 * 우측: actions + 알림 벨
 */
export default function PageHeader({
  title,
  showBack,
  onBack,
  subtitle,
  actions,
  showBell = false,
  sticky = true,
}: Props) {
  const router = useRouter();
  const [notiOpen, setNotiOpen] = useState(false);
  const { unreadCount } = useNotifications();

  const handleBack = onBack ?? (() => router.back());
  const stickyCls = sticky
    ? "sticky top-0 z-30 bg-background/95 backdrop-blur-sm"
    : "";

  return (
    <>
      <header className={`${stickyCls} flex h-14 shrink-0 items-center gap-2 border-b px-4`}>
        {showBack && (
          <button
            type="button"
            onClick={handleBack}
            aria-label="뒤로"
            // 모바일 터치 권장 44px 확보 — 시각 아이콘은 그대로, hit area 만 확장.
            className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-accent -ml-2"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <div className="flex flex-col min-w-0 flex-1">
          <h1 className="text-lg font-bold leading-tight truncate">{title}</h1>
          {subtitle && (
            <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {actions}
          {showBell && (
            <button
              type="button"
              onClick={() => setNotiOpen(true)}
              aria-label="알림"
              className="relative flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
            >
              <Bell className="h-[22px] w-[22px]" strokeWidth={1.6} />
              {unreadCount > 0 && (
                <span className="absolute top-2 right-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground ring-2 ring-background">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
          )}
        </div>
      </header>
      <NotificationsPanel open={notiOpen} onOpenChange={setNotiOpen} />
    </>
  );
}
