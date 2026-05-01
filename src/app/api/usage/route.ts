import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// 사용량 통계 — service_role 키로 get_usage_stats() RPC 호출.
// 함수 자체는 SECURITY INVOKER 라 일반 사용자 권한으론 못 돌고,
// service_role 만 RLS 우회 + storage 조회 가능 → 이 라우트만 작동.
// SUPABASE_SERVICE_ROLE_KEY 미설정 시 503 반환 (클라이언트는 안내 메시지 표시).

// 모듈 레벨 싱글톤 — 매 요청마다 createClient 재호출 회피 (초기화 비용).
// env 변수 누락 시엔 null. lazy 초기화로 placeholder URL 가지고 createClient 콜
// 안 하게 막음.
let cachedClient: SupabaseClient | null = null;
function getServiceClient(): SupabaseClient | null {
  if (cachedClient) return cachedClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  cachedClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

export async function GET() {
  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY 미설정 — Vercel 환경변수 추가 필요" },
      { status: 503 },
    );
  }

  const { data, error } = await supabase.rpc("get_usage_stats");
  if (error) {
    console.error("[/api/usage] rpc failed:", error.message, error.code);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const row = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({
    db_size_bytes: Number(row?.db_size_bytes ?? 0),
    storage_size_bytes: Number(row?.storage_size_bytes ?? 0),
    storage_object_count: Number(row?.storage_object_count ?? 0),
    public_table_count: Number(row?.public_table_count ?? 0),
  });
}
