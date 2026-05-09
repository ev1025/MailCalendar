# Finance — 가계부 (`/finance`)

## 핵심 파일
- `src/app/finance/finance-client.tsx` (615줄)
- `src/components/finance/*`

---

## H — 필수

### 1. ✅ fixedSet (Set) → fixedByKey (Map) — `bfd3800`
- 두 번 순회(isFromFixed + findFixedFor) → 단일 Map O(1) lookup.

### 2. ✅ isFromFixed / findFixedFor `useCallback`
- 매 렌더 새 함수 → 메모화로 자식 memo 활성.

### 3. ⏳ sharedManagerProps deps 누락
- `finance-client.tsx:170-172` deps `[categories, year, month]` 만. 핸들러 함수들(updateFixed 등) 의존성 누락 — eslint-disable.
- → 각 핸들러 `useCallback` 으로 안정 + deps 명시. 또는 ref 패턴.

### 4. ⏳ TransactionForm 폼 제출 후 입력값 미초기화
- 폼 닫힐 때 `setTitle("")` 등 reset 누락. 다시 열면 이전 값 잔존.
- → `onOpenChange(false)` 시 reset + `key={Date.now()}` forceMount.

---

## M — 권장

### 5. ⏳ CategoryChart 재렌더 (recharts)
- `baseExpenseByCategory` 변경 시마다 도넛 차트 재계산.
- → Chart 컴포넌트 `memo` + props 동등성 체크.

### 6. ⏳ 월 전환 애니메이션 일관화
- `finance-client.tsx:360-367` 거래 목록만 motion. 카테고리 차트도 같이 동기화.
- → `key={year}-${month}` 상위 motion.div 로 묶기.

### 7. ⏳ 거래 목록 스크롤 위치 보존
- 카테고리 필터 변경 시 스크롤 최상단으로 점프. 사용자 컨텍스트 손실.
- → 필터 변경 후 동일 ratio 로 scrollTop 복원.

### 8. ⏳ DateRangePicker 모션 영역 외부
- `finance-client.tsx:357-359` 월 전환 애니메이션에 누락.
- → 안쪽으로 이동.

---

## L — 있으면 좋음

### 9. ⏳ 카테고리 칩 닫기 버튼 hit-target
- `finance-client.tsx:409-417` `h-4 w-4` 너무 작음. `p-1` 추가.

### 10. ⏳ 고정비 토글 spring 애니메이션
- `includeFixed` 토글 시 텍스트 fade 만. check 아이콘 회전 + spring 추가.

---

## 적용 순서 (남은 미적용)
1. ⏳ H4 폼 reset (UX 개선)
2. ⏳ H3 sharedManagerProps deps
3. ⏳ M6 월 전환 통일
4. ⏳ M5 Chart memo
5. ⏳ L 항목들
