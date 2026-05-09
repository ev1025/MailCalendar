# Knowledge — 지식창고 (`/knowledge`)

## 핵심 파일
- `src/app/knowledge/knowledge-client.tsx` (650줄)
- `src/components/knowledge/*`

---

## H — 필수

### 1. ✅ handleAddFolder / handleAddItem useCallback — `252089c`
- 매 렌더 새 함수 → 안정화.

### 2. ✅ listActions JSX useMemo — `252089c`
- 매 렌더 새 fragment → 메모화. PageHeader actions prop 안정.

### 3. ⏳ selectedItem useMemo 적용 검증
- `knowledge-client.tsx:90-96` 이미 useMemo. deps `[items, searchResults, selectedItemId]` 정상. 추가 분석 시 items/searchResults reference 안정성 확인.

### 4. ⏳ armAutoSave 의존성 과다
- `knowledge-client.tsx:108` 7개 deps → 거의 매 입력마다 새 함수 → 자동 저장 타이머 reset 빈도 ↑.
- → 함수 내부에서 ref 로 최신 값 읽기. deps 줄임.

---

## M — 권장

### 5. ⏳ 폴더 reorder 애니메이션 부재
- 드래그 후 목록 순간 변경.
- → `motion.div layoutId={folder.id}` + AnimatePresence.

### 6. ⏳ 폴더 진입/이탈 페이지 전환
- explorer ↔ folderList 전환 시 fade 만. 좌측바 잔존감 부족.
- → `<AnimatePresence mode="wait">` + 슬라이드.

### 7. ⏳ 검색 디바운스 검증
- `knowledge-client.tsx:80-88` 이미 300ms 디바운스. 검색 결과 highlight 미지원 — 결과 항목에 매칭 단어 강조 mark 추가.

### 8. ⏳ 마크다운 에디터 unsaved indicator
- `dirty` state 만 내부. 제목 옆에 작은 dot/pulse 로 시각화.

---

## L — 있으면 좋음

### 9. ⏳ 스크롤 위치 복원
- 폴더 진입 후 벗어나 다시 진입 시 스크롤 0. sessionStorage 키.

### 10. ⏳ 빈 폴더 일러스트
- 폴더 안에 노트 없을 때 "새 노트 만들기" CTA + 일러스트.

---

## 적용 순서 (남은 미적용)
1. ⏳ H4 armAutoSave deps 단순화
2. ⏳ M5 layoutId 폴더 reorder
3. ⏳ M6 페이지 전환 애니메이션
4. ⏳ M8 dirty indicator
5. ⏳ L9 스크롤 위치 복원
