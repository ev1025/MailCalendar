# Calendar — 일정목록 뷰 (`/calendar?view=database`)

## 핵심 파일
- `src/components/calendar/database-view.tsx`

---

## 기존 10 항목

### H — 필수
1. ✅ 행 enter/exit 애니메이션 — `bfd3800`
2. ⏳ 가상화 (대량 일정 대비)
3. ⏳ filtered useMemo 다단계 순회 최적화
4. ⏳ tag.split(",") 중복 호출

### M — 권장
5. ⏳ 모바일 가로 스크롤 컬럼 우선순위
6. ⏳ 정렬 전환 시 행 reorder 애니메이션
7. ⏳ 컬럼 폭 드래그 모바일 미지원
8. ⏳ sticky thead reflow 최소화

### L — 있으면 좋음
9. ⏳ 빈 결과 일러스트 개선
10. ⏳ 헤더 정렬 화살표 transition

---

## 코드 효율성 (10)

### CE-1 ✅ tagColorMap 매 렌더 재생성 — `e4dd33d`
- `database-view.tsx` 매 렌더 reduce. `useMemo([tags])`.

### CE-2 ⏳ parseDay 함수 중복 정의 검토
- 행 안에서 매번 parseDay 호출 — 미리 events 별 cache.

### CE-3 ⏳ resize 이벤트 throttle
- 컬럼 폭 드래그 시 매 mousemove rerender. requestAnimationFrame throttle.

### CE-4 ⏳ allTags Set 의 unique 처리
- `database-view.tsx:72-82` 정상. comma-split 결과 trim/lower 일관.

### CE-5 ⏳ filterTags 토글 핸들러 useCallback
- `setFilterTags((prev) => ...)` 인라인. 자식 FilterPanel memo 검증.

### CE-6 ✅ search debounce — `e4dd33d`
- `database-view.tsx` SearchInput onChange 즉시 filter — 300ms debounce.

### CE-7 ⏳ sortField/sortDir state 통합
- 두 state → 단일 `{field, dir}` discriminated union.

### CE-8 ⏳ tableRef 활용 검증
- `tableRef` 가 어디 쓰이는지. resize 측정 외 미사용이면 제거.

### CE-9 ⏳ colWidths 초기 빈 배열 → fixed 폭
- 첫 resize 전엔 `layout="auto"` fallback. flicker 없는지 검증.

### CE-10 ⏳ 모든 cell render 함수 인라인 lambda
- 행마다 IIFE `(() => { ... })()` — 함수 호출 매번. 외부 헬퍼로 추출.

---

## 디자인 (10)

### D-1 ✅ 컬럼 헤더 hover 색 — `e4dd33d`
- 클릭 가능함을 cue. `hover:bg-accent/30 cursor-pointer`.

### D-2 ✅ 정렬 active 헤더 강조 — `e4dd33d`
- 현재 ArrowUp/Down 만. 헤더 텍스트 굵기 + primary 색.

### D-3 ⏳ 행 height 일관
- 현재 padding `py-1.5`. tag 행 height 들쭉날쭉 가능 — min-h.

### D-4 ⏳ 태그 칩 디자인
- 현재 inline backgroundColor + border. shadcn `<Badge>` 일관성 검토.

### D-5 ⏳ 검색창 + 필터 chip 정렬
- `database-view.tsx:194-224` 단일 row. 모바일 wrap 검증.

### D-6 ⏳ FilterPanel 디자인
- floating panel 시각 elevation. shadow + ring.

### D-7 ⏳ resize handle 비주얼
- `database-view.tsx:303` 우측 6px 영역. hover 시 확장 시각화.

### D-8 ⏳ 빈 상태 일러스트
- `database-view.tsx:243-266` 텍스트만. 아이콘 (CalendarSearch) + 텍스트.

### D-9 ⏳ 다크모드 색 검증
- 일=red/토=blue 셀 dark mode 대비 검증.

### D-10 ⏳ 행 전체 클릭 영역
- 셀별 클릭이 아닌 행 전체 hover bg + click. 이미 적용 — 검증.

---

## 애니메이션 (10)

### A-1 ✅ 행 enter/exit fade slide — `bfd3800`

### A-2 ⏳ 정렬 변경 시 layout 이동
- `motion.tr layout` 으로 부드러운 reorder (이미 적용 — 검증).

### A-3 ✅ 헤더 정렬 화살표 rotate — `e4dd33d`
- 클릭 시 `rotate-180` transition 200ms.

### A-4 ⏳ 검색 디바운스 — 결과 fade
- 검색어 입력 시 일시 dim → 결과 도착 시 fade-in.

### A-5 ⏳ 필터 chip 추가/제거 spring
- chip 추가 시 scale 0→1 spring.

### A-6 ⏳ FilterPanel 진입/퇴출
- 패널 fade + scale 0.96→1 origin top.

### A-7 ⏳ 행 hover 미세 transition
- 현재 `transition-colors` 만. 미세 scale 1.005 옵션.

### A-8 ⏳ 컬럼 resize 시각 cue
- 드래그 중 컬럼 헤더 색 강조.

### A-9 ⏳ 빈 결과 → 결과 있음 transition
- 텍스트 fade-out → 표 fade-in.

### A-10 ⏳ 가상화 도입 시 scroll restoration animate
- 행 위치 복원 시 부드럽게.

---

## 적용 순서 (남은 미적용 우선)
1. CE-1 tagColorMap useMemo
2. D-1 헤더 hover
3. D-2 정렬 active 강조
4. A-3 화살표 rotate
5. CE-6 search debounce
