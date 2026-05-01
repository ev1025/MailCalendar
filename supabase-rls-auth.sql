-- ============================================
-- Supabase Auth 기반 RLS 정책 — 최종 통합본
-- ============================================
-- 기존 anon "Allow all" 정책을 모두 덮어씀. 재실행 안전 (DROP IF EXISTS + CREATE).
--
-- 포함:
--  - auth_app_user_id() : 현재 auth 사용자 → app_users.id 매핑
--  - shared_user_ids()  : 양방향(맞팔 모델) 공유 상대 id 들 UNION
--  - 모든 테이블 RLS 정책 (양방향 공유 적용)
--  - calendar_events / event_tags / travel_items / travel_tags / travel_plans
--    / travel_plan_tasks 는 양쪽이 서로의 데이터에 R/W 권한
--    (event_tags · travel_tags 는 Read 만 양방향, Write 는 본인만)

-- ────────────────────────────────
-- 0-1. 헬퍼 함수: 현재 auth 사용자 → app_users.id
-- ────────────────────────────────
CREATE OR REPLACE FUNCTION auth_app_user_id() RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM app_users WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

-- 외부 RPC(/rest/v1/rpc/auth_app_user_id) 호출 차단 — RLS 내부 호출은 영향 없음.
REVOKE EXECUTE ON FUNCTION auth_app_user_id() FROM anon, authenticated, public;

-- ────────────────────────────────
-- 0-2. 헬퍼 함수: 나와 양방향 공유 관계인 사용자 id 들
--      (내가 viewer 인 owner + 내가 owner 인 viewer)
-- ────────────────────────────────
CREATE OR REPLACE FUNCTION shared_user_ids()
RETURNS SETOF UUID
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT owner_id FROM calendar_shares
  WHERE viewer_id = auth_app_user_id() AND status = 'accepted'
  UNION
  SELECT viewer_id FROM calendar_shares
  WHERE owner_id = auth_app_user_id() AND status = 'accepted'
$$;

-- 외부 RPC 호출 차단.
REVOKE EXECUTE ON FUNCTION shared_user_ids() FROM anon, authenticated, public;

-- ────────────────────────────────
-- 0-3. 헬퍼 함수: 무료 플랜 사용량 조회 (Settings → API 탭에서 표시)
--      DB 용량(pg_database_size) + Storage 객체 용량/개수.
-- ────────────────────────────────
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
    COALESCE((SELECT SUM((metadata->>'size')::bigint) FROM storage.objects), 0) AS storage_size_bytes,
    COALESCE((SELECT COUNT(*) FROM storage.objects), 0) AS storage_object_count,
    (SELECT COUNT(*) FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE') AS public_table_count;
$$;

-- 로그인 사용자만 RPC 호출 허용.
REVOKE EXECUTE ON FUNCTION get_usage_stats() FROM anon, public;
GRANT EXECUTE ON FUNCTION get_usage_stats() TO authenticated;

-- ────────────────────────────────
-- 1. app_users — 모두 읽기 가능(공유 대상 목록), 본인만 쓰기/수정/삭제
-- ────────────────────────────────
DROP POLICY IF EXISTS "Allow all" ON app_users;
DROP POLICY IF EXISTS "Read all profiles" ON app_users;
DROP POLICY IF EXISTS "Insert own profile" ON app_users;
DROP POLICY IF EXISTS "Update own profile" ON app_users;
DROP POLICY IF EXISTS "Delete own profile" ON app_users;

CREATE POLICY "Read all profiles" ON app_users
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert own profile" ON app_users
  FOR INSERT TO authenticated WITH CHECK (auth_user_id = auth.uid());
CREATE POLICY "Update own profile" ON app_users
  FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());
CREATE POLICY "Delete own profile" ON app_users
  FOR DELETE TO authenticated USING (auth_user_id = auth.uid());

-- ────────────────────────────────
-- 2. calendar_events — 양방향 R/W
-- ────────────────────────────────
DROP POLICY IF EXISTS "Allow all" ON calendar_events;
DROP POLICY IF EXISTS "Read own or shared" ON calendar_events;
DROP POLICY IF EXISTS "Insert own events" ON calendar_events;
DROP POLICY IF EXISTS "Update own events" ON calendar_events;
DROP POLICY IF EXISTS "Delete own events" ON calendar_events;
DROP POLICY IF EXISTS "Write shared events" ON calendar_events;
DROP POLICY IF EXISTS "Update shared events" ON calendar_events;
DROP POLICY IF EXISTS "Delete shared events" ON calendar_events;

