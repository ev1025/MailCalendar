-- travel_plan_tasks 에 alt_places JSONB 컬럼 추가.
-- 한 task 의 대체 위치 후보들을 저장. 1순위는 기존 place_* 컬럼 유지,
-- alt_places 는 [{name, address, lat, lng}, ...] 배열.
-- 사용자가 "이 위치 실패하면 다른 데" 식으로 후보를 미리 등록해두고
-- 폼/드래그바에서 swap 가능하도록.
-- IF NOT EXISTS 로 여러 번 실행해도 안전.
ALTER TABLE travel_plan_tasks
  ADD COLUMN IF NOT EXISTS alt_places JSONB DEFAULT '[]'::jsonb;
