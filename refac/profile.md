# Profile — 내 프로필 (`/profile`)

## 핵심 파일
- `src/app/profile/page.tsx`
- `src/components/calendar/share-manager.tsx` (헤더 액션에서 호출)

---

## H — 필수

### 1. ✅ dirty 판정 useMemo — `bfd3800`
- 7개 조건 AND 매 렌더 → 메모화.

### 2. ✅ 디자인 전면 재설계 — `059fabe`
- Hero radial wash + 단일 통합 카드 + 액션 row.

### 3. ✅ 헤더 액션 [공유] [설정] — `c670a2e`
- 본문 카드 단일 → 헤더 우측 두 아이콘.

### 4. ⏳ 아바타 업로드 race
- `cropping` state 외 saving·uploading 분리 부재.
- → 업로드 진행 중 form submit 차단. 인라인 스피너.

---

## M — 권장

### 5. ✅ 이모지 hover/tap 애니메이션 — `bfd3800`
- whileTap 0.88, whileHover 1.08, spring.

### 6. ✅ ShareManager 디자인 갈아엎기 — `c670a2e`
- 4개 섹션 + 카드 톤 차별화 + ↔ 양방향 아이콘.

### 7. ⏳ 색상 피커 backdrop 부재
- ColorPickerRow 열림 시 페이지 스크롤 가능. 외부 클릭 시 닫기 미보장.
- → backdrop 또는 Sheet 래핑.

### 8. ⏳ 저장 disabled 조건 단순화
- `!name.trim() || !dirty || saving` — dirty 안에 이미 name 변화 포함.
- → `!dirty` 만 (이름 빈 경우는 dirty=false 로 처리).

---

## L — 있으면 좋음

### 9. ⏳ inline validation 메시지
- 빈 이름 저장 시 toast.error 만. inline `<p className="text-destructive">` 노출.

### 10. ⏳ 크롭 후 미리보기 (저장 전 취소 가능)
- 업로드 즉시 avatar 갱신. 저장 전 취소 가능하게 분리.

---

## 적용 순서 (남은 미적용)
1. ⏳ H4 업로드 race 분리
2. ⏳ M7 색상 피커 backdrop
3. ⏳ L9 inline validation
4. ⏳ M8 disabled 조건 단순화
5. ⏳ L10 크롭 미리보기 분리
