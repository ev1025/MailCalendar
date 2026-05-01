-- ============================================
-- 보안 마이그레이션 — Supabase 린트 경고 8건 해결용 (기존 DB 1회 실행)
-- ============================================
-- 신규 DB 셋업이라면 이 파일 대신 supabase-schema.sql 을 실행하세요.
-- 이 파일은 이미 schema.sql 로 셋업한 기존 DB 에 추가 변경만 적용합니다.
-- 재실행 안전 (모두 IF NOT EXISTS / DO BLOCK 으로 멱등성 보장).
--
-- 실행 후 별도로 supabase-rls-auth.sql, supabase-storage.sql 을 차례로 Run 하세요.

-- ────────────────────────────────
-- 1. supplements 레거시 테이블 삭제 (쇼핑기록 products 로 흡수됨)
-- ────────────────────────────────
DROP TABLE IF EXISTS supplements CASCADE;

-- ────────────────────────────────
-- 2. expense_categories — user_id 컬럼 추가
--    기존 14개 시드는 user_id IS NULL 로 글로벌 유지(읽기는 모두 가능, 쓰기 불가).
-- ────────────────────────────────
ALTER TABLE expense_categories
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES app_users(id) ON DELETE CASCADE;

-- ────────────────────────────────
-- 3. app_settings — user_id 컬럼 추가 + (user_id, key) 복합 PK 로 변경
--    기존 글로벌 row 는 각 사용자에게 복사 후 글로벌 row 삭제.
-- ────────────────────────────────
ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES app_users(id) ON DELETE CASCADE;

-- 기존 글로벌 row → 사용자별 복사 (user_id IS NULL 인 행이 남아있을 때만)
INSERT INTO app_settings (user_id, key, value, updated_at)
  SELECT u.id, s.key, s.value, NOW()
  FROM app_users u
  CROSS JOIN app_settings s
  WHERE s.user_id IS NULL
  ON CONFLICT DO NOTHING;

DELETE FROM app_settings WHERE user_id IS NULL;

-- 단일 컬럼 PK(=key) 였다면 → (user_id, key) 복합 PK 로 교체.
DO $$
DECLARE
  cnt INT;
BEGIN
  SELECT COUNT(*) INTO cnt
  FROM pg_index i
  JOIN pg_constraint c ON c.conindid = i.indexrelid
  WHERE c.conname = 'app_settings_pkey'
    AND c.conrelid = 'app_settings'::regclass;

  IF cnt > 0 THEN
    -- 기존 PK 의 컬럼 수가 1이면 교체
    PERFORM 1
    FROM pg_index i
    JOIN pg_constraint c ON c.conindid = i.indexrelid
    WHERE c.conname = 'app_settings_pkey'
      AND c.conrelid = 'app_settings'::regclass
      AND array_length(i.indkey::int[], 1) = 1;

    IF FOUND THEN
      ALTER TABLE app_settings DROP CONSTRAINT app_settings_pkey;
      ALTER TABLE app_settings ADD PRIMARY KEY (user_id, key);
    END IF;
  END IF;
END $$;

-- ────────────────────────────────
-- 확인용
-- ────────────────────────────────
-- 컬럼 확인:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name IN ('expense_categories','app_settings');
-- PK 확인:
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'app_settings'::regclass AND contype = 'p';
-- supplements 삭제 확인:
--   SELECT to_regclass('supplements'); -- NULL 이면 삭제됨
