"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarBlank,
  AirplaneTilt,
  PiggyBank,
  Book,
  User,
  type IconProps,
} from "@phosphor-icons/react";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/lib/current-user";
import { useNotifications } from "@/hooks/use-notifications";
import { useNavBadges } from "@/hooks/use-nav-badges";

// 모바일 하단 네비. 캘린더 | 여행 | 가계부 | 지식 | 프로필

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<IconProps>;
  /** 추가 match path prefix */
  also?: string[];
};

const navItems: NavItem[] = [
  { href: "/calendar", label: "캘린더", icon: CalendarBlank },
  { href: "/travel", label: "여행", icon: AirplaneTilt },
  { href: "/finance", label: "가계부", icon: PiggyBank, also: ["/products"] },
  { href: "/knowledge", label: "지식", icon: Book },
];

// 활성 탭 색상 — forest green (#219143).
const ACTIVE_COLOR = "#219143";

export default function BottomNav() {
  const pathname = usePathname();
  const currentUser = useCurrentUser();
  const { unreadCount } = useNotifications();
  const { todayEvents, todayFixed } = useNavBadges();
  const profileActive = pathname === "/profile" || pathname.startsWith("/profile/");

  const isActive = (item: NavItem): boolean => {
    if (pathname === item.href || pathname.startsWith(item.href + "/")) return true;
    if (item.also?.some((p) => pathname === p || pathname.startsWith(p + "/"))) return true;
    return false;
  };

  /** 각 탭별 뱃지 카운트 — 0이면 표시 안 함. */
  const badgeFor = (href: string): number => {
    if (href === "/calendar") return todayEvents;
    if (href === "/finance") return todayFixed;
    return 0;
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur-lg md:hidden pb-safe">
      <div className="flex h-14 items-stretch justify-around">
        {navItems.map((item) => {
          const active = isActive(item);
          const badge = badgeFor(item.href);
          return (
            <Link
              key={item.label}
              href={item.href}
              style={active ? { color: ACTIVE_COLOR } : undefined}
              className={cn(
                "relative flex flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[11px] transition-all duration-200 active:bg-accent/50 active:scale-95",
                active ? "font-semibold" : "text-muted-foreground"
              )}
            >
              {/* 카운트 뱃지 — 9 초과 시 9+ 표기. 알림 빨간 닷과 위치 통일. */}
              {badge > 0 && (
                <span className="absolute top-1 right-[calc(50%-12px)] inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-semibold leading-none text-white">
                  {badge > 9 ? "9+" : badge}
                </span>
              )}
              <item.icon size={22} weight={active ? "fill" : "regular"} />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <Link
          href="/profile"
          style={profileActive ? { color: ACTIVE_COLOR } : undefined}
          className={cn(
            "relative flex flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[11px] transition-colors active:bg-accent/50",
            profileActive ? "font-semibold" : "text-muted-foreground"
          )}
        >
          {unreadCount > 0 && (
            <span className="absolute top-1 right-[calc(50%-2px)] h-2 w-2 rounded-full bg-red-500" />
          )}
          {currentUser ? (
            <span
              className="flex h-[22px] w-[22px] items-center justify-center rounded-full text-[11px] overflow-hidden"
              style={
                currentUser.avatar_url
                  ? { backgroundColor: "transparent" }
                  : {
                      backgroundColor: currentUser.color + "30",
                      color: currentUser.color,
                    }
              }
            >
              {currentUser.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={currentUser.avatar_url}
                  alt={currentUser.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                currentUser.emoji || currentUser.name[0]
              )}
            </span>
          ) : (
            <User size={22} weight={profileActive ? "fill" : "regular"} />
          )}
          <span>프로필</span>
        </Link>
      </div>
    </nav>
  );
}
