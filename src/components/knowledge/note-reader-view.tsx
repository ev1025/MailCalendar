"use client";

import { useMemo } from "react";
import { ArrowLeft, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sanitizeRichHTML } from "@/lib/sanitize";
import type { KnowledgeItem } from "@/types";

interface Props {
  item: KnowledgeItem;
  onEdit: () => void;
  onExit: () => void | Promise<void>;
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  if (day < 30) return `${Math.floor(day / 7)}주 전`;
  if (day < 365) return `${Math.floor(day / 30)}개월 전`;
  return `${Math.floor(day / 365)}년 전`;
}

export default function NoteReaderView({ item, onEdit, onExit }: Props) {
  // 저장 시점에도 sanitize 하지만, 캐시/구 데이터/직접 마이그레이션된 row 는 검증
  // 안 됐을 수 있으므로 렌더 시점에 한 번 더 — 최종 방어선(XSS).
  const safeHtml = useMemo(
    () => (item.content ? sanitizeRichHTML(item.content) : ""),
    [item.content],
  );
  return (
    <>
      <div className="flex items-center gap-2 border-b px-3 h-14 shrink-0">
        <button
          type="button"
          onClick={onExit}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground -ml-1"
          title="지식창고 홈"
          aria-label="홈으로"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h2 className="flex-1 truncate text-base font-semibold min-w-0">
          {item.title || "(제목 없음)"}
        </h2>
        <Button
          size="sm"
          variant="outline"
          onClick={onEdit}
          className="h-8 text-xs px-3 shrink-0"
        >
          <Pencil className="mr-1 h-3 w-3" />
          편집
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {/* 메타: 수정시간 · 태그 — 제목 바로 아래 subtle 한 줄 */}
        {(item.updated_at || (item.tags && item.tags.length > 0)) && (
          <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {item.updated_at && <span>{formatRelative(item.updated_at)} 수정</span>}
            {item.tags && item.tags.length > 0 && item.updated_at && (
              <span className="text-muted-foreground/40">·</span>
            )}
            {item.tags && item.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {item.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        {item.content ? (
          <div
            className="tiptap-editor"
            dangerouslySetInnerHTML={{ __html: safeHtml }}
          />
        ) : (
          <p className="text-sm text-muted-foreground text-center py-12">
            내용이 없습니다.
            <button
              type="button"
              className="ml-1 text-primary underline"
              onClick={onEdit}
            >
              편집하기
            </button>
          </p>
        )}
      </div>
    </>
  );
}
