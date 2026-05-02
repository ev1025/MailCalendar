"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/format-money";

interface CategoryChartProps {
  expenseByCategory: Record<string, { amount: number; color: string }>;
  totalExpense: number;
  /** 클릭으로 카테고리 필터 토글 — 같은 카테고리 다시 누르면 해제. */
  onSelectCategory?: (name: string | null) => void;
  /** 현재 필터 활성 카테고리 — 도넛 호와 범례 행 강조. */
  activeCategory?: string | null;
}

export default function CategoryChart({
  expenseByCategory,
  totalExpense,
  onSelectCategory,
  activeCategory,
}: CategoryChartProps) {
  const sorted = Object.entries(expenseByCategory).sort(
    ([, a], [, b]) => b.amount - a.amount
  );

  if (sorted.length === 0) return null;

  // SVG 원형 차트 — 컴팩트 사이즈로 다이어트.
  const size = 128;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 48;
  const circumference = 2 * Math.PI * radius;

  let cumulativePercent = 0;
  const slices = sorted.map(([name, { amount, color }]) => {
    const pct = totalExpense > 0 ? amount / totalExpense : 0;
    const offset = circumference * (1 - cumulativePercent);
    const length = circumference * pct;
    cumulativePercent += pct;
    return { name, amount, color, pct, offset, length };
  });

  return (
    <Card size="sm" className="md:h-full">
      <CardHeader className="pb-1.5">
        <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">
          카테고리별 지출
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4">
          {/* 원형 차트 — 도넛 두께 18 (이전 24), 활성 22 */}
          <div className="shrink-0">
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
              <circle
                cx={cx}
                cy={cy}
                r={radius}
                fill="none"
                stroke="hsl(var(--muted))"
                strokeWidth={18}
              />
              {slices.map((slice) => {
                const isActive = activeCategory === slice.name;
                const dim = activeCategory && !isActive ? 0.35 : 1;
                return (
                  <circle
                    key={slice.name}
                    cx={cx}
                    cy={cy}
                    r={radius}
                    fill="none"
                    stroke={slice.color}
                    strokeOpacity={dim}
                    strokeWidth={isActive ? 22 : 18}
                    strokeDasharray={`${slice.length} ${circumference - slice.length}`}
                    strokeDashoffset={slice.offset}
                    transform={`rotate(-90 ${cx} ${cy})`}
                    style={{ cursor: onSelectCategory ? "pointer" : "default", transition: "stroke-width 120ms" }}
                    onClick={() => onSelectCategory?.(isActive ? null : slice.name)}
                  />
                );
              })}
              {/* 가운데 텍스트 — 컴팩트 폰트 */}
              <text
                x={cx}
                y={cy - 5}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px]"
              >
                총 지출
              </text>
              <text
                x={cx}
                y={cy + 9}
                textAnchor="middle"
                className="fill-foreground text-[11px] font-bold"
              >
                {formatMoney(totalExpense)}
              </text>
            </svg>
          </div>

          {/* 범례 — text-sm + py-1.5 로 탭 영역 확보. 다른 페이지 폰트와 일관성 (14px). */}
          <div className="flex flex-col gap-0.5 flex-1 w-full">
            {slices.map((slice) => {
              const isActive = activeCategory === slice.name;
              const dim = activeCategory && !isActive ? "opacity-50" : "";
              return (
                <button
                  key={slice.name}
                  type="button"
                  onClick={() => onSelectCategory?.(isActive ? null : slice.name)}
                  disabled={!onSelectCategory}
                  className={`flex items-center justify-between text-sm rounded-md px-2 py-1.5 -mx-2 transition-colors ${
                    isActive ? "bg-accent" : "hover:bg-accent/50"
                  } ${dim} disabled:cursor-default disabled:hover:bg-transparent`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="inline-block h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: slice.color }}
                    />
                    <span className={`truncate ${isActive ? "font-semibold" : "font-medium"}`}>
                      {slice.name}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0 ml-2">
                    {formatMoney(slice.amount)} ({(slice.pct * 100).toFixed(0)}%)
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
