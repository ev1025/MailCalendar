# Calendar — 달력 뷰 (`/calendar?view=calendar`)

## 핵심 파일
- `src/app/calendar/calendar-client.tsx`
- `src/components/calendar/calendar-view.tsx`
- `src/components/calendar/day-detail.tsx`
- `src/lib/holidays.ts`

## H — 필수

### 1. holiday lookup 메모화
- `calendar-client.tsx:461` — `getHolidayMap(parseYmd(selectedDate).getFullYear())[selectedDate]` 매 렌더 호출. 같은 year 의 Map 이 매번 재계산.
- 수정: `useMemo` 로 year 별 캐시. 또는 `useHolidayMap(year)` 훅이 이미 memCache 가지고 있는지 확인 후 그쪽 활용.

### 2. CalendarView prop 함수 메모화
- `calendar-client.tsx:419-422` — `onEventMove` 가 인라인 async 함수. 매 렌더 새 함수 → CalendarView 의 useMemo 의존성 깨짐.
- 수정: `useCallback` 으로 감싸기.

## M — 권장

### 3. DnD 드롭 시각 피드백
- `calendar-view.tsx` 의 droppable 셀이 `isOver` 상태일 때 ring/background 강조 없음. 사용자가 어디 떨어뜨릴지 모호.
- 추가: `ring-2 ring-primary/40 bg-primary/5` + `transition-colors duration-150`.

### 4. 월 전환 애니메이션 — 셀 stagger
- 현재 슬라이드 + fade 만. 셀 단위 stagger 가 모바일에서 더 자연스러움.
- `motion.div` 에 `transition={{ staggerChildren: 0.012 }}` + 셀에 `initial / animate` opacity.

### 5. 일정 추가/삭제 시 셀 강조
- 새 이벤트 추가 직후 그 셀에 1초 highlight pulse — 사용자가 "추가됐구나" 인지.
- `motion.div animate={{ background: ["yellow/20", "transparent"] }} transition={{ duration: 1 }}` 1회.

## L — 있으면 좋음

### 6. WeatherIcon 터치 영역 확대
- `calendar-view.tsx` weather icon 클릭 영역 좁음. `padding: 4px` 추가로 hit-target 44px 확보.

### 7. 셀 hover 마이크로 인터랙션
- 데스크톱 전용. `hover:bg-accent/30` 로 셀 위 어디 있는지 시각적 cue.

## 적용 순서
1. H1 holiday memo (즉시 효과)
2. H2 onEventMove useCallback
3. M3 DnD 드롭 피드백
4. M5 추가 시 highlight
5. L6 weather hit-target
