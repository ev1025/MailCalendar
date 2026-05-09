# Finance — 가계부 (`/finance`)

## 핵심 파일
- `src/app/finance/finance-client.tsx` (615줄)
- `src/components/finance/*`

## H — 필수

### 1. `sharedManagerProps` 매 렌더 새 객체
- `finance-client.tsx:126-173` — 두 FixedExpenseManager 가 같은 핸들러 묶음을 받음. 매 렌더 새 객체 → 자식 memo 깨짐.
- 수정: 각 핸들러 `useCallback` + 묶음 자체 `useMemo`.

### 2. fixedSet 매 렌더 새 Set
- `finance-client.tsx:227-233` — `fixedExpenses` 변경 시마다 `new Set()`. 또한 `isFromFixed` 가 O(n) 매칭 반복.
- 수정: `Map<id, FixedExpense>` 로 O(1) lookup.

### 3. TransactionForm 폼 리셋 누락
- 거래 추가 후 폼 다시 열면 이전 입력값 잔존.
- 수정: `onOpenChange(false)` 시 폼 state reset 또는 `key={Date.now()}` 로 forceMount.

## M — 권장

### 4. CategoryChart 불필요 재렌더
- `baseExpenseByCategory` 변경 시마다 도넛 차트 재계산.
- 수정: Chart 컴포넌트 `memo` + props 동등성 체크.

### 5. 월 전환 애니메이션 일관화
- 현재 슬라이드 + 페이드만. 카테고리 차트·거래 목록도 같이 동기화.
- `key={year}-${month}` 상위 motion.div 로 묶기.

### 6. 거래 목록 스크롤 위치 보존
- 카테고리 필터 변경 시 스크롤 최상단으로. 사용자가 하단 거래 본 후 필터링 시 혼란.
- 수정: 필터 상태 ref + filter 변경 후 동일 ratio 로 scrollTop 복원.

## L — 있으면 좋음

### 7. 카테고리 칩 닫기 버튼 hit-target
- `finance-client.tsx:409-417` 의 `h-4 w-4` 너무 작음. `p-1` 추가로 hit-target 24px+.

### 8. 고정비 토글 spring 애니메이션
- `includeFixed` 토글 시 텍스트 fade 만. check 아이콘 회전 + spring 으로 피드백 강화.

### 9. DateRangePicker 모션 div 외부
- `finance-client.tsx:357-359` — DateRangePicker 가 motion 영역 밖. 월 전환 애니메이션에서 빠짐.
- 안쪽으로 이동하면 통일감.

## 적용 순서
1. H1, H2 (성능 즉시)
2. H3 폼 리셋
3. M5 월 전환 통일
4. M4 Chart memo
5. L 항목들
