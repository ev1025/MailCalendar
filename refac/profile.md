# Profile — 내 프로필 (`/profile`)

## 핵심 파일
- `src/app/profile/page.tsx` (이전 PR 에서 카드 분리 완료)

## H — 필수

### 1. dirty 판정 매 렌더 재계산
- `profile/page.tsx:72-79` — 7개 조건 AND, 매 렌더 실행.
- 수정: `useMemo([currentUser, name, emoji, color, avatarUrl, avatarMode], ...)` 로 메모.

### 2. 아바타 업로드 race
- `cropping` state 외에 saving·uploading 상태 분리 부재.
- 수정: 업로드 진행 중 form submit 차단. 로딩 inline 표시.

## M — 권장

### 3. 이모지 격자 클릭 피드백
- `profile/page.tsx:248-261` — selected ring 만. click 시 scale + background fade.
- 수정: `motion.button whileTap={{ scale: 0.92 }}`.

### 4. 색상 피커 backdrop 부재
- ColorPickerRow 열림 시 페이지 스크롤 가능 (모달 아님).
- 수정: backdrop 또는 Sheet 로 래핑. 외부 클릭 시 닫기.

### 5. 저장 버튼 disabled 조건 중복
- `!name.trim() || !dirty || saving` 에서 dirty 안에 이미 name 변화 포함됨.
- 수정: `!name.trim()` 만 명시 + dirty 체크.

## L — 있으면 좋음

### 6. inline validation 메시지
- 이름 빈 채로 저장 → toast.error 만. inline `<p className="text-destructive">` 권장.

### 7. 크롭 후 미리보기 (저장 전 취소 가능)
- 업로드 즉시 avatar 갱신. 저장 누르기 전 취소 가능하게 분리.

## 적용 순서
1. H1 dirty 메모
2. M3 이모지 hover/tap 애니메이션
3. M5 disabled 조건 정리
4. L6 inline validation