CREATE POLICY "Read own or shared" ON calendar_events
  FOR SELECT TO authenticated USING (
    user_id = auth_app_user_id() OR user_id IN (SELECT shared_user_ids())
  );
CREATE POLICY "Write shared events" ON calendar_events
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth_app_user_id() OR user_id IN (SELECT shared_user_ids())
  );
CREATE POLICY "Update shared events" ON calendar_events
  FOR UPDATE TO authenticated USING (
    user_id = auth_app_user_id() OR user_id IN (SELECT shared_user_ids())
  );
CREATE POLICY "Delete shared events" ON calendar_events
  FOR DELETE TO authenticated USING (
    user_id = auth_app_user_id() OR user_id IN (SELECT shared_user_ids())
  );

-- ────────────────────────────────
-- 3. calendar_shares — 본인(owner 또는 viewer) 것만
-- ────────────────────────────────
DROP POLICY IF EXISTS "Allow all" ON calendar_shares;
DROP POLICY IF EXISTS "Own shares" ON calendar_shares;

CREATE POLICY "Own shares" ON calendar_shares
  FOR ALL TO authenticated
  USING (owner_id = auth_app_user_id() OR viewer_id = auth_app_user_id())
  WITH CHECK (owner_id = auth_app_user_id() OR viewer_id = auth_app_user_id());

-- ────────────────────────────────
-- 4. event_tags — Read 양방향, Write/Update/Delete 는 본인만
--    (태그 풀은 공유, 추가·삭제는 각자 관리)
-- ────────────────────────────────
DROP POLICY IF EXISTS "Allow all" ON event_tags;
DROP POLICY IF EXISTS "Own rows" ON event_tags;
DROP POLICY IF EXISTS "Read own or shared" ON event_tags;
DROP POLICY IF EXISTS "Write own" ON event_tags;
DROP POLICY IF EXISTS "Update own" ON event_tags;
DROP POLICY IF EXISTS "Delete own" ON event_tags;

CREATE POLICY "Read own or shared" ON event_tags
  FOR SELECT TO authenticated USING (
    user_id = auth_app_user_id() OR user_id IN (SELECT shared_user_ids())
  );
CREATE POLICY "Write own" ON event_tags
  FOR INSERT TO authenticated WITH CHECK (user_id = auth_app_user_id());
CREATE POLICY "Update own" ON event_tags
  FOR UPDATE TO authenticated
  USING (user_id = auth_app_user_id())
  WITH CHECK (user_id = auth_app_user_id());
CREATE POLICY "Delete own" ON event_tags
  FOR DELETE TO authenticated USING (user_id = auth_app_user_id());

-- ────────────────────────────────
-- 5. 단순 개인 데이터 테이블 (user_id = 본인)
-- ────────────────────────────────
-- expenses
DROP POLICY IF EXISTS "Allow all" ON expenses;
DROP POLICY IF EXISTS "Own rows" ON expenses;
CREATE POLICY "Own rows" ON expenses FOR ALL TO authenticated
  USING (user_id = auth_app_user_id())
  WITH CHECK (user_id = auth_app_user_id());

-- fixed_expenses
DROP POLICY IF EXISTS "Allow all" ON fixed_expenses;
DROP POLICY IF EXISTS "Own rows" ON fixed_expenses;
CREATE POLICY "Own rows" ON fixed_expenses FOR ALL TO authenticated
  USING (user_id = auth_app_user_id())
  WITH CHECK (user_id = auth_app_user_id());

-- products
DROP POLICY IF EXISTS "Allow all" ON products;
DROP POLICY IF EXISTS "Own rows" ON products;
CREATE POLICY "Own rows" ON products FOR ALL TO authenticated
  USING (user_id = auth_app_user_id())
  WITH CHECK (user_id = auth_app_user_id());

-- product_purchases
DROP POLICY IF EXISTS "Allow all" ON product_purchases;
DROP POLICY IF EXISTS "Own rows" ON product_purchases;
CREATE POLICY "Own rows" ON product_purchases FOR ALL TO authenticated
  USING (user_id = auth_app_user_id())
  WITH CHECK (user_id = auth_app_user_id());

