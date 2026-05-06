/**
 * 햅틱 피드백 — 모바일에서 길게 누르기·드래그 시작·삭제 확정 등 액션 트리거에 사용.
 * navigator.vibrate 미지원 환경(데스크톱·iOS Safari) 에서는 silent no-op.
 *
 * 단일 펄스(짧은 톡) / 더블 / 길게 — 의미별 패턴.
 */

export function hapticTap() {
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  navigator.vibrate(10);
}

export function hapticSelect() {
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  navigator.vibrate(35);
}

export function hapticConfirm() {
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  navigator.vibrate([20, 40, 20]);
}
