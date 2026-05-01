-- ============================================
-- 사용량 통계 RPC — Settings 페이지에서 무료 플랜 한도 추적용
-- ============================================
-- 1회 실행. 재실행 안전 (CREATE OR REPLACE).
--
-- 반환:
--  - db_size_bytes        : 현재 DB 전체 용량 (Supabase Free 한도 500 MB)
--  - storage_size_bytes   : 모든 버킷 객체 용량 합계 (Free 한도 1 GB)
--  - storage_object_count : 저장된 파일 개수
--  - public_table_count   : public 스키마의 테이블 수 (참고용)

CREATE OR REPLACE FUNCTION get_usage_stats()
RETURNS TABLE (
  db_size_bytes BIGINT,
  storage_size_bytes BIGINT,
  storage_object_count BIGINT,
  public_table_count BIGINT
)
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT
    pg_database_size(current_database()) AS db_size_bytes,
    COALESCE((
      SELECT SUM((metadata->>'size')::bigint) FROM storage.objects
    ), 0) AS storage_size_bytes,
    COALESCE((
      SELECT COUNT(*) FROM storage.objects
    ), 0) AS storage_object_count,
    (
      SELECT COUNT(*) FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ) AS public_table_count;
$$;

-- 일반 RPC 호출 막고 authenticated 만 허용 (anon 불필요)
REVOKE EXECUTE ON FUNCTION get_usage_stats() FROM anon, public;
GRANT EXECUTE ON FUNCTION get_usage_stats() TO authenticated;

-- 확인:
-- SELECT * FROM get_usage_stats();
