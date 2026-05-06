"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ArrowLeft, XIcon } from "lucide-react"
import { useDialogStackEntry } from "@/lib/dialog-stack"

function Dialog({ open, onOpenChange, ...props }: DialogPrimitive.Root.Props) {
  useDialogStackEntry(open, onOpenChange as ((o: boolean) => void) | undefined)
  return <DialogPrimitive.Root data-slot="dialog" open={open} onOpenChange={onOpenChange} {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

// DialogContent는 더 이상 back 버튼을 자동 렌더하지 않음.
// 대신 DialogHeader가 back 버튼을 제목 왼쪽에 인라인으로 렌더 (아래 정의 참조).
// onBack prop이 제공되면 커스텀 동작, 아니면 단순히 다이얼로그 닫기.
const BackButtonContext = React.createContext<{
  onBack?: () => void
  show: boolean
}>({ show: true })

function DialogContent({
  className,
  overlayClassName,
  children,
  showCloseButton = false,
  showBackButton = true,
  onBack,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
  showBackButton?: boolean
  onBack?: () => void
  /** Backdrop(z-50 default) override — nested dialog 등에서 z-index 올릴 때 사용. */
  overlayClassName?: string
}) {
  return (
    <DialogPortal>
      <DialogOverlay className={overlayClassName} />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        // 앱 전 팝업 공통 규격 — 모바일 좌우 1.5rem 인셋(이전 1rem이라 답답했음),
        // 데스크톱 sm:max-w-sm. padding p-5/sm:p-6, gap-3.5, rounded-2xl, ring 살짝.
        // 호출처에서 className 으로 max-w/padding 을 추가 override 가능.
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-3rem)] -translate-x-1/2 -translate-y-1/2 gap-3.5 rounded-2xl bg-popover p-5 sm:p-6 text-sm text-popover-foreground ring-1 ring-foreground/10 shadow-lg duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
      >
        <BackButtonContext.Provider value={{ onBack, show: showBackButton }}>
          {children}
        </BackButtonContext.Provider>
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-2 right-2"
                size="icon-sm"
              />
            }
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, children, ...props }: React.ComponentProps<"div">) {
  const { onBack, show } = React.useContext(BackButtonContext)
  if (!show) {
    return (
      <div
        data-slot="dialog-header"
        className={cn("flex flex-col gap-1", className)}
        {...props}
      >
        {children}
      </div>
    )
  }
  const backButton = onBack ? (
    <button
      type="button"
      aria-label="뒤로"
      onClick={onBack}
      className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0 -ml-1.5"
    >
      <ArrowLeft className="h-4 w-4" />
    </button>
  ) : (
    <DialogPrimitive.Close
      data-slot="dialog-back"
      render={
        <button
          type="button"
          aria-label="뒤로"
          className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0 -ml-1.5"
        />
      }
    >
      <ArrowLeft className="h-4 w-4" />
    </DialogPrimitive.Close>
  )
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex items-center gap-2", className)}
      {...props}
    >
      {backButton}
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        {children}
      </div>
    </div>
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Close
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-base leading-none font-medium",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

/**
 * 다이얼로그 헤더의 제목 옆에 들어가는 아이콘 칩.
 * Settings 카드 헤더와 동일한 시각 언어 — 제목에 맥락을 줌.
 *
 * tone: primary(파랑)·warning·destructive·success 의 4 종.
 */
function DialogIcon({
  children,
  tone = "primary",
  className,
}: {
  children: React.ReactNode
  tone?: "primary" | "warning" | "destructive" | "success"
  className?: string
}) {
  const toneCls =
    tone === "warning"
      ? "bg-warning-bg text-warning"
      : tone === "destructive"
      ? "bg-destructive/10 text-destructive"
      : tone === "success"
      ? "bg-success-bg text-success"
      : "bg-primary/10 text-primary"
  return (
    <span
      data-slot="dialog-icon"
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
        toneCls,
        className
      )}
      aria-hidden="true"
    >
      {children}
    </span>
  )
}

/**
 * 본문 시멘틱 섹션 — title 옵션 + 본문. 위계 분리 명확.
 */
function DialogSection({
  title,
  hint,
  children,
  className,
}: {
  title?: string
  hint?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div data-slot="dialog-section" className={cn("flex flex-col gap-2", className)}>
      {title && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-foreground/80">
            {title}
          </p>
          {hint && <span className="text-[10px] text-muted-foreground/60">{hint}</span>}
        </div>
      )}
      {children}
    </div>
  )
}

/**
 * 라벨 + 컨트롤 한 행 — 폼 필드용. inline horizontal 레이아웃.
 */
function DialogField({
  label,
  hint,
  required,
  children,
  className,
}: {
  label: string
  hint?: React.ReactNode
  required?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <div data-slot="dialog-field" className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-foreground/85">
          {label}
          {required && <span className="ml-0.5 text-destructive">*</span>}
        </span>
        {hint && <span className="text-[11px] text-muted-foreground/70">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

/**
 * 푸터 액션 영역 — 취소(좌, ghost/outline) + 확인(우, primary/destructive) 표준.
 * 모바일에선 stretch (flex), 데스크탑에선 right-aligned.
 */
function DialogActions({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      data-slot="dialog-actions"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2 pt-1",
        className
      )}
    >
      {children}
    </div>
  )
}

/**
 * iOS 스타일 풀너비 1:1 푸터 — 취소 / 확인 두 버튼이 가로 절반씩 차지.
 *
 * 사용 조건:
 *  - DialogContent 에 `p-0 gap-0 overflow-hidden` 적용 필요 (flush 하단 정렬용)
 *  - 본문은 별도 padding wrapper (예: <div className="p-5">) 로 감쌈
 *  - 2개 버튼만 (취소 + 1개 confirm). 3+ 버튼이면 DialogActions 사용.
 *
 * destructive 옵션 → 확인 버튼이 빨강. confirmTone="primary" 기본.
 *
 * 사용 예:
 *   <DialogActionsBar
 *     onCancel={() => onOpenChange(false)}
 *     onConfirm={submit}
 *     confirmLabel="저장"
 *     busy={saving}
 *   />
 */
function DialogActionsBar({
  onCancel,
  onConfirm,
  cancelLabel = "취소",
  confirmLabel = "확인",
  destructive = false,
  busy = false,
  confirmDisabled = false,
}: {
  onCancel: () => void
  onConfirm: () => void
  cancelLabel?: string
  confirmLabel?: string
  destructive?: boolean
  busy?: boolean
  /** confirm 버튼만 비활성 (예: 입력 미충족). 취소는 항상 가능. */
  confirmDisabled?: boolean
}) {
  return (
    <div data-slot="dialog-actions-bar" className="grid grid-cols-2 border-t divide-x">
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="h-11 text-sm font-medium text-muted-foreground hover:bg-accent/40 disabled:opacity-50 transition-colors focus-visible:outline-none"
      >
        {cancelLabel}
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={busy || confirmDisabled}
        className={cn(
          "h-11 text-sm font-semibold transition-colors disabled:opacity-50 focus-visible:outline-none",
          destructive ? "text-destructive hover:bg-destructive/10" : "text-primary hover:bg-primary/10"
        )}
      >
        {busy ? "처리 중…" : confirmLabel}
      </button>
    </div>
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
  DialogIcon,
  DialogSection,
  DialogField,
  DialogActions,
  DialogActionsBar,
}
