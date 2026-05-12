# 수정 제안서 — Vercel 배포 전 React/Next 안티패턴 점검

`feature-dev:code-reviewer` 로 `src/hooks/` · `src/app/` · `src/components/` 전체를 점검한 결과.
React 19 / Next 16(App Router·RSC) / TanStack Query v5 / @supabase/ssr 기준.

우선순위: **P1 = 실제 버그(배포 시 문제 가능)** · **P2 = 성능·정확성 냄새** · **P3 = 소소한 정리**.
각 항목은 *현재 코드 기준* 이며, 이미 고쳐졌으면 무시.

---

## P1 — 실제 버그 (먼저 고칠 것)

### P1-1. `pull-to-refresh.tsx:89` — 터치 핸들러 stale 클로저 + 매 touchmove 마다 리스너 재등록
`useEffect` deps 에 `pull`·`refreshing` 이 들어 있어서, 손가락이 움직일 때마다(touchmove) 네 개의
터치 리스너를 떼었다 다시 단다. `onTouchEnd` 가 캡처한 `pull` 이 마지막 재등록 시점 값이라
릴리즈 임계값 판정이 어긋날 수 있고, 일부 안드로이드 WebView 에선 드래그 도중 `touchstart` 가
다시 발화해 `startYRef` 가 초기화됨.
**고침:** `pull`·`refreshing` 을 `useRef` 로 잡아 핸들러가 ref 를 직접 읽게 하고, 리스너는 마운트 시
1회만 등록. deps = `[onRefresh, threshold, scrollableSelector]`.

### P1-2. `use-knowledge-router.ts:17~47` — URL ↔ `useState` 이중 진실원(double source of truth)
`selectedItemId`·`viewFolderId` 를 `useState` 로도 들고 `useSearchParams` 에서도 파생 → `useEffect`
로 URL→state 재동기화. set 함수가 `_setState` + `pushUrl` 을 둘 다 호출 → 다음 렌더에서 searchParams
변경 → 동기화 effect 가 또 setState → 3중 렌더. 뒤로가기 시 한 프레임 동안 `null` 이 보임.
(이게 `knowledge-client.tsx:252` 의 `setTimeout(50)` 꼼수의 근본 원인.)
**고침:** `useState`·동기화 effect 제거. 렌더 중 `const selectedItemId = searchParams.get("item")` 처럼
직접 파생. `_setSelectedItemIdDirect` 탈출구와 setTimeout 도 같이 사라짐.

### P1-3. `use-calendar-events.ts:104~108` — `queryKey` `useMemo` deps 에 배열(`visibleUserIds`) → 부모 리렌더마다 키 재생성 → 재패칭
`visibleUserIds` 는 prop 배열이라 부모가 리렌더하면 내용이 같아도 참조가 새것 → `queryKey` 재계산
→ TanStack Query 가 새 키로 보고 재패칭. 같은 파일 `visibleKey`(=정렬+join 문자열)는 이미 prefetch
effect 에서 올바르게 쓰고 있음 — 그걸 메인 `queryKey` deps 에도 쓰면 됨.
같은 패턴: `use-travel-items.ts:71`, `use-travel-plans.ts:67` (둘 다 `visibleUserIds?: string[]` 를 deps 에 직접).
**고침:** `visibleKey = useMemo(() => [...visibleUserIds].sort().join(","), [visibleUserIds])` 를 먼저 만들고
`queryKey` deps 에 raw 배열 대신 `visibleKey` 사용.

### P1-4. `use-leg-paths.ts:29~69` — effect 안에서 `legPaths` 를 읽는데 deps 에선 제외 → stale 클로저로 이미 받은 경로 재패칭
캐시 가드 `if (legPaths[key] || pending.current.has(key)) continue` 가 stale `legPaths`(=`{}`)를 읽어
`visibleLegs` 가 바뀔 때마다 이미 해결된 경로까지 다시 요청. `pending` ref 가 동시 중복만 막을 뿐.
**고침:** 해결된 경로 추적용 ref 추가 — `const resolvedRef = useRef({})`; effect 에서
`if (resolvedRef.current[key] || pending.current.has(key)) continue`, 패칭 후 `resolvedRef.current[key] = path`.

### P1-5. `use-visible-user-ids.ts:72~79` — 죽은 SSR 가드 + 하이드레이션 때 불필요한 localStorage 이중 쓰기
`useEffect` 안의 `if (typeof window === "undefined") return` 은 항상 false(effect 는 브라우저에서만 실행).
초기 렌더(`[]`) → 첫 effect 가 `initialIds` 로 갱신 → 이 persist effect 재발화 → 페이지 로드마다 이중 쓰기.
**고침:** 죽은 가드 제거. persist 를 첫 effect 나 `toggleVisible` 안으로 합쳐 별도 effect 자체를 없애는 게 깔끔.

---

## P2 — 성능·정확성

