# MailCalendar 리팩토링 가이드

시니어 풀스택 관점에서 네비게이션바 페이지별 코드 비효율·애니메이션·UX 개선 항목을 정리한 문서.

## 페이지 목록

| 문서 | 라우트 | 핵심 fix 우선순위 |
|---|---|---|
| [calendar-view.md](./calendar-view.md) | `/calendar?view=calendar` | DnD 드롭 피드백, holiday 메모, 셀 hover |
| [calendar-database.md](./calendar-database.md) | `/calendar?view=database` | 가상화, 행 enter/exit 애니메이션 |
| [finance.md](./finance.md) | `/finance` | useCallback, fixedSet → Map, 폼 리셋 |
| [products.md](./products.md) | `/products` | DndContext 통합, ProductRow memo, grouped 재계산 |
| [knowledge.md](./knowledge.md) | `/knowledge` | selectedItem 메모, listActions 상수, layoutId |
| [travel.md](./travel.md) | `/travel` | 가상화, color map 메모, 리오더 애니메이션 |
| [travel-plans.md](./travel-plans.md) | `/travel/plans` | tasksByDay 단순화, autoScroll 방어, 카드 리오더 피드백 |
| [profile.md](./profile.md) | `/profile` | dirty 판정 메모, 이모지 hover 애니메이션 |

## 공통 패턴

### 1. 매 렌더 객체·배열 재생성
- 인라인 `[…]` / `{…}` / `() => …` 가 의존성 배열에 들어가면 매 렌더 재생성
- `useMemo` / `useCallback` 으로 감싸 메모화
- 메모화 안 된 핸들러를 자식에 prop 으로 넘기면 자식 `memo` 가 무용지물

### 2. 리스트 가상화
- 50+ 행 렌더되는 곳: TanStack Table + react-virtual / react-window
- 테이블 + 카드 그리드 모두 적용 가능

### 3. Framer Motion 일관성
- `<AnimatePresence mode="wait">` — 같은 슬롯의 진입/퇴출
- `<motion.div layoutId>` — 위치 이동 (정렬 변경, 카드 ↔ 상세)
- `transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}` — 통일된 ease

### 4. 모바일 터치 영역
- 최소 44px (WCAG) — 작은 액션 버튼은 패딩으로 hit-target 확보
- TouchSensor 200ms delay 는 검증된 값 (DnD 충돌 회피)

## 진행 방식

이 폴더의 문서를 우선순위(H 먼저)에 따라 순차 적용. 각 페이지 fix 묶음 단위로 commit + push.
