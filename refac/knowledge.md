# Knowledge — 지식창고 (`/knowledge`)

## 핵심 파일
- `src/app/knowledge/knowledge-client.tsx` (650줄)
- `src/components/knowledge/*`

---

## 기존 10 항목

### H
1. ✅ handleAddFolder/Item useCallback — `252089c`
2. ✅ listActions useMemo — `252089c`
3. ⏳ selectedItem useMemo 검증
4. ⏳ armAutoSave deps 줄임

### M
5. ⏳ 폴더 reorder layoutId
6. ⏳ 폴더 진입/이탈 페이지 transition
7. ⏳ 검색 highlight
8. ⏳ unsaved indicator

### L
9. ⏳ 스크롤 위치 복원
10. ⏳ 빈 폴더 일러스트

---

## 코드 효율성 (10)

### CE-1 ⏳ `knowledge-client.tsx` 650줄 분할
- 폴더 트리 / 노트 리스트 / 에디터 / 검색 영역 sub-component 분리.

### CE-2 ⏳ tiptap editor 동적 import
- 큰 lib (~100KB+). 에디터 진입 시점 lazy load.

### CE-3 ⏳ search debounce 검증
- 이미 300ms. 결과 highlight 도입 시 debounce 재검증.

### CE-4 ⏳ folder tree 재귀 렌더 메모
- 폴더 컴포넌트 memo + props 안정화.

### CE-5 ⏳ tags 입력 split/trim 효율
- 태그 입력 매 변경 시 split → 디바운스.

### CE-6 ⏳ pendingNew state shape 명확화
- discriminated union (folderId | parentId) 으로.

### CE-7 ⏳ dirty 판정 구체화
- editTitle / editContent vs selectedItem 비교 — 명시적 함수.

### CE-8 ⏳ 검색 결과 캐시
- 같은 쿼리 재검색 시 cache (TanStack queryKey).

### CE-9 ⏳ folder reorder API 최적화
- 매 reorder 마다 N개 update — bulk update.

### CE-10 ⏳ markdown 렌더 memo
- 같은 content 면 같은 HTML — memo.

---

## 디자인 (10)

### D-1 ⏳ 폴더 트리 들여쓰기 시각
- depth 별 indent + 폴더 이모지/아이콘.

### D-2 ✅ 활성 폴더/노트 강조 — `e4dd33d`
- 활성 노트 inset shadow primary left bar + 아이콘 primary 색.

### D-3 ⏳ 노트 카드 미리보기
- 제목 + 요약 + 수정시간. 현재 디자인 검증.

### D-4 ⏳ 에디터 toolbar 간소화
- 자주 안 쓰는 버튼 ··· 메뉴로.

### D-5 ⏳ 검색 input 위치
- 사이드바 상단 sticky.

### D-6 ⏳ 빈 폴더 일러스트
- "이 폴더 비어 있어요" + "새 노트 만들기" CTA.

### D-7 ⏳ 핀 아이콘 디자인
- 핀 cap 시각화. 활성/비활성 톤.

### D-8 ⏳ 코드 블록 syntax highlight 색
- 다크 모드 contrast.

### D-9 ⏳ 태그 chip 디자인
- 다른 페이지 chip 과 일관.

### D-10 ⏳ 폴더 우클릭 메뉴 vs 모바일 long-press
- 데스크톱 contextmenu, 모바일 sheet.

---

## 애니메이션 (10)

### A-1 ⏳ 폴더 reorder layoutId
- `motion.div layoutId={folder.id}`.

### A-2 ⏳ 페이지 전환 (explorer ↔ folder)
- AnimatePresence mode="wait" + slide-x.

### A-3 ⏳ 검색 결과 fade
- 결과 도착 시 list fade-in stagger.

### A-4 ⏳ 핀 토글 spring
- 핀 켜는 순간 ✓ + scale.

### A-5 ⏳ 자동 저장 dot pulse
- 미저장 변화 있을 때 작은 dot pulse.

### A-6 ⏳ 에디터 진입 fade
- 노트 클릭 → 에디터 fade-in.

### A-7 ✅ 폴더 펼침 chevron rotate — `e4dd33d`
- ChevronRight rotate-0/90° transition duration-200.

### A-8 ⏳ 노트 추가 시 list 위에서 slide
- 새 노트 list top 에 추가 + slide-down.

### A-9 ⏳ 마크다운 미리보기 모드 토글
- edit ↔ preview 전환 fade.

### A-10 ⏳ 드래그 폴더 이동 시각 cue
- 드롭 가능 폴더 highlight.

---

## 적용 순서 (남은 미적용 우선)
1. CE-2 tiptap dynamic import
2. A-1 layoutId reorder
3. D-2 활성 강조
4. A-7 chevron rotate
5. CE-1 파일 분할
