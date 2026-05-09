"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plane, Route } from "lucide-react";
import PageHeader from "@/components/layout/page-header";
import HeaderViewMenu from "@/components/layout/header-view-menu";
import PlanList from "@/components/travel/plan-list";
import PlanDetail from "@/components/travel/plan-detail";
import { useVisibleUserIds } from "@/hooks/use-visible-user-ids";
import { useCalendarShares } from "@/hooks/use-calendar-shares";

/**
 * 여행 계획 페이지 — 목록 / 상세를 같은 라우트에서 ?id 쿼리로 토글.
 *
 * 이전엔 /travel/plans (목록) 와 /travel/plans/[planId] (상세) 가 분리된 라우트라
 * 카드 탭 시 페이지 전체가 unmount/remount → "리로드" 처럼 보였음.
 * 이제 같은 페이지 안에서 쿼리 파라미터만 바뀌어 PageHeader/AppShell 이 유지됨.
 */
export default function TravelPlansClient() {
  return (
    <Suspense fallback={null}>
      <TravelPlansPageInner />
    </Suspense>
  );
}

function TravelPlansPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planId = searchParams.get("id");
  const { viewableUserIds } = useCalendarShares();
  const { visibleUserIds } = useVisibleUserIds(viewableUserIds);

  // 상세 모드 — query 만 바뀌므로 페이지 자체는 그대로 유지.
  // 헤더 ← 버튼은 Next Link replace 로 이동 — router.push 가 query-only 변경 시
  // 일부 환경에서 트리거 안 되던 이슈 회피.
  if (planId) {
    return (
      <div className="flex flex-col min-h-0">
        <PlanDetail planId={planId} backHref="/travel/plans" />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="여행 계획"
        actions={
          <HeaderViewMenu
            items={[
              {
                key: "travel",
                label: "여행",
                icon: Plane,
                onSelect: () => router.push("/travel"),
              },
              {
                key: "travel-plans",
                label: "여행 계획",
                icon: Route,
                active: true,
                onSelect: () => {},
              },
            ]}
          />
        }
      />
      <div className="flex flex-col h-[calc(100%-3.5rem)] overflow-hidden px-2 py-2 md:h-auto md:overflow-visible md:min-h-0 md:p-6">
        <PlanList
          visibleUserIds={visibleUserIds}
          onSelectPlan={(id) =>
            router.replace(`/travel/plans?id=${id}`, { scroll: false })
          }
        />
      </div>
    </>
  );
}
