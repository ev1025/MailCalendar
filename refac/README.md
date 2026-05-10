# MailCalendar 리팩토링 가이드

페이지별 리팩토링 항목을 정리한 문서 인덱스.

각 페이지 문서 = 40 항목 (기존 H/M/L 10 + 코드 효율성 10 + 디자인 10 + 애니메이션 10).

| 문서 | 라우트 | 적용 / 40 |
|---|---|---|
| [profile.md](./profile.md) | `/profile` | 7 |
| [calendar-view.md](./calendar-view.md) | `/calendar?view=calendar` | 3 |
| [calendar-database.md](./calendar-database.md) | `/calendar?view=database` | 1 |
| [finance.md](./finance.md) | `/finance` | 2 |
| [products.md](./products.md) | `/products` | 2 |
| [knowledge.md](./knowledge.md) | `/knowledge` | 2 |
| [travel.md](./travel.md) | `/travel` | 1 |
| [travel-plans.md](./travel-plans.md) | `/travel/plans` | 2 |

**총 20 / 320 적용**

각 항목 라벨:
- `H-N / M-N / L-N` — 기존 우선순위 분류
- `CE-N` — 코드 효율성
- `D-N` — 디자인
- `A-N` — 애니메이션

상태:
- ✅ 적용 완료 (커밋 hash 명시)
- ⏳ 미적용
