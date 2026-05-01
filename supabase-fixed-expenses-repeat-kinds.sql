-- 고정비 반복 종류 확장 — 매주(격주 N주마다 포함) / 매월(N주차 W요일 포함) / 매년 지원.
-- 기존 fixed_expenses 행은 모두 monthly day_of_month 모드로 간주됨 (repeat_kind NULL).
--
-- 사용:
--   Supabase Dashboard → SQL Editor 에서 통째로 실행. 멱등 (IF NOT EXISTS).

ALTER TABLE fixed_expenses ADD COLUMN IF NOT EXISTS repeat_kind TEXT;
-- 'weekly' | 'monthly' | 'yearly' | NULL(=monthly default 호환)

ALTER TABLE fixed_expenses ADD COLUMN IF NOT EXISTS weekly_interval INTEGER;
-- 1=매주, 2=격주, 3=3주마다, ... weekly 모드에서만 사용.

ALTER TABLE fixed_expenses ADD COLUMN IF NOT EXISTS monthly_nth_week INTEGER;
ALTER TABLE fixed_expenses ADD COLUMN IF NOT EXISTS monthly_nth_weekday INTEGER;
-- monthly + N주차 W요일 모드. 둘 다 NULL 이면 day_of_month 모드.

ALTER TABLE fixed_expenses ADD COLUMN IF NOT EXISTS anchor_date DATE;
-- 첫 발화일. weekly/yearly/monthly-nth 모드에서 필수.
-- monthly default 모드에선 NULL 허용 (today + day_of_month 로 계산).

-- 정합성 보호: kind 확인 가능한 CHECK 추가.
ALTER TABLE fixed_expenses DROP CONSTRAINT IF EXISTS fixed_expenses_repeat_kind_check;
ALTER TABLE fixed_expenses ADD CONSTRAINT fixed_expenses_repeat_kind_check
  CHECK (repeat_kind IS NULL OR repeat_kind IN ('weekly', 'monthly', 'yearly'));
