-- =============================================================
-- 백엔드 시니어 관점 하드닝 — 인덱스 / 검증 / 동시성 / 운영 품질
-- =============================================================
-- 1회 실행 (재실행 안전 — 모두 IF NOT EXISTS / DO BLOCK).
-- 신규 DB 셋업이라면 supabase-schema.sql 부터 실행.
--
-- 이 파일은 운영 중 DB 에 추가 적용할 변경사항만 모음:
--  ① user_id 인덱스 (RLS 성능)
--  ② FK 인덱스 (JOIN/CASCADE 성능)
--  ③ payment_method CHECK 제약
--  ④ travel_plan_tasks INSERT 정책 강화
--  ⑤ calendar_shares 양방향 race 방지
-- =============================================================

-- ====== ① user_id 인덱스 ======
-- RLS 정책이 매 행 user_id 비교 → 인덱스 없이는 O(n).
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_id ON calendar_events(user_id);
CREATE INDEX IF NOT EXISTS idx_event_tags_user_id ON event_tags(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_fixed_expenses_user_id ON fixed_expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_travel_items_user_id ON travel_items(user_id);
CREATE INDEX IF NOT EXISTS idx_travel_tags_user_id ON travel_tags(user_id);
CREATE INDEX IF NOT EXISTS idx_travel_plans_user_id ON travel_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_products_user_id ON products(user_id);
CREATE INDEX IF NOT EXISTS idx_product_purchases_user_id ON product_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_folders_user_id ON knowledge_folders(user_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_items_user_id ON knowledge_items(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);

-- calendar_shares: owner_id, viewer_id 둘 다 자주 조회 (양방향).
CREATE INDEX IF NOT EXISTS idx_calendar_shares_owner_id ON calendar_shares(owner_id);
CREATE INDEX IF NOT EXISTS idx_calendar_shares_viewer_id ON calendar_shares(viewer_id);

-- 자주 함께 필터되는 (status, owner/viewer) 복합 인덱스 — shared_user_ids() 함수가 사용.
CREATE INDEX IF NOT EXISTS idx_calendar_shares_owner_status
  ON calendar_shares(owner_id, status);
CREATE INDEX IF NOT EXISTS idx_calendar_shares_viewer_status
  ON calendar_shares(viewer_id, status);

-- ====== ② FK 인덱스 ======
-- expense_categories(id) ← expenses, fixed_expenses
CREATE INDEX IF NOT EXISTS idx_expenses_category_id ON expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_fixed_expenses_category_id ON fixed_expenses(category_id);

-- products(id) ← product_purchases, fixed_expenses
CREATE INDEX IF NOT EXISTS idx_product_purchases_product_id
  ON product_purchases(product_id);
CREATE INDEX IF NOT EXISTS idx_fixed_expenses_product_id
  ON fixed_expenses(product_id);

-- knowledge_folders(id) ← knowledge_folders(parent), knowledge_items(folder)
CREATE INDEX IF NOT EXISTS idx_knowledge_folders_parent_id
  ON knowledge_folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_items_folder_id
  ON knowledge_items(folder_id);

-- travel_plans(id) ← calendar_events, travel_plan_tasks
CREATE INDEX IF NOT EXISTS idx_calendar_events_plan_id ON calendar_events(plan_id);
-- travel_plan_tasks(plan_id) 는 schema.sql 의 idx_tpt_plan_day_time 으로 이미 커버.

-- ====== ③ payment_method CHECK 제약 ======
-- 임의 텍스트 입력 방지. 기존 데이터 우선 표준화 후 제약 추가.
DO $$
BEGIN
  -- 빈 값/NULL → 기본값으로 정규화.
  UPDATE expenses SET payment_method = '카드'
    WHERE payment_method IS NULL OR TRIM(payment_method) = '';
  UPDATE fixed_expenses SET payment_method = '계좌이체'
    WHERE payment_method IS NULL OR TRIM(payment_method) = '';

  -- expenses.payment_method CHECK
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_expenses_payment_method'
      AND conrelid = 'expenses'::regclass
  ) THEN
    -- 기존 데이터 중 허용 값에 없는 행은 '기타' 로 흡수 (제약 추가 가능하게).
    UPDATE expenses SET payment_method = '기타'
      WHERE payment_method NOT IN ('카드','현금','계좌이체','자동이체','간편결제','기타');
    ALTER TABLE expenses
      ADD CONSTRAINT chk_expenses_payment_method
      CHECK (payment_method IN ('카드','현금','계좌이체','자동이체','간편결제','기타'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_fixed_expenses_payment_method'
      AND conrelid = 'fixed_expenses'::regclass
  ) THEN
    UPDATE fixed_expenses SET payment_method = '기타'
      WHERE payment_method NOT IN ('카드','현금','계좌이체','자동이체','간편결제','기타');
    ALTER TABLE fixed_expenses
      ADD CONSTRAINT chk_fixed_expenses_payment_method
      CHECK (payment_method IN ('카드','현금','계좌이체','자동이체','간편결제','기타'));
  END IF;
END $$;

-- ====== ④ travel_plan_tasks INSERT 정책 강화 ======
-- 기존: FOR ALL 단일 정책 → INSERT 시점 plan 검증이 약함.
-- 신규: SELECT/UPDATE/DELETE 는 USING, INSERT 는 WITH CHECK 명시 분리.
DROP POLICY IF EXISTS "Via plan" ON travel_plan_tasks;
DROP POLICY IF EXISTS "Read via plan" ON travel_plan_tasks;
DROP POLICY IF EXISTS "Insert via plan" ON travel_plan_tasks;
DROP POLICY IF EXISTS "Update via plan" ON travel_plan_tasks;
DROP POLICY IF EXISTS "Delete via plan" ON travel_plan_tasks;

CREATE POLICY "Read via plan" ON travel_plan_tasks
  FOR SELECT TO authenticated USING (
    plan_id IN (
      SELECT id FROM travel_plans
      WHERE user_id = auth_app_user_id()
         OR user_id IN (SELECT shared_user_ids())
    )
  );

CREATE POLICY "Insert via plan" ON travel_plan_tasks
  FOR INSERT TO authenticated WITH CHECK (
    plan_id IS NOT NULL
    AND plan_id IN (
      SELECT id FROM travel_plans
      WHERE user_id = auth_app_user_id()
         OR user_id IN (SELECT shared_user_ids())
    )
  );

CREATE POLICY "Update via plan" ON travel_plan_tasks
  FOR UPDATE TO authenticated
  USING (
    plan_id IN (
      SELECT id FROM travel_plans
      WHERE user_id = auth_app_user_id()
         OR user_id IN (SELECT shared_user_ids())
    )
  )
  WITH CHECK (
    plan_id IS NOT NULL
    AND plan_id IN (
      SELECT id FROM travel_plans
      WHERE user_id = auth_app_user_id()
         OR user_id IN (SELECT shared_user_ids())
    )
  );

CREATE POLICY "Delete via plan" ON travel_plan_tasks
  FOR DELETE TO authenticated USING (
    plan_id IN (
      SELECT id FROM travel_plans
      WHERE user_id = auth_app_user_id()
         OR user_id IN (SELECT shared_user_ids())
    )
  );

-- ====== ⑤ calendar_shares 양방향 race 방지 ======
-- 단방향 UNIQUE (owner_id, viewer_id) 만으로는 (A→B) 와 (B→A) 동시 생성 막지 못함.
-- 정렬된 페어 generated column + UNIQUE 로 양방향 중복 차단.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'calendar_shares' AND column_name = 'pair_key'
  ) THEN
    ALTER TABLE calendar_shares
      ADD COLUMN pair_key TEXT GENERATED ALWAYS AS (
        LEAST(owner_id::text, viewer_id::text) || '|' || GREATEST(owner_id::text, viewer_id::text)
      ) STORED;
  END IF;

  -- 기존 데이터에 양방향 중복이 있을 수 있어 가장 오래된 것만 남기고 정리.
  DELETE FROM calendar_shares
  WHERE id IN (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY pair_key ORDER BY created_at) AS rn
      FROM calendar_shares
    ) t
    WHERE t.rn > 1
  );

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uniq_calendar_shares_pair_key'
      AND conrelid = 'calendar_shares'::regclass
  ) THEN
    ALTER TABLE calendar_shares
      ADD CONSTRAINT uniq_calendar_shares_pair_key UNIQUE (pair_key);
  END IF;
END $$;

-- ====== 확인용 ======
-- 인덱스 목록:
--   SELECT schemaname, tablename, indexname FROM pg_indexes
--   WHERE schemaname = 'public' AND indexname LIKE 'idx_%' ORDER BY tablename, indexname;
-- CHECK 제약:
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid IN ('expenses'::regclass, 'fixed_expenses'::regclass);
-- travel_plan_tasks 정책:
--   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'travel_plan_tasks';
