# Calendar — 일정목록 뷰 (`/calendar?view=database`)

## 핵심 파일
- `src/components/calendar/database-view.tsx`

---

## H — 필수

### 1. ✅ 행 enter/exit 애니메이션 — `bfd3800`
- `<motion.tr>` + `<AnimatePresence>` + `layout="position"` 적용.

### 2. ⏳ 가상화 (대량 일정 대비)
- 500+ 이벤트 시 `<tbody>` 직접 렌더 → 스크롤 jank.
- → `@tanstack/react-virtual` 도입. row height ~36px 고정.

### 3. ⏳ filtered useMemo 의 다단계 순회
- `database-view.tsx:154-179` filter(O(n*tags)) + sort(O(n*sortKeys)) 매번 재계산.
- → tag 매칭을 Set 기반 O(1) lookup. sort key cache.

### 4. ⏳ tag.split(",") 중복 호출
- `database-view.tsx:168, 360` 두 곳에서 같은 tag 문자열 split.
- → row 별 미리 split 한 결과를 Map 으로 캐시 (`Map<eventId, string[]>`).

---

## M — 권장

### 5. ⏳ 모바일 가로 스크롤 컬럼 우선순위
- 모든 컬럼 노출 시 가독성 ↓. < 600px 시 [날짜·제목] 만 + 시간/태그 행 클릭 펼침.

### 6. ⏳ 정렬 전환 시 행 reorder 애니메이션
- 헤더 클릭 → 행 순서 즉시 변경. `motion.tr layout` 으로 부드럽게 (이미 layout="position" 적용 — 검증 필요).

### 7. ⏳ 컬럼 폭 드래그 모바일 미지원
- 데스크톱 전용. 모바일은 `pointer-events: none` 또는 미디어쿼리 비활성화.

### 8. ⏳ sticky thead reflow 최소화
- `<colgroup>` 으로 width 정의해 layout 전환 jank 제거.

---

## L — 있으면 좋음

### 9. ⏳ 빈 결과 일러스트 개선
- `database-view.tsx:243-266` "검색 결과가 없습니다" 평이한 텍스트. 일러스트 또는 큰 아이콘 추가.

### 10. ⏳ 헤더 정렬 화살표 transition
- `ArrowUp/ArrowDown` 즉시 교체. rotate 180° transition 으로 부드럽게.

---

## 적용 순서 (남은 미적용)
1. ⏳ H3 filter Set 기반 (즉시 효과)
2. ⏳ H4 tag split 캐시
3. ⏳ M5 모바일 컬럼 우선순위
4. ⏳ M8 colgroup 안정화
5. ⏳ H2 가상화 (실 데이터 양 보고 판단)
