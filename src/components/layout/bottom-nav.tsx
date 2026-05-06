"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
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

// 활성 탭 색상 — 사용자 액센트 컬러 (data-accent) 따라감. 미지정 시 forest green.
// CSS 변수를 직접 쓰면 다크모드/액센트 변경 즉시 반영.
const ACTIVE_COLOR = "var(--accent-color, #219143)";

export default function BottomNav() {
  const pathname = usePathname();
  const currentUser = useCurrentUser();
  const profileActive = pathname === "/profile" || pathname.startsWith("/profile/");

  const isActive = (item: NavItem): boolean => {
    if (pathname === item.href || pathname.startsWith(item.href + "/")) return true;
    if (item.also?.some((p) => pathname === p || pathname.startsWith(p + "/"))) return true;
    return false;
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur-lg md:hidden pb-safe">
      <div className="flex h-14 items-stretch justify-around">
        {navItems.map((item) => {
          const active = isActive(item);
          return (
            <Link
              key={item.label}
              href={item.href}
              style={active ? { color: ACTIVE_COLOR } : undefined}
              className={cn(
                "relative flex flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[11px] active:bg-accent/50 active:scale-95 transition-transform duration-200",
                active ? "font-semibold" : "text-muted-foreground"
              )}
            >
              {/* 액티브 알약 — layoutId 로 탭 전환 시 부드럽게 슬라이드. 액센트 컬러 soft 톤. */}
              {active && (
                <motion.span
                  layoutId="bottom-nav-active-pill"
                  className="absolute inset-x-2 top-1.5 bottom-1.5 -z-10 rounded-xl bg-accent-color-soft"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
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
            "relative flex flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[11px] active:bg-accent/50 active:scale-95 transition-transform duration-200",
            profileActive ? "font-semibold" : "text-muted-foreground"
          )}
        >
          {profileActive && (
            <motion.span
              layoutId="bottom-nav-active-pill"
              className="absolute inset-x-2 top-1.5 bottom-1.5 -z-10 rounded-xl bg-accent-color-soft"
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
            />
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
