# Finance — 가계부 (`/finance`)

## 핵심 파일
- `src/app/finance/finance-client.tsx` (615줄)
- `src/components/finance/*`

---

## 기존 10 항목

### H — 필수
1. ✅ fixedSet → fixedByKey Map — `bfd3800`
2. ✅ isFromFixed/findFixedFor useCallback — `bfd3800`
3. ⏳ sharedManagerProps deps 누락
4. ⏳ TransactionForm 폼 reset

### M — 권장
5. ⏳ CategoryChart 재렌더 (recharts memo)
6. ⏳ 월 전환 애니메이션 일관화
7. ⏳ 거래 목록 스크롤 위치 보존
8. ⏳ DateRangePicker 모션 영역 외부

### L
9. ⏳ 카테고리 칩 닫기 hit-target
10. ⏳ 고정비 토글 spring

---

## 코드 효율성 (10)

### CE-1 ⏳ `finance-client.tsx` 615줄 분할
- TransactionForm wrapper / category chart / fixed manager 섹션을 sub-component 로.

### CE-2 ⏳ `baseTransactions` filter 단순화
- `allTransactions.filter` 매번. `fixedByKey` 의존 → memo 정상이지만 추가 필터 layer 검토.

### CE-3 ✅ `baseTotalIncome` / `baseTotalExpense` 단일 reduce — `e4dd33d`
- 두 개 useMemo. 단일 패스로 income+expense 동시 계산.

### CE-4 ✅ `incomeFixed` / `expenseFixed` 단일 분할 — `e4dd33d`
- `useMemo` 두 번. 단일 reduce 로 `{ income, expense }` 객체.

### CE-5 ⏳ category 정렬·필터 헬퍼 추출
- `categoryFilter` 매칭 로직 여러 곳. `lib/finance/filters.ts`.

### CE-6 ⏳ 핸들러 일관 useCallback
- handleTxClick / handleEditTx 등 인라인. ProductRow 패턴 적용.

### CE-7 ⏳ DateRangePicker 결과 useMemo
- start/end 변경 시 `useTransactions` 호출. 빈 변경 (동일 값) 도 fetch 트리거 검증.

### CE-8 ⏳ recharts 데이터 prop 안정화
- chart data array 매 렌더 새 — 메모.

### CE-9 ⏳ `getFixedTotal` 외부 유틸
- expense/income 따로 reduce — 공통 함수.

### CE-10 ⏳ `useFixedExpenses` ensureFixedMonths 호출 검증
- 폼 저장 시 ensureFixedMonths 호출 후 invalidate. 중복 호출 가능성.

---

## 디자인 (10)

### D-1 ⏳ 카드 톤 일관성
- transaction list / category chart / fixed manager 모두 같은 rounded + border + bg-card.

### D-2 ✅ 잔액 카드 색상 — `e4dd33d`
- 양수 = emerald / 음수 = red / 0 = muted. 다크 모드 대비.

### D-3 ⏳ 카테고리 차트 라벨 위치
- recharts default 라벨이 작거나 가려짐. 위치 / 폰트 검증.

### D-4 ⏳ 거래 카드 디자인
- 금액 우측 정렬, tabular-nums. 카테고리 색 dot.

### D-5 ⏳ "고정비 포함" 토글 위치·크기
- 페이지 어딘가에 묻혀 있을 가능성. eyebrow + toggle 디자인.

### D-6 ⏳ 빈 상태 (이번 달 거래 0)
- 일러스트 + "거래 추가" CTA.

### D-7 ⏳ 모바일 카테고리 차트 사이즈
- 도넛 작아짐. 차트 + legend 분리 (legend 아래로).

### D-8 ⏳ 수입/지출 탭 디자인
- segmented 또는 tab — 세그먼트 일관성.

### D-9 ⏳ 고정비 매니저 카드 시각화
- 활성·비활성 시각 차이. 비활성은 muted bg.

### D-10 ⏳ 다크모드 차트 색
- recharts default 색 다크모드 대비 검증.

---

## 애니메이션 (10)

### A-1 ⏳ 거래 추가/삭제 카드 fade-slide
- AnimatePresence + motion.div.

### A-2 ⏳ 카테고리 차트 진입 spring
- recharts animation prop 활용.

### A-3 ⏳ 잔액 숫자 count-up
- 변경 시 0 → 최종값 카운트 업 (useSpring).

### A-4 ⏳ 월 전환 슬라이드
- 거래·차트 동시 슬라이드 + fade.

### A-5 ⏳ "고정비 포함" 토글 spring
- check 회전 + scale.

### A-6 ⏳ 카테고리 chip 토글 spring
- 클릭 시 scale 0.92→1.

### A-7 ⏳ TransactionForm sheet 진입
- 모바일 bottom-sheet, 데스크톱 dialog. duration 통일.

### A-8 ⏳ 검색·필터 결과 변경 fade
- 결과 갱신 시 fade-in.

### A-9 ⏳ 고정비 매니저 토글 시 row 슬라이드
- 활성 → 비활성 시 row collapse + fade.

### A-10 ⏳ 잔액 음수 진입 시 attention
- 잔액 < 0 인 첫 진입 시 카드 흔들림 (warning cue).

---

## 적용 순서 (남은 미적용 우선)
1. CE-3/CE-4 단일 reduce (즉시 효과)
2. D-2 잔액 색
3. A-3 잔액 count-up (시각 효과)
4. A-4 월 전환 슬라이드
5. CE-1 파일 분할 (큰 작업)
