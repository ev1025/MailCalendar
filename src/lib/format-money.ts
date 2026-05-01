/**
 * 한국어 화폐 포맷 — 모든 금액 표시는 이 헬퍼로 통일.
 *
 * formatMoney(10000)        → "10,000원"
 * formatMoney(10000, "short") → "1만원"
 * formatMoney(1234567, "short") → "123만원"
 *
 * "short" 옵션은 큰 금액에서 가독성 우선 (천원 단위 절사). 정밀한 거래 내역엔
 * 기본값 사용. 카드/요약 카드처럼 한눈에 큰 금액 비교할 땐 "short" 권장.
 */

const KRW = new Intl.NumberFormat("ko-KR");

export type MoneyFormat = "default" | "short";

export function formatMoney(amount: number, mode: MoneyFormat = "default"): string {
  if (mode === "short") {
    const absAmount = Math.abs(amount);
    const sign = amount < 0 ? "-" : "";
    if (absAmount >= 100_000_000) {
      // 1억 이상
      const eok = Math.floor(absAmount / 100_000_000);
      const man = Math.floor((absAmount % 100_000_000) / 10_000);
      return `${sign}${eok}억${man > 0 ? ` ${man}만원` : "원"}`;
    }
    if (absAmount >= 10_000) {
      // 1만 이상 → 만원 단위. 하위 천원은 절사 (요약용).
      const man = Math.floor(absAmount / 10_000);
      return `${sign}${KRW.format(man)}만원`;
    }
  }
  return `${KRW.format(amount)}원`;
}

/** 부호 포함 (양수에도 +). 가계부 거래 행처럼 income/expense 구분 시. */
export function formatMoneySigned(amount: number, type: "income" | "expense"): string {
  const sign = type === "income" ? "+" : "-";
  return `${sign}${formatMoney(amount)}`;
}
