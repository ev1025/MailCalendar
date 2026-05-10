# MailCalendar 리팩토링 가이드

시니어 풀스택 + 시니어 디자이너 관점에서 네비게이션바 페이지별 개선 항목을
4개 카테고리로 정리.

## 페이지별 항목 구성

각 페이지 문서 = **40개 항목**:
1. **기존 H/M/L** (10) — 코드 비효율·정합성·핵심 UX
2. **코드 효율성** (10) — useMemo/useCallback, 파일 분할, 헬퍼 추출, 동적 import 등
3. **디자인** (10) — 톤·간격·다크모드·빈 상태·일러스트
4. **애니메이션** (10) — fade·spring·layoutId·stagger·transition

총 **8 페이지 × 40 = 320 항목**.

## 페이지 목록

| 문서 | 라우트 | 적용 / 320 |
|---|---|---|
| [profile.md](./profile.md) | `/profile` | 7 |
| [calendar-view.md](./calendar-view.md) | `/calendar?view=calendar` | 3 |
| [calendar-database.md](./calendar-database.md) | `/calendar?view=database` | 1 |
| [finance.md](./finance.md) | `/finance` | 2 |
| [products.md](./products.md) | `/products` | 2 |
| [knowledge.md](./knowledge.md) | `/knowledge` | 2 |
| [travel.md](./travel.md) | `/travel` | 1 |
| [travel-plans.md](./travel-plans.md) | `/travel/plans` | 2 |

**적용 완료: 20 / 320**

## 우선순위 표시

각 항목 앞에:
- ✅ 적용 완료 (커밋 hash 명시)
- ⏳ 미적용

분류:
- **H (필수)** — 정합성·핵심 UX. 사용자/데이터에 직접 영향.
- **M (권장)** — 일관성·폴리시.
- **L (있으면 좋음)** — 마이크로 인터랙션·옵션.
- **CE-N** — 코드 효율성.
- **D-N** — 디자인.
- **A-N** — 애니메이션.

## 공통 패턴

### 코드 효율성 — 자주 쓰이는 7가지
1. **인라인 함수 → useCallback** — 자식 memo 무효화 방지.
2. **인라인 객체/배열 → useMemo** — 의존성 안정화.
3. **큰 컴포넌트 → 파일 분할** — 615+ 줄 client 는 sub-component 추출.
4. **다단계 useMemo → 단일 reducer** — filter+sort+map 통합.
5. **상수 추출** — 매직 넘버 → `lib/<domain>/constants.ts`.
6. **동적 import** — tiptap, NaverMap 등 큰 lib lazy load.
7. **타입 안전성** — `any` 제거, discriminated union 활용.

### 디자인 — 7가지 일관 규칙
1. **rounded** — 카드 `2xl`, row `xl`, chip `full`.
2. **간격 시스템** — `gap-2 / 3 / 4` 통일.
3. **색 토큰** — hex 직접 → CSS var (`--primary`, `--accent`).
4. **다크모드 검증** — 모든 색 contrast / opacity 페어.
5. **빈 상태 일러스트** — 텍스트만이 아닌 아이콘 + CTA.
6. **터치 영역 44px** — 작은 액션 `p-1` 패딩.
7. **focus-visible** — 모든 인터랙티브 요소.

### 애니메이션 — 7가지 정석
1. **fade-in stagger** — 페이지 진입.
2. **AnimatePresence + motion.tr/div** — 리스트 enter/exit.
3. **layoutId** — 위치 이동 (정렬 변경, 카드 ↔ 상세).
4. **whileTap / whileHover** — 마이크로 인터랙션.
5. **spring** — 토글, 체크.
6. **공통 ease** — `[0.22, 1, 0.36, 1]` 통일.
7. **transition-colors duration-200** — 색 변경.

## 진행 방식

각 페이지 문서 하단의 **"적용 순서"** 섹션 우선. 작은 fix 묶음 단위로 commit + push.
