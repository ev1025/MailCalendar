/**
 * API 응답 표준 형태 + Supabase/Auth 에러 메시지 한글 번역.
 *
 * 사용 예 (훅·뮤테이션):
 *   const result = await mutateThing();
 *   if (result.error) toast.error(result.error.message);
 *
 * 기존 패턴 호환:
 *   { error: string | null }              ← 단순 결과
 *   { data: T | null; error: string | null } ← 데이터 동반
 *   ApiResult<T>                          ← 신규 표준
 */

export type ApiError = {
  /** 사용자에게 보여줄 한글 메시지. */
  message: string;
  /** 원본 에러 코드 — 로그 추적용. */
  code?: string;
};

export type ApiResult<T> =
  | { data: T; error: null }
  | { data: null; error: ApiError };

/** 성공 결과 헬퍼. */
export const ok = <T>(data: T): ApiResult<T> => ({ data, error: null });

/** 실패 결과 헬퍼. message 만 받으면 ApiError 생성. */
export const fail = <T>(message: string, code?: string): ApiResult<T> => ({
  data: null,
  error: { message, code },
});

/**
 * Supabase 에러 메시지 → 사용자 친화적 한글로 변환.
 * 매칭 안 되면 원본 메시지 그대로 반환 (영어라도 일단 보이는 게 디버깅에 도움).
 */
export function translateError(msg: string | undefined | null): string {
  if (!msg) return "알 수 없는 오류";
  const lower = msg.toLowerCase();

  // 인증/세션
  if (lower.includes("invalid login credentials") || lower.includes("invalid credentials"))
    return "이메일 또는 비밀번호가 올바르지 않습니다";
  if (lower.includes("already registered") || lower.includes("already been registered"))
    return "이미 가입된 이메일입니다";
  if (lower.includes("password should be at least") || lower.includes("weak password"))
    return "비밀번호는 최소 6자 이상이어야 합니다";
  if (lower.includes("email not confirmed"))
    return "이메일 인증이 필요합니다. 받은 메일의 링크를 눌러주세요";
  if (lower.includes("rate limit") || lower.includes("too many"))
    return "요청이 너무 많습니다. 잠시 후 다시 시도하세요";
  if (lower.includes("jwt expired") || lower.includes("invalid jwt"))
    return "세션이 만료됐습니다. 다시 로그인해주세요";

  // DB 무결성
  if (lower.includes("duplicate key") && lower.includes("name"))
    return "이미 사용 중인 이름입니다";
  if (lower.includes("duplicate key"))
    return "이미 등록된 값입니다";
  if (lower.includes("foreign key"))
    return "참조 무결성 오류 — 연결된 데이터가 있어 처리할 수 없습니다";
  if (lower.includes("not null"))
    return "필수 항목이 비어있습니다";

  // RLS / 권한
  if (lower.includes("violates row-level security") || lower.includes("rls") || lower.includes("permission denied"))
    return "권한이 없습니다 (로그인 상태 확인)";

  // 네트워크
  if (lower.includes("network") || lower.includes("failed to fetch"))
    return "네트워크 연결을 확인해주세요";
  if (lower.includes("timeout"))
    return "요청 시간이 초과됐습니다";

  return msg;
}
