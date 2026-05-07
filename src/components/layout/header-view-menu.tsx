"use client";

import { motion } from "motion/react";

export interface HeaderViewMenuItem {
  key: string;
  label: string;
  icon: React.ElementType;
  active?: boolean;
  onSelect: () => void;
}

/**
 * PageHeader actions 슬롯의 뷰 전환 컨트롤.
 *
 * 이전: 햄버거 + 드롭다운(N개 항목 숨김). 항목이 2개뿐이라 hidden nav 패턴이
 * 발견성을 깎아먹는다는 리뷰가 있어서, 모든 항목을 인라인 아이콘 버튼으로 직접
 * 노출. 활성 항목은 primary 톤 + bg 강조.
 *
 * 활성 상태 애니메이션:
 *  - 활성 버튼 뒤에 motion.span(layoutId="header-view-menu-pill") 로 둥근 배경.
 *  - 다른 버튼 클릭 시 spring 으로 부드럽게 슬라이드.
 *  - 같은 menu instance 안에서만 layoutId 공유되도록 prefix 화 — 한 페이지에 여러
 *    HeaderViewMenu 가 동시 마운트되는 케이스 대비.
 */
export default function HeaderViewMenu({ items }: { items: HeaderViewMenuItem[] }) {
  // 같은 페이지 내 다중 인스턴스 충돌 회피를 위해 menu items 의 key 들로 layoutId 생성.
  const layoutId = `hvm-pill-${items.map((i) => i.key).join("-")}`;

  return (
    <div className="flex items-center gap-1">
      {items.map(({ key, label, icon: Icon, active, onSelect }) => (
        <button
          key={key}
          type="button"
          onClick={onSelect}
          aria-label={label}
          aria-current={active ? "page" : undefined}
          className={`relative flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
            active
              ? "text-primary"
              : "text-muted-foreground hover:bg-accent"
          }`}
        >
          {/* 활성 알약 — layoutId 로 탭 전환 시 부드럽게 슬라이드. */}
          {active && (
            <motion.span
              layoutId={layoutId}
              className="absolute inset-0 -z-0 rounded-full bg-primary/10"
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
            />
          )}
          <Icon
            className="relative z-10 h-[20px] w-[20px]"
            strokeWidth={active ? 1.8 : 1.6}
          />
        </button>
      ))}
    </div>
  );
}
