# Products — 생필품 (`/products`)

## 핵심 파일
- `src/app/products/products-client.tsx` (875줄)
- `src/components/products/*`

## H — 필수

### 1. DndContext 중첩 → 단일 컨텍스트
- `products-client.tsx:601-652` — 각 그룹마다 `<DndContext>` 재생성. 수백 제품 시 DOM 폭발 + 이벤트 핸들러 다중 등록.
- 수정: 최상위 1개 DndContext + 그룹별 `<SortableContext>` 만. dnd-kit 표준 패턴.

### 2. ProductRow memo 무효화
- `ProductRow` 가 `memo` 이지만 부모의 `onEdit`/`onDelete` 등 핸들러 인라인 (`products-client.tsx:635-646`) → 매 렌더 새 함수 → memo 무용지물.
- 수정: 각 핸들러 `useCallback`.

### 3. grouped 맵 매 렌더 재계산
- `products-client.tsx:338-361` — `grouped` `useMemo([filtered, stats])` 인데 `stats` 가 useEffect 비동기 갱신 → 매번 새 객체 참조.
- 수정: stats 를 useState 의 ref 비교로 안정화 또는 grouped 의 필요 부분만 의존.

## M — 권장

### 4. 확장/축소 상태 영속화
- `expandedGroups` (`products-client.tsx:277`) 가 컴포넌트 state — 새로고침 시 초기화.
- 수정: localStorage 영속. 또는 sessionStorage.

### 5. 제품 순위 배지 hover 애니메이션
- `products-client.tsx:135-151` — 메달 정적. hover 시 scale + rotate 약하게.

### 6. 검색 결과 모바일 스크롤 보존
- 검색어 입력 후 해당 그룹 자동 펼침 (`products-client.tsx:387-395`) 시 스크롤 위치 보존 안 됨.
- 수정: 검색어 변경 후 IntersectionObserver 로 첫 매칭 그룹 viewport 진입 보장.

## L — 있으면 좋음

### 7. 드래그 haptic feedback
- 모바일 드래그 시작 시 진동 (이미 `lib/haptics.ts` 있음).
- DnD onDragStart 에서 `triggerHaptic("medium")`.

### 8. 카테고리 색상 맵 메모화
- `categoryColors` (`products-client.tsx:283-286`) 매 렌더 재구성. `useShallow` 또는 `useMemo`.

### 9. stats 로드 실패 silent
- 네트워크 실패 시 `-` 표시만. 재시도 버튼 또는 toast.

## 적용 순서
1. H1 DndContext 통합 (가장 큰 성능 영향)
2. H2 useCallback + memo
3. H3 grouped 의존성 정리
4. M4 확장 상태 영속화
5. M6 검색 스크롤
