"use client";

// Supabase Auth (이메일 매직링크) 래퍼.
// 앱 전역에서 Supabase Auth를 직접 import하지 않고 이 파일을 거쳐 사용한다.
// → 나중에 Auth 이전이 끝나면 lib/current-user.ts의 커스텀 세션 로직과 병합/제거.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Session, User } from "@supabase/supabase-js";

function validateEmail(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return "이메일을 입력하세요";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return "이메일 형식이 올바르지 않습니다";
  return null;
}

// 에러 메시지 번역은 src/lib/api-errors.ts 의 translateError 통합 사용.
import { translateError as mapAuthError } from "@/lib/api-errors";

/**
 * 이메일 + 비밀번호 회원가입.
 * Supabase의 email confirmation 설정이 켜져 있으면 확인 메일을 보내고,
 * 꺼져 있으면 바로 세션이 생성된다.
 */
export async function signUpWithPassword(
  email: string,
  password: string
): Promise<{ error: string | null; needsConfirm?: boolean }> {
  const emailErr = validateEmail(email);
  if (emailErr) return { error: emailErr };
  if (!password || password.length < 6)
    return { error: "비밀번호는 최소 6자 이상이어야 합니다" };
  const emailRedirectTo =
    typeof window !== "undefined" ? `${window.location.origin}/` : undefined;
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: { emailRedirectTo },
  });
  if (error) return { error: mapAuthError(error.message) };
  // session이 null이면 email confirmation 필요
  return { error: null, needsConfirm: !data.session };
}

/** 이메일 + 비밀번호 로그인. */
export async function signInWithPassword(
  email: string,
  password: string
): Promise<{ error: string | null }> {
  const emailErr = validateEmail(email);
  if (emailErr) return { error: emailErr };
  if (!password) return { error: "비밀번호를 입력하세요" };
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) return { error: mapAuthError(error.message) };
  return { error: null };
}

/** 비밀번호 재설정 메일 발송 (분실 시 사용). */
export async function sendPasswordResetEmail(
  email: string
): Promise<{ error: string | null }> {
  const emailErr = validateEmail(email);
  if (emailErr) return { error: emailErr };
  const redirectTo =
    typeof window !== "undefined" ? `${window.location.origin}/` : undefined;
  const { error } = await supabase.auth.resetPasswordForEmail(
    email.trim().toLowerCase(),
    { redirectTo }
  );
  if (error) return { error: mapAuthError(error.message) };
  return { error: null };
}

/**
 * (레거시) 매직링크 발송. 비밀번호 찾기/새 기기 일시 접근용으로 남겨둠.
 */
export async function sendMagicLink(email: string): Promise<{ error: string | null }> {
  const emailErr = validateEmail(email);
  if (emailErr) return { error: emailErr };
  const emailRedirectTo =
    typeof window !== "undefined" ? `${window.location.origin}/` : undefined;
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { shouldCreateUser: true, emailRedirectTo },
  });
  if (error) return { error: mapAuthError(error.message) };
  return { error: null };
}

/** 현재 Supabase Auth 세션 조회 (초기화용). */
export async function getAuthSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/** 로그아웃 — auth.users 세션 종료 + 로컬 storage 정리. */
export async function supabaseSignOut(): Promise<void> {
  await supabase.auth.signOut();
}

/** 현재 로그인 세션의 비밀번호 변경. */
export async function updatePassword(
  newPassword: string
): Promise<{ error: string | null }> {
  if (!newPassword || newPassword.length < 6) {
    return { error: "비밀번호는 최소 6자 이상이어야 합니다" };
  }
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { error: mapAuthError(error.message) };
  return { error: null };
}

/**
 * Supabase Auth 세션을 React 상태로 구독.
 * onAuthStateChange에 연결해서 매직링크 돌아올 때 바로 반영.
 */
export function useSupabaseAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const s = await getAuthSession();
      if (active) {
        setSession(s);
        setLoading(false);
      }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, user: session?.user ?? null, loading };
}

/** 현재 Auth 사용자의 UUID만 필요할 때. */
export function useAuthUserId(): string | null {
  const { user } = useSupabaseAuth();
  return user?.id ?? null;
}

export type { Session, User };
