"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
 * 네이티브 `window.prompt()` 대체. ConfirmDialog 와 동일한 모바일·데스크톱 토큰.
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
      <DialogContent>
        <DialogHeader>
          {/* 크기·굵기는 DialogTitle 프리미티브(text-base font-semibold)에 위임 — 통일. */}
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
        <div className="flex justify-end gap-2 pt-0.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className="h-9 px-4"
          >
            취소
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={submit}
            disabled={busy || !value.trim()}
            className="h-9 px-4"
          >
            {busy ? "처리 중…" : confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
