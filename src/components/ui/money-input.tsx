"use client";

import { forwardRef } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * 금액 입력 — 사용자 시점에선 천단위 콤마와 "원" 단위가 보이고, 부모 state 는
 * 순수 숫자 문자열("10000") 로 유지.
 *
 * UX:
 *  - 입력 중에 자동으로 1,000 / 10,000 / 100,000 콤마 표시
 *  - 입력은 type=text + inputMode=numeric → 모바일에서도 숫자 키보드
 *  - 우측에 "원" suffix
 *  - placeholder 도 자동 포맷 (예: 10000 → 10,000)
 *
 * 부모는 raw digits 문자열로 받음 → 기존 parseInt(amount, 10) 흐름 그대로.
 */
interface Props {
  id?: string;
  value: string;
  onChange: (raw: string) => void;
  placeholder?: string | number;
  className?: string;
  "aria-invalid"?: boolean;
  disabled?: boolean;
}

const MoneyInput = forwardRef<HTMLInputElement, Props>(function MoneyInput(
  { id, value, onChange, placeholder, className, disabled, ...rest },
  ref,
) {
  const formatted = value ? Number(value).toLocaleString("ko-KR") : "";
  const placeholderText =
    placeholder !== undefined && placeholder !== ""
      ? Number(String(placeholder).replace(/[^0-9]/g, "")).toLocaleString("ko-KR")
      : "0";

  return (
    <div className="relative">
      <Input
        ref={ref}
        id={id}
        type="text"
        inputMode="numeric"
        // 일부 모바일은 pattern 으로 키보드 결정 — 숫자/콤마 허용.
        pattern="[0-9,]*"
        value={formatted}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^0-9]/g, "");
          onChange(raw);
        }}
        placeholder={placeholderText}
        disabled={disabled}
        // 우측 "원" suffix 자리만큼 padding-right 확보. pr-6 (24px) 으로 좁혀서
        // 같은 너비 안에 콤마 포함 7자리(예: 1,000,000) 까지 보임.
        className={cn("pr-6 text-right tabular-nums", className)}
        {...rest}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground select-none"
      >
        원
      </span>
    </div>
  );
});

export default MoneyInput;
