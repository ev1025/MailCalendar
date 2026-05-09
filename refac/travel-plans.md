# Travel Plans — 여행 계획 (`/travel/plans`)

## 핵심 파일
- `src/app/travel/plans/plans-client.tsx`
- `src/components/travel/plan-list.tsx`
- `src/components/travel/plan-detail.tsx`

## H — 필수

### 1. plan list 가상화 부재
- `plan-list.tsx` — 50+ 계획 카드 grid 렌더 시 jank.
- 수정: `@tanstack/react-virtual` 동적 높이 카드 가상화.

### 2. tasksByDay 재계산 다중
- `plan-detail.tsx:179-189` — `sorted`, `days` 이중 의존. `days` 가 `sorted` 포함 → 순환 가능성.
- 수정: 단일 useMemo 로 통합. `Map<dayIndex, tasks[]>`.

### 3. autoScroll silent fail 위험
- `plan-detail.tsx:83-98` — `data-plan-task-id` selector 못 찾으면 silent. DOM mount 전 실행 가능.
- 수정: `requestAnimationFrame` + early return + 재시도 (max 3회).

## M — 권장

### 4. 카드 리오더 드래그 피드백 약함
- `plan-list.tsx:61` — opacity 0.5 만. 사용자가 드래그 중인지 인지 약함.
- 수정: scale 1.02 + shadow + border 효과 추가.

### 5. plan task drag-end 핸들러 매번 재생성
- `plan-detail.tsx:172-175` — `createPlanDragEndHandler` 메모화 됐지만 `sorted` 의존.
- 수정: `useCallback` + 커링 (deps 최소화).

### 6. 날짜 범위 선택 layout shift
- PlanDateRange start → end 순서 강제 없음. start 변경 시 rerender layout shift.
- 수정: `min-h` reserved 영역.

## L — 있으면 좋음

### 7. 자동 스크롤 ease 커스텀
- `scrollIntoView({ behavior: "smooth" })` 브라우저 기본. 커스텀 easing 으로 자연스럽게.

### 8. completed task 체크마크 fade-in
- 현재 opacity-60 만. ✓ 아이콘 fade-in / scale-in 애니메이션.

## 적용 순서
1. H2 tasksByDay 단순화
2. H3 autoScroll 방어
3. M4 카드 드래그 피드백
4. M5 드래그 핸들러 useCallback
5. L8 체크마크 fade-in
