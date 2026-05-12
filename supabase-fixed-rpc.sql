-- 고정비 "이 달부터 삭제" 를 원자적으로 처리하는 RPC.
-- 기존엔 클라이언트에서 (1)FK매칭 expenses 삭제 → (2)legacy매칭 expenses 삭제 →
-- (3)이전 건수 카운트 → (4)fixed_expenses 갱신 을 4~5번 순차 호출했는데, 중간에
-- 실패하면 부분 상태가 남았다. 이 함수는 한 트랜잭션(=함수 본문) 안에서 다 처리한다.
--
-- ⚠ Supabase SQL Editor 에서 1회 실행 필요. 미실행이어도 앱은 기존 다단계 로직으로
--   폴백하므로 깨지지 않음 (use-fixed-expenses.ts 참고).
--
-- SECURITY INVOKER(기본) 이라 호출 사용자의 RLS 가 그대로 적용 → user_id 필터 불필요.
-- description NULL 비교는 `is not distinct from` 으로 NULL=NULL 을 true 처리(JS 의
-- `description === null ? .is(null) : .eq(v)` 분기와 동일 의미).

create or replace function public.delete_fixed_with_scope(
  p_fixed_id uuid,
  p_start_date date
)
returns integer  -- p_start_date 이전에 남은 expenses 건수 (0 이면 고정비 비활성화됨)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_amount integer;
  v_desc text;
  v_remaining integer;
begin
  select amount, description into v_amount, v_desc
  from fixed_expenses
  where id = p_fixed_id;
  if not found then
    raise exception 'fixed expense % not found', p_fixed_id;
  end if;

  -- (1) FK 매칭 삭제 — p_start_date 이후
  delete from expenses
  where date >= p_start_date
    and fixed_expense_id = p_fixed_id;

  -- (2) legacy 매칭 삭제 — FK 없던 구 거래 (amount + description 동일)
  delete from expenses
  where date >= p_start_date
    and fixed_expense_id is null
    and amount = v_amount
    and description is not distinct from v_desc;

  -- (3) p_start_date 이전에 남은 건수
  select count(*) into v_remaining
  from expenses
  where date < p_start_date
    and (
      fixed_expense_id = p_fixed_id
      or (fixed_expense_id is null and amount = v_amount and description is not distinct from v_desc)
    );

  -- (4) fixed_expenses 갱신 — 과거 기록이 없으면 비활성화, 있으면 반복 개월수 = 남은 건수
  if v_remaining = 0 then
    update fixed_expenses set is_active = false where id = p_fixed_id;
  else
    update fixed_expenses set repeat_months = v_remaining where id = p_fixed_id;
  end if;

  return v_remaining;
end;
$$;

grant execute on function public.delete_fixed_with_scope(uuid, date) to anon, authenticated;
