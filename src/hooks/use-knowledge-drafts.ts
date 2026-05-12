"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { stripHtml } from "@/lib/sanitize";

// 지식창고 노트의 임시저장(drafts) 을 localStorage 로 관리하는 훅.
// - 수동 저장: saveDraft({ title, content, sourceId, folderId })
// - 자동 저장: armAutoSave(...) 를 호출해서 60초 idle 후 자동 저장
// - 불러오기: drafts 를 순회하며 UI 에 표시 → loadDraft(id)
// 수동 저장본과 자동 저장본(ID 가 "auto_..." 로 시작) 은 동일한 목록에서 관리.

const DRAFTS_KEY = "knowledge_drafts";
const MAX_DRAFTS = 20;
const AUTOSAVE_DELAY_MS = 60_000;

export interface KnowledgeDraft {
  id: string;
  source_id: string | null;
  folder_id: string | null;
  title: string;
  content: string;
  savedAt: string;
  auto?: boolean;
}

function readFromStorage(): KnowledgeDraft[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(DRAFTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as KnowledgeDraft[];
  } catch {
    return [];
  }
}

function writeToStorage(drafts: KnowledgeDraft[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts.slice(0, MAX_DRAFTS)));
}

export function useKnowledgeDrafts() {
  const [drafts, setDrafts] = useState<KnowledgeDraft[]>([]);
  const [autoSavedAt, setAutoSavedAt] = useState<string | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDrafts(readFromStorage());
  }, []);

  // unmount 시 미발동 자동저장 타이머 정리.
  useEffect(
    () => () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    },
    [],
  );

  const saveDraft = useCallback(
    (input: Omit<KnowledgeDraft, "id" | "savedAt" | "auto">) => {
      const entry: KnowledgeDraft = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        savedAt: new Date().toISOString(),
        ...input,
      };
      setDrafts((prev) => {
        const next = [entry, ...prev];
        writeToStorage(next);
        return next;
      });
      return entry;
    },
    []
  );

  const deleteDraft = useCallback((id: string) => {
    setDrafts((prev) => {
      const next = prev.filter((d) => d.id !== id);
      writeToStorage(next);
      return next;
    });
  }, []);

  // 자동 저장 — 호출 후 60초 idle 이면 저장. 다시 호출되면 이전 예약을 취소하고 새로
  // 잡음(훅 내부 ref 로 관리 → 호출자가 cleanup 을 안 써도 타이머가 누적되지 않음).
  // 빈 내용(공백·HTML 태그만) 은 저장하지 않음.
  const armAutoSave = useCallback(
    (input: {
      title: string;
      content: string;
      source_id: string | null;
      folder_id: string | null;
      enabled: boolean;
    }) => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      if (!input.enabled) return;
      const textOnly = stripHtml(input.content);
      if (!input.title.trim() && !textOnly) return;

      autoSaveTimerRef.current = setTimeout(() => {
        autoSaveTimerRef.current = null;
        const key = input.source_id ?? "__new__";
        const now = new Date().toISOString();
        const entry: KnowledgeDraft = {
          id: `auto_${key}`,
          source_id: input.source_id,
          folder_id: input.folder_id,
          title: input.title || "(제목 없음)",
          content: input.content,
          savedAt: now,
          auto: true,
        };
        setDrafts((prev) => {
          const next = [entry, ...prev.filter((d) => d.id !== entry.id)];
          writeToStorage(next);
          return next;
        });
        setAutoSavedAt(now);
      }, AUTOSAVE_DELAY_MS);

      return () => {
        if (autoSaveTimerRef.current) {
          clearTimeout(autoSaveTimerRef.current);
          autoSaveTimerRef.current = null;
        }
      };
    },
    []
  );

  return {
    drafts,
    autoSavedAt,
    saveDraft,
    deleteDraft,
    armAutoSave,
  };
}
