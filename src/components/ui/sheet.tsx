"use client"

import * as React from "react"
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ArrowLeft, XIcon } from "lucide-react"
import { useDialogStackEntry } from "@/lib/dialog-stack"

function Sheet({ open, onOpenChange, ...props }: SheetPrimitive.Root.Props) {
  useDialogStackEntry(open, onOpenChange as ((o: boolean) => void) | undefined)
  return <SheetPrimitive.Root data-slot="sheet" open={open} onOpenChange={onOpenChange} {...props} />
}

function SheetTrigger({ ...props }: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({ ...props }: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({ ...props }: SheetPrimitive.Portal.Props) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({ className, ...props }: SheetPrimitive.Backdrop.Props) {
  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      // iOS Safari 등 backdrop-filter 미지원 환경도 대비해 기본 bg-black/75로
      // 실질적으로 뒤가 가려지도록 함. 지원 시에는 blur-lg로 부드럽게.
      className={cn(
        "fixed inset-0 z-[60] bg-black/75 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-lg supports-backdrop-filter:bg-black/50",
        className
      )}
      style={{
        // 일부 브라우저에서 webkit-backdrop-filter를 별도 인식
        WebkitBackdropFilter: "blur(16px)",
        backdropFilter: "blur(16px)",
      }}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = false,
  showBackButton = true,
  hideOverlay = false,
  style,
  ...props
}: SheetPrimitive.Popup.Props & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
  showBackButton?: boolean
  // 배경 오버레이(검은 반투명 + blur)를 숨김.
  // 지식창고의 "폴더 이동" 바텀시트처럼 배경을 계속 보여야 하는 경우 사용.
  hideOverlay?: boolean
}) {
  // viewport interactiveWidget="resizes-content" 로 전환하면서 키보드 오프셋은
  // 브라우저가 자동으로 처리 → 별도 bottom 오프셋 계산 불필요.
  return (
    <SheetPortal>
      {!hideOverlay && <SheetOverlay />}
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "fixed z-[65] flex flex-col gap-4 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg transition duration-200 ease-in-out data-ending-style:opacity-0 data-starting-style:opacity-0 data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=bottom]:data-ending-style:translate-y-[2.5rem] data-[side=bottom]:data-starting-style:translate-y-[2.5rem] data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=left]:data-ending-style:translate-x-[-2.5rem] data-[side=left]:data-starting-style:translate-x-[-2.5rem] data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=right]:data-ending-style:translate-x-[2.5rem] data-[side=right]:data-starting-style:translate-x-[2.5rem] data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=top]:data-ending-style:translate-y-[-2.5rem] data-[side=top]:data-starting-style:translate-y-[-2.5rem] data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm",
          className
        )}
        style={style}
        {...props}
      >
        {showBackButton && (
          <SheetPrimitive.Close
            data-slot="sheet-back"
            render={
              <button
                type="button"
                aria-label="뒤로"
                className="absolute top-3 left-3 rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors z-10"
              />
            }
          >
            <ArrowLeft className="h-4 w-4" />
          </SheetPrimitive.Close>
        )}
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-3 right-3"
                size="icon-sm"
              />
            }
          >
            <XIcon
            />
            <span className="sr-only">닫기</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Popup>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-0.5 p-4", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "font-heading text-base font-medium text-foreground",
        className
      )}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: SheetPrimitive.Description.Props) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
