"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calendar,
  Plane,
  PiggyBank,
  BookOpen,
  PanelLeftClose,
  PanelLeftOpen,
  Bell,
  Settings,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import NotificationsPanel from "./notifications-panel";
import { useCurrentUser } from "@/lib/current-user";
import { useNotifications } from "@/hooks/use-notifications";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  /** /calendar 는 하위 파라미터(?view=database 등)가 있어도 active 를 유지해야 하므로 플래그. */
  isCalendarDefault?: boolean;
}

const navItems: NavItem[] = [
  { href: "/calendar", label: "캘린더", icon: Calendar, isCalendarDefault: true },
  { href: "/travel", label: "여행", icon: Plane },
  { href: "/finance", label: "가계부", icon: PiggyBank },
  { href: "/knowledge", label: "지식창고", icon: BookOpen },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const [notiOpen, setNotiOpen] = useState(false);
  const currentUser = useCurrentUser();
  const { unreadCount } = useNotifications();

  const isActive = (item: NavItem): boolean => {
    if (item.isCalendarDefault) {
      return pathname === "/calendar";
    }
    return pathname === item.href || pathname.startsWith(item.href + "/");
  };

  return (
    <aside
      // 데스크탑: fixed 로 화면 왼쪽에 상주. document-level 스크롤과 독립.
      // bg-background 로 콘텐츠가 뒤에 비치지 않게.
      className={cn(
        "hidden md:fixed md:left-0 md:top-0 md:z-30 md:flex md:flex-col md:border-r md:bg-background transition-all duration-200 md:h-dvh",
        collapsed ? "md:w-14" : "md:w-52"
      )}
    >
      <div
        className={cn(
          // h-14 — PageHeader 와 같은 높이로 구분선 정렬.
          "flex h-14 items-center border-b",
          collapsed ? "justify-center" : "justify-end px-2"
        )}
      >
        <button
          onClick={onToggle}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          title={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
      </div>

      <nav
        className={cn(
          "flex flex-1 flex-col gap-0.5 pt-2",
          collapsed ? "px-1.5" : "px-2"
        )}
      >
        {navItems.map((item) => {
          const active = isActive(item);
          // 지식창고는 페이지 자체에 왼쪽 트리 탐색기가 있어 앱 사이드바가 열려있으면
          // 세로 영역이 부족 → 클릭 시 앱 사이드바 자동 접기.
          const autoCollapse = item.href.startsWith("/knowledge");
          return (
            <Link
              key={item.label}
              href={item.href}
              title={collapsed ? item.label : undefined}
              onClick={() => {
                // 지식창고 → 접힘(공간 확보). 다른 페이지 → 접혀 있었으면 자동 펼침.
                if (autoCollapse && !collapsed) onToggle();
                else if (!autoCollapse && collapsed) onToggle();
              }}
              className={cn(
                "flex items-center rounded-md transition-all duration-200 tap-feedback",
                collapsed
                  ? "justify-center p-2.5"
                  : "gap-2.5 px-2.5 py-1.5 text-[13px]",
                active
                  ? "bg-accent-color-soft font-medium"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground hover:translate-x-0.5"
              )}
              style={
                active
                  ? { color: "var(--accent-color, var(--foreground))" }
                  : undefined
              }
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* 하단: 알림 / 설정 / 프로필 — 작업표시줄에 가려지지 않도록 pb 여유 */}
      <div
        className={cn(
          "border-t py-2 pb-3 flex items-center shrink-0",
          collapsed
            ? "flex-col justify-center gap-1"
            : "gap-1 px-2 justify-between"
        )}
      >
        <div className={cn("flex items-center gap-1", collapsed && "flex-col")}>
          <button
            onClick={() => setNotiOpen(true)}
            title="알림"
            className="relative rounded-md p-2 text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute top-0.5 right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
          <Link
            href="/settings"
            title="설정"
            className="rounded-md p-2 text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
          >
            <Settings className="h-4 w-4" />
          </Link>
        </div>

        <Link
          href="/profile"
          title={currentUser ? currentUser.name : "프로필"}
          className="rounded-md p-1 hover:bg-accent transition-colors"
        >
          {currentUser ? (
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full text-sm overflow-hidden"
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
            <User className="h-5 w-5 text-muted-foreground" />
          )}
        </Link>
      </div>

      <NotificationsPanel open={notiOpen} onOpenChange={setNotiOpen} />
    </aside>
  );
}
