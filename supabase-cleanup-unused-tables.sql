-- 코드에서 더 이상 참조되지 않는 테이블 정리.
--
-- ⚠ 실행 전 반드시 확인하세요. DROP TABLE 은 되돌릴 수 없습니다.
--   각 테이블의 데이터가 정말 필요 없는지(다른 테이블로 옮겨졌거나, 비어 있는지) 먼저 보세요:
--     select count(*) from supplements;
--     select count(*) from app_settings;
--
-- 이 SQL 을 안 돌려도 앱 동작에는 영향 없음 — 그냥 안 쓰는 테이블이 DB 에 남아 있을 뿐.

-- 1) supplements — v1 "영양제 비교" 테이블. v2 에서 products 로 데이터 이관 후 코드에서 미사용.
--    (이관 SQL: INSERT INTO products (...) SELECT ... FROM supplements — 이미 돌렸다면 안전.)
--    products 에 영양제 데이터가 잘 들어 있는지 확인 후:
-- drop table if exists public.supplements;

-- 2) app_settings — 코드 어디서도 .from('app_settings') 안 함. D-day·날씨지역 등 설정은
--    전부 localStorage 로 처리됨. 이 테이블에 의미 있는 데이터가 없으면:
-- drop table if exists public.app_settings;

-- (실행하려면 위 drop 줄 앞의 '-- ' 를 지우고 Run)
