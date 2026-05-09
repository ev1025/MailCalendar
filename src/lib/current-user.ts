"use client";

import { useCallback, useEffect, useMemo } from "react";
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useSupabaseAuth } from "@/lib/auth-supabase";
import { translateError } from "@/lib/api-errors";

export interface AppUser {
  id: string;
  name: string;
  auth_user_id?: string | null; // Supabase auth.users 연결
  color: string;
  emoji: string | null;
  avatar_url: string | null;
  created_at: string;
}

const STALE_TIME = 5 * 60 * 1000;
const GC_TIME = 24 * 60 * 60 * 1000;

export const APP_USERS_QUERY_KEY = ["app-users"] as const;

async function fetchAppUsers(): Promise<AppUser[]> {
  const { data, error } = await supabase
    .from("app_users")
    .select("*")
    .order("created_at");
  if (error) {
    // throw 해서 useQuery 가 결과를 cache 에 set 하지 않도록 — 빈 배열을 영속화해
    // 다음 mount 에 cache hit 으로 표시되는 race 방지.
    throw error;
  }
  const rows = (data as AppUser[]) ?? [];
  if (rows.length === 0) {
    // RLS 가 아직 적용되지 않은 시점 / 인증 전 호출 등으로 빈 결과인 경우.
    // 정상 데이터로 인식하지 않고 throw → cache 갱신 안 됨 → 다음 mount 에서
    // 이전(유효한) cache 가 그대로 사용됨.
    throw new Error("EMPTY_APP_USERS");
  }
  return rows;
}

function invalidateAppUsers(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: APP_USERS_QUERY_KEY });
}

/**
 * 모든 app_users 프로필 — 공유 일정 화면의 owner 아이콘, 사이드바 사용자
 * chip, share-manager 등 다양한 곳에서 즉시 hydrate 가 중요.
 *
 * 영속성: persistQueryClient (localStorage MC_QUERY_CACHE) 가 자동 처리.
 *   - 탭/브라우저 재시작 후 첫 paint 부터 cache hit → 깜빡임 없음.
 *   - app_users 변경(이름/색상/아바타·신규 가입자) 은 Realtime 구독으로 즉시 갱신.
 *
 * 시그니처 호환: 기존 호출자(useAppUsers / useCurrentUserId / useCurrentUser)
 *   가 그대로 동작하도록 동일 반환 형태 유지.
 */
export function useAppUsers() {
  const { user: authUser } = useSupabaseAuth();
  const queryClient = useQueryClient();

  const usersQuery = useQuery<AppUser[]>({
    queryKey: APP_USERS_QUERY_KEY,
    queryFn: fetchAppUsers,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    // 인증 전 fetch 는 RLS 미통과로 빈 배열 → 그게 영속되어 race 발생.
    // authUser 있을 때만 활성화. 첫 진입은 인증 후에 fetch.
    enabled: !!authUser,
    // 빈 결과 throw 가 일시적이라 한 번 더 재시도(인증 직후 RLS 적용 타이밍 보강).
    retry: 2,
    retryDelay: 300,
  });

  const users = usersQuery.data ?? [];
  // enabled=false 시 isPending 영구 true 라 의미가 없음 → authUser 게이팅과 결합.
  const loading = !!authUser && usersQuery.isPending;

  // Realtime — app_users 변경 시 invalidate. 신규 사용자 가입, 프로필 색상
  // 변경, 아바타 업로드 등을 즉시 반영. 모든 사용자 행이 영향이라 filter 없음.
  useEffect(() => {
    const rid = Math.random().toString(36).slice(2);
    const channel = supabase
      .channel(`app-users:${rid}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_users" },
        () => invalidateAppUsers(queryClient),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // 로그인 후 RLS 가 풀려 본인 프로필이 처음 보일 수 있는 시점 보강 — 캐시에
  // 본인 매핑이 없으면 한 번 더 fetch.
  useEffect(() => {
    if (authUser) {
      const hasMatch = users.some((u) => u.auth_user_id === authUser.id);
      if (!hasMatch && !loading) invalidateAppUsers(queryClient);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.id]);

  const inv = useCallback(
    () => invalidateAppUsers(queryClient),
    [queryClient],
  );

  /**
   * 새 프로필 생성 — 이메일 로그인 직후 처음 접속할 때 호출.
   * auth_user_id 로 Supabase Auth 사용자와 연결.
   */
  const addUser = useCallback(
    async (
      authUserId: string,
      name: string,
      color: string,
      emoji?: string,
      avatarUrl?: string,
    ) => {
      // 동시 클릭 / strict mode 더블 호출 방지.
      const existing = users.find((u) => u.auth_user_id === authUserId);
      if (existing) return { data: existing, error: null };
      const payload = {
        auth_user_id: authUserId,
        name,
        color,
        emoji: emoji || null,
        avatar_url: avatarUrl || null,
      };
      const { data, error } = await supabase
        .from("app_users")
        .insert(payload)
        .select()
        .single();
      if (error || !data) {
        // duplicate key 라도 실제 삽입 됐을 수 있어 한 번 재조회.
        await usersQuery.refetch();
        const after = (usersQuery.data ?? []).find(
          (u) => u.auth_user_id === authUserId,
        );
        if (after) return { data: after, error: null };
        return { data: null, error: translateError(error?.message) };
      }
      inv();
      return { data: data as AppUser, error: null };
    },
    [users, usersQuery, inv],
  );

  const updateUser = useCallback(
    async (id: string, updates: Partial<AppUser>) => {
      const { error } = await supabase
        .from("app_users")
        .update(updates)
        .eq("id", id);
      if (error) return { error: translateError(error.message) };
      inv();
      return { error: null };
    },
    [inv],
  );

  const deleteUser = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("app_users")
        .delete()
        .eq("id", id);
      if (!error) inv();
      return { error };
    },
    [inv],
  );

  return {
    users,
    loading,
    addUser,
    updateUser,
    deleteUser,
    refetch: () => usersQuery.refetch(),
  };
}

/**
 * 현재 로그인한 사용자의 app_users.id 반환.
 * Supabase Auth 세션의 auth.uid() 를 받아서 app_users 의 row id 로 변환.
 * 세션이 없거나 app_users 에 연결된 row 가 없으면 null.
 */
export function useCurrentUserId(): string | null {
  const { user } = useSupabaseAuth();
  const { users } = useAppUsers();
  return useMemo(() => {
    if (!user) return null;
    const row = users.find((u) => u.auth_user_id === user.id);
    return row?.id ?? null;
  }, [user, users]);
}

/** 현재 로그인한 사용자의 app_users 레코드 전체 반환. */
export function useCurrentUser(): AppUser | null {
  const { user } = useSupabaseAuth();
  const { users } = useAppUsers();
  return useMemo(() => {
    if (!user) return null;
    return users.find((u) => u.auth_user_id === user.id) ?? null;
  }, [user, users]);
}
