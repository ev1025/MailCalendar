"use client";

import { useEffect, useMemo, useState } from "react";
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

// ─────────────────────────────────────────
// 단일 스토어 (모듈 수준) — 여러 컴포넌트에서 useAppUsers를 호출해도
// users 상태가 실시간으로 동기화되도록 pub/sub 패턴 사용.
// 이전에는 AppShell과 UserSwitcher가 각자 독립된 상태를 가져
// 프로필 생성 직후 AppShell이 이를 인식 못 해 게이트가 다시 열리던 버그가 있었음.
// ─────────────────────────────────────────
type UsersState = { users: AppUser[]; loading: boolean };
const listeners = new Set<(s: UsersState) => void>();
let cache: UsersState = { users: [], loading: true };
let initialFetchPromise: Promise<void> | null = null;

function setCache(next: UsersState) {
  cache = next;
  listeners.forEach((fn) => fn(cache));
}

async function fetchAppUsers(): Promise<void> {
  setCache({ ...cache, loading: true });
  const { data, error } = await supabase
    .from("app_users")
    .select("*")
    .order("created_at");
  if (!error && data) {
    setCache({ users: data as AppUser[], loading: false });
  } else {
    setCache({ ...cache, loading: false });
  }
}

function ensureInitialFetch() {
  if (!initialFetchPromise) initialFetchPromise = fetchAppUsers();
  return initialFetchPromise;
}

// translateError 는 src/lib/api-errors.ts 로 이전 — import 로 사용.

export function useAppUsers() {
  const { user: authUser } = useSupabaseAuth();
  const [state, setState] = useState<UsersState>(cache);

  useEffect(() => {
    const fn = (s: UsersState) => setState(s);
    listeners.add(fn);
    ensureInitialFetch();
    setState(cache);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  // 로그인/로그아웃 시 app_users 재조회 — 초기 fetch가 인증 전에 실행돼
  // RLS에 막혀 빈 결과를 받은 경우, 인증 후 재조회로 프로필을 찾아냄
  useEffect(() => {
    if (authUser) {
      const hasMatch = cache.users.some((u) => u.auth_user_id === authUser.id);
      if (!hasMatch && !cache.loading) fetchAppUsers();
    }
  }, [authUser?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * 새 프로필 생성. 이메일 로그인 직후 처음 접속할 때 호출.
   * auth_user_id로 Supabase Auth 사용자와 연결.
   */
  const addUser = async (
    authUserId: string,
    name: string,
    color: string,
    emoji?: string,
    avatarUrl?: string
  ) => {
    // 이미 이 auth_user_id로 프로필이 있으면 중복 생성 방지 (동시 클릭/스트릭트 모드 대응)
    const existing = cache.users.find((u) => u.auth_user_id === authUserId);
    if (existing) {
      return { data: existing, error: null };
    }
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
      // duplicate key 에러라도 DB에 실제로 삽입이 된 상황이 있을 수 있으므로 재조회 후 확인
      await fetchAppUsers();
      const afterFetch = cache.users.find((u) => u.auth_user_id === authUserId);
      if (afterFetch) return { data: afterFetch, error: null };
      return { data: null, error: translateError(error?.message) };
    }
    await fetchAppUsers();
    return { data: data as AppUser, error: null };
  };

  const updateUser = async (id: string, updates: Partial<AppUser>) => {
    const { error } = await supabase
      .from("app_users")
      .update(updates)
      .eq("id", id);
    if (error) return { error: translateError(error.message) };
    await fetchAppUsers();
    return { error: null };
  };

  const deleteUser = async (id: string) => {
    const { error } = await supabase.from("app_users").delete().eq("id", id);
    if (!error) await fetchAppUsers();
    return { error };
  };

  return {
    users: state.users,
    loading: state.loading,
    addUser,
    updateUser,
    deleteUser,
    refetch: fetchAppUsers,
  };
}

/**
 * 현재 로그인한 사용자의 app_users.id 반환.
 * Supabase Auth 세션의 auth.uid()를 받아서 app_users의 row id로 변환.
 * 세션이 없거나 app_users에 연결된 row가 없으면 null.
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
