"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/layout/page-header";
import { useMediaQuery } from "@/lib/use-media-query";
import { useDialogStackEntry } from "@/lib/dialog-stack";

// 공용 폼 페이지 — Base UI Dialog 없는 버전.
// 이유: position:fixed Dialog + 포털 내부에선 모바일 Chrome 의 input focus 자동
// 스크롤이 깨져서 키보드 가림 현상 발생. 일반 DOM 요소 + position:fixed
// 직접 제어 + body overflow hidden 만 하면 브라우저 기본 동작이 잘 작동함.
//
// - 모바일: 전체 화면 오버레이 (fixed inset-0)
// - 데스크탑: 중앙 모달 (max-w-lg)
// - 상단 ← 뒤로가기 + 제목
// - 하단 취소/저장 footer
// - open 동안 body overflow hidden → 배경 스크롤 방지

interface FormPageProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  submitLabel?: string;
  cancelLabel?: string;
  submitDisabled?: boolean;
  saving?: boolean;
  /** hideFooter=true 일 때는 onSubmit 호출 경로가 없으므로 optional. */
  onSubmit?: () => void | Promise<void>;
  onCancel?: () => void;
  onBack?: () => void;
  /** 데스크탑 max-w 클래스 (기본 md:max-w-lg = 512px) */
  desktopMaxWidth?: string;
  headerExtra?: React.ReactNode;
  footerStart?: React.ReactNode;
  /** 저장/취소 푸터 숨김 — 옵션 선택 후 바로 닫히는 picker 류 사용. */
  hideFooter?: boolean;
  children: React.ReactNode;
}

export default function FormPage({
  open,
  onOpenChange,
  title,
  submitLabel = "저장",
  cancelLabel = "취소",
  submitDisabled = false,
  saving = false,
  onSubmit,
  onCancel,
  onBack,
  desktopMaxWidth = "md:max-w-lg",
  headerExtra,
  footerStart,
  hideFooter = false,
  children,
}: FormPageProps) {
  const handleCancel = onCancel ?? (() => onOpenChange(false));
  const handleBack = onBack ?? handleCancel;

  const isDesktop = useMediaQuery("(min-width: 768px)");

  // 뒤로가기 스택 연결 (하드웨어 뒤로가기 처리)
  useDialogStackEntry(open, onOpenChange);

  // ESC 키로 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        handleCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, handleCancel]);

  // body overflow 잠금 — 배경 스크롤 차단
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // interactiveWidget="resizes-content" 덕분에 키보드가 올라오면 layout
  // viewport 자체가 축소 → 100dvh 가 자동으로 작아져 내부 flex-1 overflow-y-auto
  // 가 자연스럽게 줄어듦. 별도 JS 오프셋 계산 불필요.

  // 포커스 진입 시 scrollIntoView — 일반 DOM 요소 안에선 브라우저 기본 스크롤이
  // 대부분 잘 작동하지만 혹시 모를 edge case 대응
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (!open) {
      setMounted(false);
      return;
    }
    setMounted(true);
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (
        !(target instanceof HTMLInputElement) &&
        !(target instanceof HTMLTextAreaElement)
      ) return;
      // 키보드 슬라이드 대기 후 한 번 더 보정
      setTimeout(() => {
        try {
          target.scrollIntoView({ block: "center", behavior: "smooth" });
        } catch {
          /* ignore */
        }
      }, 300);
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, [open]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  // document.body 에 포털 렌더 — AppShell main 의 stacking context 탈출.
  // 그래야 BottomNav(z-50) 보다 FormPage(z-[70]) 가 실제로 위에 올라옴.
  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex md:items-center md:justify-center md:bg-black/50 md:backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      // 데스크탑: 배경 클릭 시 닫기. 모바일: 배경 없음(전체화면)
      onClick={(e) => {
        if (!isDesktop) return;
        if (e.target === e.currentTarget) handleCancel();
      }}
    >
      <div
        // 모바일: 100dvh — resizes-content 덕분에 키보드 뜰 때 자동 축소.
        // md: h-auto + w-full 로 max-w 까지 실제로 확장 (이전 md:w-auto 는
        // content 너비로 축소되어 max-w 가 무의미했음).
        className={`bg-background flex flex-col w-full h-[100dvh] ${desktopMaxWidth} md:h-auto md:max-h-[85dvh] md:w-full md:rounded-xl md:shadow-xl md:ring-1 md:ring-foreground/10`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더: 공용 PageHeader 재사용 (sticky·bell 은 모달 내부에서 불필요). */}
        <PageHeader
          title={title}
          showBack
          onBack={handleBack}
          actions={headerExtra}
          sticky={false}
        />

        {/* 본문: flex-1 overflow-y-auto + 빈 영역 탭 시 blur.
            헤더 구분선과 첫 컨텐츠 사이에 pt-4(16px) 여백 — 이전 pt-1(4px)은 너무 좁아 답답했음.
            footer 를 스크롤 영역 안쪽 마지막 콘텐츠 아래에 배치 — 고정 풋터는
            오히려 눈에 덜 띄고 긴 폼에서 버튼이 본문과 분리돼 보임. */}
        <div
          className="flex-1 min-h-0 overflow-y-auto px-4 pt-4 pb-4 md:px-6 md:pt-6 md:pb-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              const active = document.activeElement;
              if (
                active instanceof HTMLInputElement ||
                active instanceof HTMLTextAreaElement
              ) {
                active.blur();
              }
            }
          }}
        >
          {children}

          {!hideFooter && (
            <div className="mt-6 md:mt-8 flex items-center justify-between gap-2">
              <div>{footerStart}</div>
              {/* 전체화면 폼의 주요 액션 — 모바일 h-10 으로 충분한 터치 영역 확보, md+ 는 h-9. */}
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancel}
                  disabled={saving}
                  className="h-11 md:h-9"
                >
                  {cancelLabel}
                </Button>
                <Button
                  type="button"
                  onClick={() => { if (onSubmit) void onSubmit(); }}
                  disabled={saving || submitDisabled || !onSubmit}
                  className="h-11 md:h-9"
                >
                  {saving ? "저장 중…" : submitLabel}
                </Button>
              </div>
            </div>
          )}

          {/* Bottom bumper — 안전영역 여유공간. */}
          <div className="h-[env(safe-area-inset-bottom,0px)]" />
          <div className="h-4" />
        </div>
      </div>

      {/* 초기 mount 트리거 용 — 리렌더 없이 mounted flag 유지 */}
      {!mounted && <span className="hidden" aria-hidden="true" />}
    </div>,
    document.body
  );
}