-- knowledge_folders
DROP POLICY IF EXISTS "Allow all" ON knowledge_folders;
DROP POLICY IF EXISTS "Own rows" ON knowledge_folders;
CREATE POLICY "Own rows" ON knowledge_folders FOR ALL TO authenticated
  USING (user_id = auth_app_user_id())
  WITH CHECK (user_id = auth_app_user_id());

-- knowledge_items
DROP POLICY IF EXISTS "Allow all" ON knowledge_items;
DROP POLICY IF EXISTS "Own rows" ON knowledge_items;
CREATE POLICY "Own rows" ON knowledge_items FOR ALL TO authenticated
  USING (user_id = auth_app_user_id())
  WITH CHECK (user_id = auth_app_user_id());

-- notifications
DROP POLICY IF EXISTS "Allow all" ON notifications;
DROP POLICY IF EXISTS "Own rows" ON notifications;
CREATE POLICY "Own rows" ON notifications FOR ALL TO authenticated
  USING (user_id = auth_app_user_id())
  WITH CHECK (user_id = auth_app_user_id());

-- payment_methods
DROP POLICY IF EXISTS "Allow all" ON payment_methods;
DROP POLICY IF EXISTS "Own rows" ON payment_methods;
CREATE POLICY "Own rows" ON payment_methods FOR ALL TO authenticated
  USING (user_id = auth_app_user_id())
  WITH CHECK (user_id = auth_app_user_id());

-- product_categories
DROP POLICY IF EXISTS "Allow all" ON product_categories;
DROP POLICY IF EXISTS "Own rows" ON product_categories;
CREATE POLICY "Own rows" ON product_categories FOR ALL TO authenticated
  USING (user_id = auth_app_user_id())
  WITH CHECK (user_id = auth_app_user_id());

-- travel_categories
DROP POLICY IF EXISTS "Allow all" ON travel_categories;
DROP POLICY IF EXISTS "Own rows" ON travel_categories;
CREATE POLICY "Own rows" ON travel_categories FOR ALL TO authenticated
  USING (user_id = auth_app_user_id())
  WITH CHECK (user_id = auth_app_user_id());

-- ────────────────────────────────
-- 6. 양방향 공유 — travel_items / travel_plans / travel_plan_tasks / travel_tags
-- ────────────────────────────────
-- travel_items: 양방향 R/W
DROP POLICY IF EXISTS "Allow all" ON travel_items;
DROP POLICY IF EXISTS "Own rows" ON travel_items;
DROP POLICY IF EXISTS "Own or shared" ON travel_items;
CREATE POLICY "Own or shared" ON travel_items
  FOR ALL TO authenticated
  USING (
    user_id = auth_app_user_id() OR user_id IN (SELECT shared_user_ids())
  )
  WITH CHECK (
    user_id = auth_app_user_id() OR user_id IN (SELECT shared_user_ids())
  );

-- travel_tags: Read 양방향, Write/Update/Delete 본인만
DROP POLICY IF EXISTS "Allow all" ON travel_tags;
DROP POLICY IF EXISTS "Own rows" ON travel_tags;
DROP POLICY IF EXISTS "Read own or shared" ON travel_tags;
DROP POLICY IF EXISTS "Write own" ON travel_tags;
DROP POLICY IF EXISTS "Update own" ON travel_tags;
DROP POLICY IF EXISTS "Delete own" ON travel_tags;
CREATE POLICY "Read own or shared" ON travel_tags
  FOR SELECT TO authenticated USING (
    user_id = auth_app_user_id() OR user_id IN (SELECT shared_user_ids())
  );
CREATE POLICY "Write own" ON travel_tags
  FOR INSERT TO authenticated WITH CHECK (user_id = auth_app_user_id());
CREATE POLICY "Update own" ON travel_tags
  FOR UPDATE TO authenticated
  USING (user_id = auth_app_user_id())
  WITH CHECK (user_id = auth_app_user_id());
CREATE POLICY "Delete own" ON travel_tags
  FOR DELETE TO authenticated USING (user_id = auth_app_user_id());

-- travel_plans: 양방향 R/W
DROP POLICY IF EXISTS "Allow all" ON travel_plans;
DROP POLICY IF EXISTS "Own or shared" ON travel_plans;
CREATE POLICY "Own or shared" ON travel_plans
  FOR ALL TO authenticated
  USING (
    user_id = auth_app_user_id() OR user_id IN (SELECT shared_user_ids())
  )
  WITH CHECK (
    user_id = auth_app_user_id() OR user_id IN (SELECT shared_user_ids())
  );

