# Calendar — 일정목록 뷰 (`/calendar?view=database`)

## 핵심 파일
- `src/components/calendar/database-view.tsx`

## H — 필수

### 1. 행 enter/exit 애니메이션 부재
- `database-view.tsx:310-370` — `<tbody>` 에 `filtered.map()` 만 있고 `AnimatePresence` 없음. 추가/삭제 시 hard cut.
- 수정: `<motion.tr>` + `<AnimatePresence>` + `layout` prop. DayDetail 패턴과 일관.

### 2. 가상화 (대량 일정 대비)
- 500+ 이벤트 시 `<tbody>` 직접 렌더 → 스크롤 jank.
- 수정: `@tanstack/react-virtual` 도입. row height ~36px 고정 가정해서 단순 적용 가능.
- 우선순위는 H 이지만 실제 회선 사용자 데이터 양에 따라 M 으로 조정 가능.

## M — 권장

### 3. 모바일 가로 스크롤 컬럼 우선순위
- 모바일에서 모든 컬럼(날짜·요일·제목·시간·태그 등) 노출 시 가독성 ↓
- 수정: `< 600px` 시 [날짜·제목] 만 노출, 시간/태그는 행 클릭 시 펼침 또는 dot 표시.

### 4. 정렬 전환 시 행 reorder 애니메이션
- 헤더 클릭 → 정렬 변경 시 행 순서 즉시 변경 (시각적 점프).
- 수정: `motion.tr layout` 으로 layout animation. row key 가 안정적이어야 함 (`ev.id` 사용 중 — OK).

### 5. 컬럼 폭 드래그 모바일 미지원
- 데스크톱 전용 구현. 모바일에서는 컬럼 폭 fixed 또는 미디어 쿼리로 비활성.

## L — 있으면 좋음

### 6. allTags Set 메모화
- `database-view.tsx:72-82` — 이미 `useMemo` 적용 정상. 다만 `tag.split(",")` 가 168·360 두 곳에서 중복. 별도 헬퍼.

### 7. sticky thead 반영 전환 시 reflow
- table layout 전환(auto ↔ fixed)이 reflow 트리거. 단순 `<colgroup>` 으로 width 정의해 안정화.

## 적용 순서
1. H1 행 애니메이션 (즉시 폴리시 효과 큼)
2. M3 모바일 컬럼 우선순위
3. M4 정렬 reorder 애니메이션
4. H2 가상화 (실 데이터 양 보고 판단)
