# Profile — 내 프로필 (`/profile`)

## 핵심 파일
- `src/app/profile/page.tsx`
- `src/components/calendar/share-manager.tsx`

---

## 기존 10 항목 (H/M/L)

### H — 필수
1. ✅ dirty 판정 useMemo — `bfd3800`
2. ✅ 디자인 전면 재설계 — `059fabe`
3. ✅ 헤더 액션 [공유][설정] — `c670a2e`
4. ⏳ 아바타 업로드 race — `cropping`/saving/uploading 분리

### M — 권장
5. ✅ 이모지 hover/tap 애니메이션 — `bfd3800`
6. ✅ ShareManager 디자인 갈아엎기 — `c670a2e`
7. ⏳ 색상 피커 backdrop 부재 — Sheet 또는 backdrop
8. ⏳ 저장 disabled 조건 단순화 — `!dirty` 만

### L — 있으면 좋음
9. ⏳ inline validation 메시지 — 빈 이름 시 inline
10. ⏳ 크롭 후 미리보기 (저장 전 취소 가능)

---

## 코드 효율성 (10)

### CE-1 ⏳ PRESET_EMOJIS 를 `lib/preset-emojis.ts` 로 추출
- 다른 페이지(이모지 픽커) 재사용 + 트리쉐이킹.

### CE-2 ⏳ `handleImageUpload` `useCallback`
- input onChange 매 렌더 새 함수.

### CE-3 ⏳ `handleUpdate` `useCallback`
- deps `[currentUser, name, emoji, color, avatarUrl, avatarMode, updateUser]`.

### CE-4 ⏳ `AVATAR_MAX_BYTES` 상수화
- `10_000_000` 매직 넘버 → `const AVATAR_MAX_BYTES = 10 * 1024 * 1024`.

### CE-5 ⏳ avatar 이미지 cleanup 일관화
- 업로드 후 이전 URL 삭제는 `AvatarCropDialog onConfirm` 안에. 모드 전환 시 누수 가능 — 검증.

### CE-6 ⏳ `translateError` 적용
- `updateUser` error 메시지가 `string | unknown`. `translateError` 통일.

### CE-7 ⏳ AvatarMode 타입 별도 export
- `"image" | "emoji"` 두 곳 이상 등장 — `types/profile.ts`.

### CE-8 ⏳ `Suspense` fallback 의 의미 검토
- `useSearchParams` 가 페이지에서 안 쓰이면 Suspense 불필요.

### CE-9 ⏳ 로딩 게이트 단순화
- `authLoading || !currentUser` 두 조건 + 두 useEffect → 하나의 derived state.

### CE-10 ⏳ `ColorPickerRow` 가 controlled 인지 검증
- onChange 매 렌더 새 함수면 자식 리렌더 ↑.

---

## 디자인 (10)

### D-1 ⏳ Hero radial 색 토큰화
- 인라인 `${color}25` → CSS 변수 `--profile-accent` 로 추출.

### D-2 ⏳ 아바타 크기 반응형
- 모바일 96px / 데스크톱 112px (`h-24 md:h-28`). 좁은 화면 정보 밀도 ↑.

### D-3 ⏳ 카드 rounded 일관성
- `rounded-xl` vs `rounded-2xl` 혼재. 카드 = `2xl`, row = `xl` 표준화.

### D-4 ⏳ divide-y 색 토큰
- `border` default. `divide-border/60` 으로 부드러움.

### D-5 ⏳ 이모지 격자 셀 사이즈
- `h-8` → `h-9`. 모바일 터치 영역 +4px.

### D-6 ⏳ grid-cols-8 vs 6
- 24개 emoji / 8 cols = 3행. 6 cols = 4행. 이모지가 더 큼.

### D-7 ⏳ 색상 피커 dot 크기 통일
- ColorPickerRow 의 swatch 크기와 ShareManager Avatar size 시각 일관.

### D-8 ⏳ 다크모드 radial wash 검증
- `${color}25` 가 다크모드에서 너무 진하면 wash 무력. opacity 조절.

### D-9 ⏳ "변경 없음" 라벨 vs "저장됨"
- dirty=false 시 "변경 없음" → "저장됨 ✓" 가 더 긍정적 피드백.

### D-10 ⏳ 헤더 액션 gap
- 공유·설정 두 아이콘 사이 `gap-1`. 현재 `flex` 만.

---

## 애니메이션 (10)

### A-1 ⏳ Hero 첫 진입 fade-in
- `motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}` 230ms.

### A-2 ⏳ 페이지 stagger
- Hero → 편집 카드 → 공유 카드 0.06s stagger.

### A-3 ⏳ 모드 토글 row 슬라이드
- 이미지 ↔ 이모지 모드 전환 시 row 페이드 + slide-y.

### A-4 ⏳ 저장 성공 시 버튼 pulse
- `saving=false` 직후 `animate={{ scale: [1, 1.04, 1] }} duration: 0.4`.

### A-5 ⏳ 색상 피커 dot 클릭 spring
- 클릭 시 scale 0.85 → 1, spring stiffness 380.

### A-6 ⏳ Hero 이모지 변경 crossfade
- 이모지 변경 시 hero 아바타 내부 emoji `AnimatePresence mode="wait"` crossfade.

### A-7 ⏳ dirty 진입 시 저장 버튼 attention
- 첫 dirty 시점 한 번 `animate={{ y: [-1, 0, -1, 0] }}` 약한 흔들림.

### A-8 ✅ radial wash transition 500ms — `059fabe`
- color 변경 시 부드럽게.

### A-9 ⏳ 헤더 액션 hover micro
- 두 아이콘 `whileHover={{ scale: 1.05 }}`.

### A-10 ⏳ 공유 트리거 → ShareManager slide-in
- 헤더 공유 클릭 시 PanelDialog enter 슬라이드 (이미 있음 — duration 검토).

---

## 적용 순서 (남은 미적용 우선)
1. CE-2/3 핸들러 useCallback (1줄 fix)
2. D-9 "저장됨 ✓" 라벨
3. A-1 Hero fade-in
4. A-2 페이지 stagger
5. CE-1 PRESET_EMOJIS lib 추출