-- travel_plan_tasks: 해당 plan 의 권한 따라감
DROP POLICY IF EXISTS "Allow all" ON travel_plan_tasks;
DROP POLICY IF EXISTS "Via plan" ON travel_plan_tasks;
CREATE POLICY "Via plan" ON travel_plan_tasks
  FOR ALL TO authenticated
  USING (
    plan_id IN (
      SELECT id FROM travel_plans
      WHERE user_id = auth_app_user_id()
         OR user_id IN (SELECT shared_user_ids())
    )
  )
  WITH CHECK (
    plan_id IN (
      SELECT id FROM travel_plans
      WHERE user_id = auth_app_user_id()
         OR user_id IN (SELECT shared_user_ids())
    )
  );

-- ────────────────────────────────
-- 7. expense_categories — Read 전체 허용(시드 카테고리 + 사용자 추가분 모두 보임),
--    Write/Update/Delete 는 본인이 만든 행만 (user_id = me)
--    선행 작업: ALTER TABLE expense_categories ADD COLUMN user_id (schema.sql 에 포함)
-- ────────────────────────────────
DROP POLICY IF EXISTS "Allow all" ON expense_categories;
DROP POLICY IF EXISTS "Authenticated" ON expense_categories;
DROP POLICY IF EXISTS "Read all" ON expense_categories;
DROP POLICY IF EXISTS "Insert own" ON expense_categories;
DROP POLICY IF EXISTS "Update own" ON expense_categories;
DROP POLICY IF EXISTS "Delete own" ON expense_categories;

CREATE POLICY "Read all" ON expense_categories
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert own" ON expense_categories
  FOR INSERT TO authenticated WITH CHECK (user_id = auth_app_user_id());
CREATE POLICY "Update own" ON expense_categories
  FOR UPDATE TO authenticated
  USING (user_id = auth_app_user_id())
  WITH CHECK (user_id = auth_app_user_id());
CREATE POLICY "Delete own" ON expense_categories
  FOR DELETE TO authenticated USING (user_id = auth_app_user_id());

-- ────────────────────────────────
-- 8. app_settings — 본인 row 만 R/W (per-user)
--    선행 작업: ALTER TABLE app_settings ADD COLUMN user_id, PK 변경 (schema.sql)
-- ────────────────────────────────
DROP POLICY IF EXISTS "Allow all" ON app_settings;
DROP POLICY IF EXISTS "Authenticated" ON app_settings;
DROP POLICY IF EXISTS "Own rows" ON app_settings;

CREATE POLICY "Own rows" ON app_settings FOR ALL TO authenticated
  USING (user_id = auth_app_user_id())
  WITH CHECK (user_id = auth_app_user_id());

-- ────────────────────────────────
-- 9. weather_cache — 공용 캐시. SELECT 만 anon 에 허용 (linter 예외).
--    INSERT/UPDATE/DELETE 는 service_role 만 (정책 없음 → RLS 차단).
--    /api/weather 라우트는 SUPABASE_SERVICE_ROLE_KEY 가 설정돼야 캐시에 쓸 수 있음.
-- ────────────────────────────────
DROP POLICY IF EXISTS "Allow all" ON weather_cache;
DROP POLICY IF EXISTS "Public cache" ON weather_cache;
DROP POLICY IF EXISTS "Read cache" ON weather_cache;

CREATE POLICY "Read cache" ON weather_cache
  FOR SELECT TO anon, authenticated USING (true);

-- ────────────────────────────────
-- 10. supplements — 레거시 (이미 DROP TABLE 됨). 테이블이 남아있는 환경 대비.
--     to_regclass 로 존재 여부 체크 후에만 정책 정리.
-- ────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.supplements') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Allow all" ON supplements';
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated" ON supplements';
  END IF;
END $$;

-- ────────────────────────────────
-- 확인용
-- ────────────────────────────────
-- 헬퍼 함수: SELECT auth_app_user_id(); SELECT * FROM shared_user_ids();
-- 정책 목록: SELECT tablename, policyname, cmd FROM pg_policies ORDER BY tablename, cmd;
