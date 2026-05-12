"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogActionsBar,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  onConfirm: (value: string) => void | Promise<void>;
}

/**
 * 네이티브 `window.prompt()` 대체. ConfirmDialog 와 동일한 골격:
 * p-0 콘텐츠 + 본문 padding wrapper + 하단 1:1 풀너비 풋터(DialogActionsBar).
 * 한글 IME 조합 중 Enter 는 submit 으로 인식 안 함 (isComposing / keyCode 229 체크).
 */
export default function PromptDialog({
  open,
  onOpenChange,
  title,
  placeholder,
  defaultValue = "",
  confirmLabel = "확인",
  onConfirm,
}: Props) {
  const [value, setValue] = useState(defaultValue);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(defaultValue);
      setBusy(false);
    }
  }, [open, defaultValue]);

  const submit = async () => {
    const v = value.trim();
    if (!v) return;
    setBusy(true);
    try {
      await onConfirm(v);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showBackButton={false}
        className="max-w-[calc(100%-3rem)] gap-0 overflow-hidden p-0 sm:max-w-sm"
      >
        <div className="flex flex-col gap-3 px-5 pb-4 pt-5">
          <DialogHeader className="contents">
            {/* 크기·굵기는 DialogTitle 프리미티브에 위임 — 통일. */}
            <DialogTitle className="break-keep">{title}</DialogTitle>
          </DialogHeader>
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              const native = e.nativeEvent as KeyboardEvent & { isComposing?: boolean };
              if (e.key === "Enter" && !native.isComposing && native.keyCode !== 229) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={placeholder}
            autoFocus
            className="h-9"
          />
        </div>
        <DialogActionsBar
          onCancel={() => onOpenChange(false)}
          onConfirm={submit}
          confirmLabel={confirmLabel}
          busy={busy}
          confirmDisabled={!value.trim()}
        />
      </DialogContent>
    </Dialog>
  );
}
