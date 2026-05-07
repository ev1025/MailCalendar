-- travel_plan_tasks 에 completed_at 컬럼 추가.
-- 사용자가 여행 중 "여기 다녀왔음" 체크 시 ISO timestamp 저장. NULL = 미완료.
-- IF NOT EXISTS 이므로 여러 번 실행해도 안전.
ALTER TABLE travel_plan_tasks
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
