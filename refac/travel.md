# Travel — 여행 (`/travel`)

## 핵심 파일
- `src/app/travel/travel-client.tsx`
- `src/components/travel/travel-list.tsx`
- `src/components/travel/travel-form.tsx`

## H — 필수

### 1. 가상화 부재
- 100+ 행 시 모두 DOM 렌더.
- 수정: `@tanstack/react-virtual` 도입. card 동적 높이라면 `useVirtualizer` + `measureElement`.

### 2. tagColorMap / categoryColors 매 렌더 재생성
- `travel-list.tsx:270-275` — 필터/정렬 변경 시마다 `new Set()` 순회.
- 수정: `useMemo`.

### 3. 필터 영속성 분산
- sessionStorage(filters) + localStorage(order) 혼용 (`travel-list.tsx:77-84, 235-237`).
- 수정: 단일 인터페이스. `persistent-cache.ts` 활용 또는 통합 hook.

## M — 권장

### 4. 리오더 layoutId 애니메이션
- `arrayMove` 후 key 가 같아 framer 가 위치 이동 인식 못 함.
- 수정: `<motion.div layoutId={item.id}>` + `<AnimatePresence>`.

### 5. 필터 패널 진입/퇴출 transition
- 검색창 ↔ 필터 토글 시 layout shift.
- 수정: `<AnimatePresence mode="wait">` + 동일 height 보장.

### 6. drag 의도 감지
- 200ms TouchSensor delay — 사용자가 카드 hold 시 무반응 구간.
- 수정: drag 시작 시 즉시 약한 scale 피드백 (visual cue).

## L — 있으면 좋음

### 7. 행 내 액션 버튼 hit-target
- 모바일에서 10px 정도로 작은 트리거. 패딩 추가.

### 8. 삭제 swipe gesture
- 데스크톱 우클릭 / 모바일 swipe-to-delete 도입 (라이브러리 또는 커스텀).

## 적용 순서
1. H2 color map 메모 (즉시)
2. M4 layoutId 리오더 애니메이션
3. M5 필터 패널 transition
4. H1 가상화 (실 데이터 기준)
