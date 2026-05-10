# Travel Plans — 여행 계획 (`/travel/plans`)

## 핵심 파일
- `src/app/travel/plans/plans-client.tsx`
- `src/components/travel/plan-list.tsx`
- `src/components/travel/plan-detail.tsx`

---

## 기존 10 항목

### H
1. ✅ autoScroll backoff 재시도 — `252089c`
2. ✅ PlanCard 드래그 시각 피드백 — `252089c`
3. ⏳ plan list 가상화
4. ⏳ tasksByDay/days 의존성 순환 가능성

### M
5. ⏳ dragEnd 핸들러 useCallback
6. ⏳ PlanDateRange layout shift
7. ⏳ legPaths 캐시 키 안정화
8. ⏳ 자동 스크롤 ease 커스텀

### L
9. ⏳ completed task 체크마크 fade-in
10. ⏳ 카드 삭제 confirm UX

---

## 코드 효율성 (10)

### CE-1 ⏳ plan-detail 컴포넌트 분리
- 헤더 / task 테이블 / 맵 / 세그먼트 sub-component.

### CE-2 ⏳ legs / legsWithCoords / visibleLegs 의존성 정합성
- 3단계 useMemo. 한 번에 필요한 결과만 계산하도록 통합.

### CE-3 ⏳ usePlanMapData hook 의 deps
- segment / sorted / legsWithCoords / visibleLegs / legPaths 5개. props drilling.

### CE-4 ⏳ formatDayLabel 매 렌더 새 함수
- `useCallback`.

### CE-5 ⏳ 정렬 함수 sortTasks 캐시
- 같은 tasks 면 같은 결과. memo.

### CE-6 ⏳ syncCalendar debounce ref cleanup
- unmount 시 timer 정리 (이미 적용 — 검증).

### CE-7 ⏳ travel_plan_tasks fetch select 컬럼 줄임
- 필요한 컬럼만 select.

### CE-8 ⏳ NaverMap dynamic import
- 큰 lib. 모달 진입 시점 lazy.

### CE-9 ⏳ PlaceSearch debounce 검증
- 지도 검색 input — 350ms debounce.

### CE-10 ⏳ task drag-end 트랜잭션
- N task batch update — 단일 RPC 또는 Promise.all.

---

## 디자인 (10)

### D-1 ⏳ 일자별 섹션 헤더 디자인
- 1일차 / 5월 10일(금) — 큰 타이포 + sticky.

### D-2 ⏳ task 카드 디자인
- 시간 / 장소명 / 체류시간 / 이동수단. 시각 위계.

### D-3 ⏳ 이동수단 색 일관
- 자가용/버스/지하철/도보 색 토큰.

### D-4 ⏳ 빈 day (task 0) 일러스트
- "이 날 task 없어요" + "+ 추가" CTA.

### D-5 ⏳ 맵 핀 디자인
- 순서 번호 + 색.

### D-6 ⏳ 세그먼트 (전체/일자별/경로별) 디자인
- segmented pill (settings 스타일 일관).

### D-7 ⏳ Leg 카드 디자인
- 출발 → 도착 / 수단 / 시간. 시각화.

### D-8 ⏳ Plan 카드 thumbnail
- cover_image_url 활용.

### D-9 ⏳ 모바일 맵 반응형
- portrait 시 맵 height 조정.

### D-10 ⏳ "다녀왔음" 시각화
- task 카드 ✓ + opacity-60 + line-through 옵션.

---

## 애니메이션 (10)

### A-1 ⏳ task 추가/삭제 enter/exit
- AnimatePresence.

### A-2 ⏳ 일자별 섹션 stagger
- 각 day 0.04s stagger.

### A-3 ⏳ 맵 핀 진입 spring
- 새 핀 등장 시 scale 0→1.

### A-4 ⏳ 세그먼트 전환 시 list 재렌더 fade
- 전체 ↔ 일자별 ↔ 경로별 전환 fade.

### A-5 ⏳ task drag 시작 즉시 scale (PlanCard 패턴)
- 이미 적용된 PlanCard 와 동일하게 task row 도 적용.

### A-6 ⏳ 완료 토글 ✓ fade-in
- task 완료 시 체크 fade.

### A-7 ⏳ leg 라인 그리기 애니메이션
- 폴리라인 dasharray animate.

### A-8 ⏳ "다녀왔음" 클릭 즉시 line-through transition
- text-decoration animate (실제론 width transition).

### A-9 ⏳ 자동 스크롤 ease 커스텀
- 240ms cubic-bezier 자체 구현.

### A-10 ⏳ Plan 카드 hover (데스크톱)
- 카드 살짝 lift (translateY -2) + shadow.

---

## 적용 순서 (남은 미적용 우선)
1. CE-1 plan-detail 분리
2. A-1 task enter/exit
3. D-1 일자별 헤더 sticky
4. A-2 day stagger
5. CE-8 NaverMap dynamic import
