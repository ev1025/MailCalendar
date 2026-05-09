# Calendar — 달력 뷰 (`/calendar?view=calendar`)

## 핵심 파일
- `src/app/calendar/calendar-client.tsx` (535줄)
- `src/components/calendar/calendar-view.tsx` (DnD + 그리드)
- `src/components/calendar/day-detail.tsx`
- `src/lib/holidays.ts`

---

## H — 필수

### 1. ✅ holiday lookup 메모화 — `bfd3800`
- `calendar-client.tsx:461` 매 렌더 `getHolidayMap()` 호출.
- → `selectedDateHoliday` `useMemo([selectedDate])` 적용.

### 2. ✅ CalendarView prop 함수 메모화 — `bfd3800`
- `onEventMove` 인라인 async → `handleEventMove` `useCallback` 적용.

### 3. ⏳ events 배열 안정화
- `useCalendarEvents` 가 매 invalidate 마다 새 array 반환. CalendarView 의 `weeks` `useMemo` deps `events` 가 항상 변경됨.
- → 동일 콘텐츠면 같은 reference 반환하도록 `useDeepCompareMemo` 또는 query select 옵션 활용.

### 4. ⏳ DraggableBar 의 핸들러 prop drilling
- CalendarView → DraggableBar 까지 onClick/onMove 전달. 셀당 N개 bar 마다 새 handler.
- → `useEvent` 패턴 또는 context.

---

## M — 권장

### 5. ✅ DnD 셀 isOver 시각 피드백
- `calendar-view.tsx:128` 이미 `bg-blue-50 ring-1 ring-blue-300` 적용. accent 토큰화 추후 검토.

### 6. ⏳ 월 전환 — 셀 stagger 애니메이션
- 현재 motion.div 슬라이드만. 셀 단위 stagger (transition.staggerChildren 0.012) 로 자연스러움 ↑.
- 모바일 60fps 검증 필요.

### 7. ⏳ 일정 추가/삭제 후 셀 강조 pulse
- 새 이벤트 추가 직후 그 셀에 1초 highlight pulse — "추가됐구나" 즉시 인지.
- `motion animate={{ background: ["primary/20", "transparent"] }} transition={{ duration: 1 }}`.

### 8. ⏳ ResizeObserver cleanup
- `calendar-view.tsx:206-221` 셀 높이 추적용 ResizeObserver. unmount 시 disconnect 명시 검증 필요.

---

## L — 있으면 좋음

### 9. ⏳ WeatherIcon 터치 영역 확대
- `calendar-view.tsx:386` weather icon 클릭 영역 좁음. `padding: 4px` + `aria-label` 보강.

### 10. ⏳ 셀 hover 마이크로 인터랙션
- 데스크톱: `hover:bg-accent/30` 만. 살짝 scale 또는 background fade 200ms.

---

## 적용 순서 (남은 미적용)
1. ⏳ M6 셀 stagger (즉시 적용 효과 큼)
2. ⏳ M7 추가 직후 highlight pulse
3. ⏳ L9 weather hit-target
4. ⏳ M8 ResizeObserver cleanup 검증
5. ⏳ H3 events reference 안정화 (가장 큰 작업)
