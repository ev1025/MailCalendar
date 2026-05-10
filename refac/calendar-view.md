# Calendar — 달력 뷰 (`/calendar?view=calendar`)

## 핵심 파일
- `src/app/calendar/calendar-client.tsx` (535줄)
- `src/components/calendar/calendar-view.tsx`
- `src/components/calendar/day-detail.tsx`
- `src/lib/holidays.ts`

---

## 기존 10 항목

### H — 필수
1. ✅ holiday lookup 메모화 — `bfd3800`
2. ✅ CalendarView prop 함수 메모화 — `bfd3800`
3. ⏳ events 배열 reference 안정화 (TanStack select)
4. ⏳ DraggableBar 핸들러 prop drilling

### M — 권장
5. ✅ DnD 셀 isOver 시각 피드백 (이미 구현)
6. ⏳ 월 전환 셀 stagger
7. ⏳ 일정 추가/삭제 후 셀 highlight pulse
8. ⏳ ResizeObserver cleanup 검증

### L — 있으면 좋음
9. ⏳ WeatherIcon 터치 영역 확대
10. ⏳ 셀 hover 마이크로 인터랙션

---

## 코드 효율성 (10)

### CE-1 ⏳ `calendar-client.tsx` 535줄 분할
- handlers/sub-components 별 파일 분리 — `calendar-handlers.ts`, `calendar-month-picker.tsx` 등.

### CE-2 ⏳ MAX_VISIBLE_SLOTS / BAR_H 등 상수 분리
- `calendar-view.tsx:38-42` — `lib/calendar/layout-constants.ts`.

### CE-3 ⏳ `weeks` `useMemo` deps
- `events` 변경 시마다 재계산. 같은 month 내 같은 events 면 안정 reference 유지 검증.

### CE-4 ⏳ `weekHidden` 계산 O(n*7) 단순화
- weekSegs 정렬 후 row 별 마지막 slot 캐시.

### CE-5 ⏳ swipeRef ref 패턴
- `calendar-client.tsx:65` swipe 좌표 ref. 개선 옵션: gesture lib (use-gesture).

### CE-6 ⏳ `getHolidayMap` Set 기반 lookup
- `holidays.ts:119-123` Object 재생성. Set<dateString> 으로 멤버십 검사 O(1).

### CE-7 ⏳ `useHolidayMap` setTick 효율
- `holidays.ts:131-136` listener trigger 매번 새 fn. 안정화.

### CE-8 ⏳ `prefetchHourlyWeather` deps
- `calendar-client.tsx:132-144` weatherMap 변경 시 매번 호출. force-sync 로직 단순화.

### CE-9 ⏳ `repeat-helpers.ts` KO_WEEKDAYS 중복 import
- 여러 파일에서 import. 단일 source.

### CE-10 ⏳ DropCell `useDroppable` 호출 수 (셀 35~42개)
- 한 달 셀당 1개 호출. 정상이지만 dnd-kit context 유닛 측정 필요.

---

## 디자인 (10)

### D-1 ⏳ DnD isOver 색 토큰화
- `calendar-view.tsx:128` hardcoded `bg-blue-50`. accent 또는 primary 토큰.

### D-2 ⏳ 주말 색상 일관성
- 일=red / 토=blue 셀과 헤더 동일 톤. dark mode 검증.

### D-3 ⏳ 공휴일 표시 — 점/배지/배경
- 현재 점만. 한국 공휴일은 빨간색 배경이 관습. 옵션화.

### D-4 ⏳ 오늘 셀 강조
- `bg-primary/5 ring-1` 정도로 미묘하게. 강한 색은 시각 노이즈.

### D-5 ⏳ 셀 다른 달 (지난/다음 달) 디머
- 회색 톤 더 옅게 — 시각적 보조.

### D-6 ⏳ Bar font 크기 (BAR_FONT 7px)
- 작아서 모바일 가독성 ↓. 9~10px 검토.

### D-7 ⏳ 더보기 +N 표시
- 3개 이상 일정 시 "+N" 디자인 — chip vs text-only.

### D-8 ⏳ MonthPicker 디자인
- 좌우 화살표 + 월 텍스트. 다크 모드 hover 톤 검증.

### D-9 ⏳ DnD drag overlay 그림자
- DragOverlay 컴포넌트 시각 강조.

### D-10 ⏳ 사용자 chip 디자인
- 활성·비활성 명확. opacity 0.4 보다 grayscale + dim 조합.

---

## 애니메이션 (10)

### A-1 ⏳ 월 전환 셀 stagger fade
- 새 월 마운트 시 `transition.staggerChildren: 0.012` 셀 fade.

### A-2 ⏳ 일정 추가 시 셀 pulse
- 새 event 가 들어간 셀에 1초 background pulse.

### A-3 ⏳ DragOverlay 스케일·그림자
- 드래그 중 `scale: 1.05 + shadow-lg`.

### A-4 ⏳ 드롭 성공 시 짧은 ring flash
- `animate={{ ringWidth: [0, 2, 0] }}`.

### A-5 ⏳ Bar drag 시작 즉시 scale 1.02
- TouchSensor delay 동안 무반응 → drag 시작 즉시 cue.

### A-6 ⏳ MonthPicker 좌우 버튼 whileTap
- 작은 scale 0.9 spring.

### A-7 ⏳ 공휴일 텍스트 hover
- 데스크톱: 공휴일 이름 tooltip fade-in.

### A-8 ⏳ DayDetail 진입 transition
- DayDetail 모달 slide + fade 검증 (이미 motion 있을 가능성).

### A-9 ⏳ 사용자 chip 토글 transition
- 클릭 시 scale spring + bg color transition.

### A-10 ⏳ WeatherIcon 변경 crossfade
- 날씨 데이터 갱신 시 아이콘 crossfade.

---

## 적용 순서 (남은 미적용 우선)
1. CE-2 상수 분리 (단순)
2. D-1 DnD isOver 토큰화
3. A-1 월 전환 stagger
4. A-2 일정 추가 pulse
5. CE-1 파일 분할 (큰 작업)
