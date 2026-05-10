// 달력 그리드 셀 안의 일정 바 레이아웃 상수.
// 모바일 1셀 ~70px 안에 3건이 들어가도록 BAR_H/STEP/font 를 보수적으로 책정.
export const MAX_VISIBLE_SLOTS = 3;
export const BAR_H = 11;
export const BAR_GAP = 1;
export const BAR_STEP = BAR_H + BAR_GAP;
export const BAR_FONT = 7;

// 셀 헤더(날짜·날씨) 영역 높이 — 동적 슬롯 계산용.
export const CELL_HEADER_PX = 25;
// 하단 +N 표시 여유 — 동적 슬롯 계산 시 차감.
export const CELL_PLUSN_PX = 6;