### P2-1. `use-url-param.ts:48~54` — "불필요한 effect" 교과서 사례 (외부 스토어 값을 effect 로 state 에 복사)
`useState` 초기값에서 이미 searchParams 를 읽고 있는데, effect 로 또 동기화. set 호출 시
state+URL 동시 갱신 → 다음 searchParams 변경이 이 effect 발화 → 방금 set 한 값을 이전 URL 값으로
덮을 수 있는 레이스. `react-hooks/exhaustive-deps` 억제가 `value` 가 stale dep 인 걸 가림.
**고침:** `useState`·`useEffect` 제거. `const value = readParam(searchParams, key) ?? defaultValue` 로 직접 파생.
set 콜백은 URL 만 갱신 → 다음 렌더에서 새 searchParams 읽힘.

### P2-2. `calendar-client.tsx:71~80` — `yParam`/`mParam` → `year`/`month` state 동기화 effect (P2-1 과 동일 패턴)
스와이프 네비 시 `setYear`/`setMonth` → `router.push` → `yParam`/`mParam` 변경 → 이 effect 가 또
`setYear`/`setMonth` → 불필요한 두 번째 렌더.
**고침:** `year`/`month` 를 이미 있는 `useUrlNumberParam("y", ...)`·`useUrlNumberParam("m", ...)` 로 끌어올리고
로컬 state + effect 제거. (단, `useUrlNumberParam` 도 P2-1 처럼 고친 뒤에.)

### P2-3. `use-form-draft.ts` — (해결됨) 파일 자체를 삭제함
`beforeunload` 핸들러의 stale `storageKey` 이슈 — 이 훅은 아무 데서도 안 쓰여서 이번에 파일 삭제.

### P2-4. `use-weather.ts:63~75` — `computeInitialMap()` 이 마운트 때 2번 호출(= localStorage 2번 읽음)
`useState(computeInitialMap)` + `useState(() => Object.keys(computeInitialMap()).length === 0)`.
**고침:** 한 번만 읽기 — `const init = useState(() => { const m = computeInitialMap(); return { m, loading: Object.keys(m).length === 0 }; })` 식으로 묶거나 단일 객체 state.

### P2-5. `use-weather-location.ts:37~48` — 초기 state 가 하드코딩 서울 → 다른 지역 사용자에게 날씨 깜빡임
`useState(DEFAULT)` 라 첫 렌더는 항상 서울 → `useWeather` 가 서울 키로 한 번 패칭 → effect 가 실제 위치로
갱신 → 또 패칭.
**고침:** `const [loc, setLoc] = useState(() => getWeatherLocation())` (lazy init). `getWeatherLocation` 안에
이미 `typeof window` 가드 있음.

### P2-6. `use-auto-refetch.ts` — (해결됨) 파일 삭제함
`SIGNED_IN` 이 세션 복원 시에도 발화해 마운트마다 재패칭하던 이슈 — 이 훅도 안 쓰여서 삭제.

### P2-7. `use-transactions.ts:113~135` — prefetch effect deps 에 `endDate` 누락
`endDate` 가 주어지고 바뀌면(보통은 안 그렇지만) 인접 월 prefetch 키가 stale. deps 에 추가 권장.

---

## P3 — 소소한 정리

### P3-1. `knowledge-client.tsx:249~263` — `setTimeout(50)` 으로 effect 뒤 state 순서 맞추는 꼼수
`setSelectedItemId` 가 `useEffect`(line 111)를 발화해 `editTitle`/`editContent` 를 리셋 → 그래서 50ms 뒤
다시 set. 느린 기기에선 실패 가능. **근본 고침:** form state 리셋을 effect 로 하지 말고 form 컴포넌트에
`key` prop 을 주거나 "pending override" ref 사용. (P1-2 를 고치면 이 꼼수도 자연히 사라짐.)

### P3-2. `app-shell.tsx:49~62` — `gateOpen` 을 effect 로 파생 (렌더 중 계산 가능)
`gateOpen = hydrated && !authLoading && !usersLoading && (!authUser || !currentUser)` 로 렌더 중 계산하면 됨.
바로 아래 `allowClose` 는 이미 그렇게 돼 있음.

### P3-3. `auth-supabase.ts:125~143` — `onAuthStateChange` 가 `getSession()` await 이후라 그 사이 이벤트 놓칠 수 있음(미세 레이스)
@supabase/ssr 권장 패턴은 `onAuthStateChange` 만 쓰고 `getSession()` 호출 제거.

---

## 권장 적용 순서
1. **P1-3 / P1-1 / P1-5** — 작고 효과 큼 (재패칭·리스너 누수 제거).
2. **P1-2 + P3-1** — 같이 고치면 setTimeout 꼼수까지 정리.
3. **P2-1 + P2-2** — `useUrlParam` 패턴을 "effect 동기화" → "렌더 중 파생" 으로 (지식창고 라우터 P1-2 와 같은 원리).
4. **P2-5 / P2-4 / P2-7 / P1-4** — 데이터 패칭 깜빡임·중복 제거.
5. **P3-2 / P3-3** — 여유 될 때.

> ⚠️ 이 문서는 "제안"입니다. 각 항목은 독립적으로 고칠 수 있고, 실제 적용 전 해당 파일을 한 번 더 확인하세요.
