# Knowledge — 지식창고 (`/knowledge`)

## 핵심 파일
- `src/app/knowledge/knowledge-client.tsx` (650줄)
- `src/components/knowledge/*`

## H — 필수

### 1. selectedItem 매 렌더 O(n) lookup
- `knowledge-client.tsx:90-96` — 검색어/선택 변경 시마다 items + searchResults 전체 순회.
- 수정: `useMemo([items, searchResults, selectedItemId])` 로 메모.

### 2. listActions JSX 매 렌더 재생성
- `knowledge-client.tsx:293-314` — 내용 불변이지만 리터럴로 매번 만들어짐.
- 수정: 컴포넌트 외부 상수로 추출 또는 `useMemo`.

### 3. armAutoSave 의존성 과다
- 7개 deps → 거의 매 입력마다 새 함수 → 자동 저장 타이머 reset 빈도 ↑.
- 수정: 함수 내부에서 ref 로 최신 값 읽기. deps 줄임.

## M — 권장

### 4. 폴더 reorder 애니메이션 부재
- 드래그 후 목록 순간 변경.
- 수정: `motion.div layoutId={folder.id}` + `<AnimatePresence>`.

### 5. 폴더 진입/이탈 페이지 전환
- explorer ↔ folderList 전환 시 fade 만 — 좌측바 잔존감 부족.
- 수정: `<AnimatePresence mode="wait">` + 슬라이드.

## L — 있으면 좋음

### 6. 스크롤 위치 복원
- 폴더 진입 후 벗어나 다시 진입 시 스크롤 0 부터.
- 수정: `useScrollRestoration` (Next.js Router 자체 기능 또는 sessionStorage 키).

## 적용 순서
1. H1 selectedItem 메모
2. H2 listActions 상수 추출
3. M4 폴더 reorder layoutId
4. H3 armAutoSave 단순화
