-- ────────────────────────────────────────────────────────────────────────────
-- Realtime publication 활성화
--
-- 클라이언트의 Supabase Realtime postgres_changes 구독이 작동하려면
-- supabase_realtime publication 에 해당 테이블이 등록되어 있어야 한다.
--
-- 미활성 시 증상:
--   - calendar_shares accepted 로 변경됐는데 다른 사용자 화면엔 "응답 대기 중" 그대로
--   - calendar_events 추가/수정 후 공유 상대 화면에 즉시 반영 안 됨
--   - notifications 푸시가 즉시 안 옴 (badge 수만 폴링으로 갱신됨)
--   - 5분 staleTime / refetchOnMount 가 fallback 처리하지만 실시간성 떨어짐
--
-- 적용 방법:
--   Supabase Dashboard → SQL Editor 에 이 파일 내용 붙여넣고 Run.
--   또는 Database → Replication 메뉴에서 각 테이블 토글 ON.
--
-- 멱등 — 이미 등록된 테이블에 ADD TABLE 하면 에러나니 ALTER ... DROP 후 ADD 패턴 권장.
-- 안전을 위해 IF EXISTS 검사로 묶음.
-- ────────────────────────────────────────────────────────────────────────────

-- 클라이언트가 구독하는 테이블 모두.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'calendar_events',
    'calendar_shares',
    'fixed_expenses',
    'notifications'
  ] LOOP
    -- 이미 등록되어 있어도 안전하게 재등록.
    EXECUTE format(
      'ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.%I',
      t
    );
    EXECUTE format(
      'ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',
      t
    );
  END LOOP;
END $$;

-- 확인 쿼리 (선택) — 등록된 테이블 조회.
-- SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';

-- 추가로 REPLICA IDENTITY FULL 설정 — DELETE 이벤트의 OLD row 페이로드 노출.
-- 일부 테이블은 DELETE 시 row 정보 없으면 클라가 어떤 행 사라졌는지 모름.
ALTER TABLE public.calendar_events REPLICA IDENTITY FULL;
ALTER TABLE public.calendar_shares REPLICA IDENTITY FULL;
ALTER TABLE public.fixed_expenses REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
