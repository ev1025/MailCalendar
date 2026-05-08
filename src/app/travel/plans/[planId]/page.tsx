import { redirect } from "next/navigation";

/**
 * 옛 라우트 호환 — /travel/plans/[planId] 는 모두 /travel/plans?id=... 로 redirect.
 * RSC server redirect — 클라이언트 useEffect 깜빡임 없음.
 */
export default async function TravelPlanDetailRedirect({
  params,
}: {
  params: Promise<{ planId: string }>;
}) {
  const { planId } = await params;
  if (planId) {
    redirect(`/travel/plans?id=${planId}`);
  }
  redirect("/travel/plans");
}
