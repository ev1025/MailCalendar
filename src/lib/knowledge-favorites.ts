"use client";

import { useEffect, useState, useCallback } from "react";

/**
 * 지식창고 즐겨찾기 — 폴더/파일 모두 지원.
 * 파일(KnowledgeItem)은 DB의 pinned 컬럼도 있지만 여기선 localStorage로 일원화.
 * 서로 다른 기기에 동기화되진 않지만 스키마 변경 없이 바로 사용 가능.
 */

const KEY = "knowledge-favorites";

type FavStore = { folders: string[]; items: string[] };

function read(): FavStore {
  if (typeof window === "undefined") return { folders: [], items: [] };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { folders: [], items: [] };
    const parsed = JSON.parse(raw);
    return {
      folders: Array.isArray(parsed?.folders) ? parsed.folders : [],
      items: Array.isArray(parsed?.items) ? parsed.items : [],
    };
  } catch {
    return { folders: [], items: [] };
  }
}

function write(v: FavStore) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {}
}

// 다른 탭/컴포넌트 간 동기화용 커스텀 이벤트
const EVENT = "knowledge-favorites-changed";
function emit() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EVENT));
}

export function useKnowledgeFavorites() {
  // useState lazy initializer 로 첫 렌더부터 localStorage hydrate.
  // useEffect 안에서 setState 안 해도 되므로 react-hooks/set-state-in-effect 통과.
  const [store, setStore] = useState<FavStore>(read);

  useEffect(() => {
    const handler = () => setStore(read());
    window.addEventListener(EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const toggleFolder = useCallback((id: string) => {
    const cur = read();
    const next: FavStore = cur.folders.includes(id)
      ? { ...cur, folders: cur.folders.filter((x) => x !== id) }
      : { ...cur, folders: [...cur.folders, id] };
    write(next);
    emit();
  }, []);

  const toggleItem = useCallback((id: string) => {
    const cur = read();
    const next: FavStore = cur.items.includes(id)
      ? { ...cur, items: cur.items.filter((x) => x !== id) }
      : { ...cur, items: [...cur.items, id] };
    write(next);
    emit();
  }, []);

  const isFolderFav = useCallback(
    (id: string) => store.folders.includes(id),
    [store.folders]
  );
  const isItemFav = useCallback(
    (id: string) => store.items.includes(id),
    [store.items]
  );

  return {
    favoriteFolderIds: store.folders,
    favoriteItemIds: store.items,
    toggleFolder,
    toggleItem,
    isFolderFav,
    isItemFav,
  };
}
