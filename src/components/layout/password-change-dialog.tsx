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
import { Label } from "@/components/ui/label";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { updatePassword } from "@/lib/auth-supabase";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function PasswordChangeDialog({ open, onOpenChange }: Props) {
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setNewPw("");
      setConfirmPw("");
      setShow(false);
      setError(null);
    }
  }, [open]);

  const handleSubmit = async () => {
    setError(null);
    if (!newPw || newPw.length < 6) {
      setError("새 비밀번호는 최소 6자 이상이어야 합니다");
      return;
    }
    if (newPw !== confirmPw) {
      setError("새 비밀번호가 일치하지 않습니다");
      return;
    }
    setSaving(true);
    try {
      const { error: updateErr } = await updatePassword(newPw);
      if (updateErr) {
        setError(updateErr);
        return;
      }
      toast.success("비밀번호가 변경됐습니다");
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>비밀번호 변경</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">새 비밀번호</Label>
            <div className="relative">
              <Input
                type={show ? "text" : "password"}
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                placeholder="6자 이상"
                autoComplete="new-password"
                autoFocus
                className="h-10 pr-10"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={show ? "숨기기" : "보이기"}
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">새 비밀번호 확인</Label>
            <Input
              type={show ? "text" : "password"}
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
              }}
              autoComplete="new-password"
              aria-invalid={confirmPw !== "" && confirmPw !== newPw}
              className="h-10"
            />
            {/* 실시간 매칭 피드백 — 두 필드 모두 입력됐을 때만 표시. */}
            {newPw && confirmPw && (
              newPw === confirmPw ? (
                <p className="text-[11px] text-success flex items-center gap-1">
                  <span aria-hidden>✓</span>
                  비밀번호가 일치합니다
                </p>
              ) : (
                <p className="text-[11px] text-destructive flex items-center gap-1">
                  <span aria-hidden>✗</span>
                  비밀번호가 일치하지 않습니다
                </p>
              )
            )}
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              취소
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSubmit}
              disabled={saving || !newPw || !confirmPw}
            >
              {saving ? "변경 중..." : "변경"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
