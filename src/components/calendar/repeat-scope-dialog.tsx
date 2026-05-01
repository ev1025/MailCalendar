"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogActionsBar,
} from "@/components/ui/dialog";

export type RepeatScope = "one" | "following" | "all";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "이 일정을 [수정/삭제]할까요?" 동사 */
  action: "수정" | "삭제";
  onConfirm: (scope: RepeatScope) => void | Promise<void>;
}

const OPTIONS: { value: RepeatScope; label: string; description: string }[] = [
  { value: "one", label: "이 일정만", description: "다른 반복 일정은 그대로 유지" },
  { value: "following", label: "이 일정 포함 이후 모두", description: "이 일정 이후 모든 반복 포함" },
  { value: "all", label: "모든 반복 일정", description: "시리즈 전체 적용" },
];

export default function RepeatScopeDialog({ open, onOpenChange, action, onConfirm }: Props) {
  const [scope, setScope] = useState<RepeatScope>("one");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await onConfirm(scope);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showBackButton={false}
        className="max-w-[calc(100%-3rem)] sm:max-w-sm p-0 gap-0 overflow-hidden"
      >
        <div className="px-5 pt-5 pb-4 flex flex-col gap-3">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">반복 일정 {action}</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-foreground/75 leading-relaxed break-keep">
            이 일정은 반복 시리즈의 일부입니다. 어떻게 {action}할까요?
          </p>
          <div className="flex flex-col gap-1.5">
            {OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-all duration-150 tap-feedback ${
                  scope === opt.value ? "border-primary bg-primary/5" : "hover:bg-accent/50"
                }`}
              >
                <input
                  type="radio"
                  name="repeat-scope"
                  checked={scope === opt.value}
                  onChange={() => setScope(opt.value)}
                  className="mt-0.5 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{opt.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>
        <DialogActionsBar
          onCancel={() => onOpenChange(false)}
          onConfirm={submit}
          confirmLabel={action}
          destructive={action === "삭제"}
          busy={busy}
        />
      </DialogContent>
    </Dialog>
  );
}
