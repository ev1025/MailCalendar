"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// 지식창고의 "선택된 노트 · 열람 중인 폴더" 상태 — URL(searchParams) 이 단일 진실원.
// /knowledge?item=...&folder=... 형태로 사용.
// - 브라우저 뒤로가기 → 자동 반영 (별도 state·sync effect 없음 → 이중 진실원 버그 제거)
// - item / folder 는 독립. 폴더 안에서 노트 열어도 폴더 컨텍스트 유지 → 탐색기가 루트로 점프 안 함.
//
// (이전엔 useState 로 미러링 + useEffect 로 URL→state 재동기화 → set 한 번에 렌더 3번,
//  뒤로가기 시 한 프레임 동안 stale 값이 보였음.)

export function useKnowledgeRouter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedItemId = searchParams.get("item");
  const viewFolderId = searchParams.get("folder");

  const pushUrl = useCallback(
    (item: string | null, folder: string | null, push = true) => {
      const params = new URLSearchParams();
      if (item) params.set("item", item);
      if (folder) params.set("folder", folder);
      const qs = params.toString();
      const url = qs ? `/knowledge?${qs}` : "/knowledge";
      if (push) router.push(url, { scroll: false });
      else router.replace(url, { scroll: false });
    },
    [router],
  );

  const setSelectedItemId = useCallback(
    (id: string | null) => {
      // 폴더 컨텍스트는 유지 (탐색기 그대로). URL 엔 둘 다 있을 수 있음.
      pushUrl(id, viewFolderId, !!id);
    },
    [pushUrl, viewFolderId],
  );

  const setViewFolderId = useCallback(
    (fid: string | null) => {
      // 폴더 변경 시엔 열람 중 노트 해제 — item 빼고 folder 만.
      pushUrl(null, fid, !!fid);
    },
    [pushUrl],
  );

  return {
    selectedItemId,
    viewFolderId,
    setSelectedItemId,
    setViewFolderId,
    // 호환용 — 예전엔 state 를 직접 만지던 자리. 이제는 그냥 setSelectedItemId 와 동일(URL 갱신).
    _setSelectedItemIdDirect: setSelectedItemId,
  };
}
