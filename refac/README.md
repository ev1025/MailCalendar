# MailCalendar 리팩토링 가이드

시니어 풀스택 관점에서 네비게이션바 페이지별로 코드 비효율·애니메이션·UX 개선 항목을 **각 10개씩** 정리.

## 페이지 목록

| 문서 | 라우트 | 항목 수 | 적용 완료 |
|---|---|---|---|
| [profile.md](./profile.md) | `/profile` | 10 | 6 / 10 |
| [calendar-view.md](./calendar-view.md) | `/calendar?view=calendar` | 10 | 3 / 10 |
| [calendar-database.md](./calendar-database.md) | `/calendar?view=database` | 10 | 1 / 10 |
| [finance.md](./finance.md) | `/finance` | 10 | 2 / 10 |
| [products.md](./products.md) | `/products` | 10 | 2 / 10 |
| [knowledge.md](./knowledge.md) | `/knowledge` | 10 | 2 / 10 |
| [travel.md](./travel.md) | `/travel` | 10 | 1 / 10 |
| [travel-plans.md](./travel-plans.md) | `/travel/plans` | 10 | 2 / 10 |

**총 80개 항목 · 19개 적용 완료**

## 우선순위

- **H (필수)** — 코드 비효율·정합성·핵심 UX. 사용자 또는 데이터에 직접 영향.
- **M (권장)** — 애니메이션·일관성·중간 영역 개선. 폴리시 수준.
- **L (있으면 좋음)** — 마이크로 인터랙션·접근성 보강·옵션.

각 항목 앞 표시:
- ✅ 적용 완료 (커밋 hash 명시)
- ⏳ 미적용

## 공통 패턴

### 1. 매 렌더 객체·배열 재생성 (가장 흔한 비효율)
인라인 `[…]` / `{…}` / `() => …` 가 의존성 배열에 들어가면 매 렌더 재생성. `useMemo` / `useCallback` 으로 메모화.

### 2. 자식 memo 무효화
메모화 안 된 핸들러를 `memo()` 자식에 prop 으로 넘기면 무용지물. 모든 핸들러를 `useCallback` 으로 안정화.

### 3. 리스트 가상화
50+ 행 렌더되는 곳: `@tanstack/react-virtual` (동적 높이) 또는 `react-window` (고정 높이).

### 4. Framer Motion 일관성
- `<AnimatePresence mode="wait">` — 같은 슬롯의 진입/퇴출
- `<motion.div layoutId>` — 위치 이동 (정렬 변경, 카드 ↔ 상세)
- 통일 ease: `transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}`

### 5. 모바일 터치 영역
최소 44px (WCAG). 작은 액션 버튼은 `p-1` 패딩으로 hit-target 확보. TouchSensor 200ms delay 검증된 값.

### 6. 영속성 (localStorage)
사용자 토글 / 정렬 / 펼침 상태 등은 localStorage 영속. `persistent-cache.ts` 활용 권장.

### 7. ARIA 보강
모든 인터랙티브 요소에 `aria-label` 또는 visible label. 아이콘 only 버튼은 sr-only 또는 title.

## 진행 방식

각 페이지 우선순위 (H 먼저) 에 따라 순차 적용. 페이지 fix 묶음 단위로 commit + push.

```
H 미적용 → M 미적용 → L 미적용
```

미적용 H 항목 목록은 각 문서 하단 "적용 순서" 섹션 참고.
