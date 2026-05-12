"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Calendar,
  Plane,
  PiggyBank,
  ShoppingBag,
  BookOpen,
  User,
  Settings,
  Sun,
  Moon,
  Monitor,
  Search,
} from "lucide-react";

/**
 * ⌘K / Ctrl+K 빠른 이동 팔레트. AppShell 에서 전역 키 리스너로 토글.
 * 페이지 이동 + 테마 전환만 — 데이터에 결합되지 않아 안전. cmdk 의 기본 필터로
 * 라벨·키워드(한/영) 부분 검색.
 */
interface PaletteCommand {
  group: string;
  label: string;
  icon: React.ElementType;
  keywords?: string;
  run: () => void;
}

function flashThemeTransition() {
  const root = document.documentElement;
  root.classList.add("theme-transition");
  window.setTimeout(() => root.classList.remove("theme-transition"), 320);
}

export default function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();

  const go = React.useCallback(
    (href: string) => {
      router.push(href);
      onOpenChange(false);
    },
    [router, onOpenChange],
  );

  const setTheme = React.useCallback(
    (t: "system" | "light" | "dark") => {
      localStorage.setItem("theme", t);
      flashThemeTransition();
      const root = document.documentElement;
      if (t === "dark") root.classList.add("dark");
      else if (t === "light") root.classList.remove("dark");
      else if (window.matchMedia("(prefers-color-scheme: dark)").matches) root.classList.add("dark");
      else root.classList.remove("dark");
      onOpenChange(false);
    },
    [onOpenChange],
  );

  const commands: PaletteCommand[] = React.useMemo(
    () => [
      { group: "이동", label: "캘린더", icon: Calendar, keywords: "calendar 달력 일정", run: () => go("/calendar") },
      { group: "이동", label: "여행", icon: Plane, keywords: "travel trip 데이트 여행지", run: () => go("/travel") },
      { group: "이동", label: "여행 계획", icon: Plane, keywords: "travel plans 일정표 동선", run: () => go("/travel/plans") },
      { group: "이동", label: "가계부", icon: PiggyBank, keywords: "finance money 지출 수입 돈", run: () => go("/finance") },
      { group: "이동", label: "쇼핑기록", icon: ShoppingBag, keywords: "products 제품 영양제 구매 단가", run: () => go("/products") },
      { group: "이동", label: "지식창고", icon: BookOpen, keywords: "knowledge note 메모 노트 폴더", run: () => go("/knowledge") },
      { group: "이동", label: "내 프로필", icon: User, keywords: "profile 계정 아바타", run: () => go("/profile") },
      { group: "이동", label: "설정", icon: Settings, keywords: "settings 환경설정 테마 api", run: () => go("/settings") },
      { group: "테마", label: "라이트 모드", icon: Sun, keywords: "light bright 밝게", run: () => setTheme("light") },
      { group: "테마", label: "다크 모드", icon: Moon, keywords: "dark night 어둡게", run: () => setTheme("dark") },
      { group: "테마", label: "시스템 테마", icon: Monitor, keywords: "system auto 자동", run: () => setTheme("system") },
    ],
    [go, setTheme],
  );

  const groups = React.useMemo(() => Array.from(new Set(commands.map((c) => c.group))), [commands]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showBackButton={false}
        className="max-w-[calc(100%-2rem)] gap-0 overflow-hidden p-0 sm:max-w-lg"
      >
        <DialogTitle className="sr-only">빠른 이동</DialogTitle>
        <Command loop className="flex flex-col">
          <div className="flex items-center gap-2 border-b px-3.5">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <Command.Input
              autoFocus
              placeholder="페이지·동작 검색…"
              className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <Command.List className="max-h-[min(60vh,22rem)] overflow-y-auto overscroll-contain p-2">
            <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
              결과 없음
            </Command.Empty>
            {groups.map((g) => (
              <Command.Group
                key={g}
                heading={g}
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                {commands
                  .filter((c) => c.group === g)
                  .map((c) => {
                    const Icon = c.icon;
                    return (
                      <Command.Item
                        key={c.label}
                        value={`${c.label} ${c.keywords ?? ""}`}
                        onSelect={c.run}
                        className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                      >
                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="flex-1 truncate">{c.label}</span>
                      </Command.Item>
                    );
                  })}
              </Command.Group>
            ))}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
