-- =============================================================
-- D-day 공유 — app_users 에 dday_* 컬럼 추가, RLS 는 기존 (read all) 유지
-- =============================================================
--
-- 동작:
--  - 각 사용자가 자기 D-day(enabled / date / time) 를 자기 row 에 저장.
--  - 공유 상대(calendar_shares accepted)는 그 사용자의 dday 를 읽어서 자기 화면에
--    fallback 으로 표시 — 본인이 직접 설정 안 한 경우.
--  - 양쪽 다 설정한 경우 본인 것 우선.
--
-- ⚠️ 기존 app_users SELECT 가 authenticated 전체 허용이라 추가 정책 불필요.
--   (존재하는 정책 그대로 — 컬럼만 추가)
-- =============================================================

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS dday_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS dday_date DATE,
  ADD COLUMN IF NOT EXISTS dday_time TIME;

-- 확인:
-- SELECT id, name, dday_enabled, dday_date, dday_time FROM app_users;
