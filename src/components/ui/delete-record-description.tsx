import * as React from "react";

/**
 * 삭제 ConfirmDialog 의 description 슬롯 공용 컴포넌트.
 *
 * 이전엔 가계부/고정비/제품 등에서 각자 "yyyy년 M월 d일 · 55,000원 · 카테고리"
 * 같은 점(·) 구분 한 줄 형식을 인라인으로 작성. 정보가 많아지면 줄바꿈이
 * 지저분해지고 라벨이 없어 읽기 어려움.
 *
 * 이 컴포넌트는 fields 배열을 받아 "라벨: 값" 형태로 줄바꿈해서 렌더.
 * fields 의 각 항목에 valueClassName 으로 색·tabular-nums 등 적용 가능.
 *
 * 사용:
 *   <ConfirmDialog description={
 *     <DeleteRecordDescription
 *       fields={[
 *         { label: "일자", value: "2026년 4월 28일 (화)", valueClassName: "tabular-nums" },
 *         { label: "금액", value: "-55,000원", valueClassName: "text-finance-loss tabular-nums" },
 *         { label: "카테고리", value: "통신비" },
 *       ]}
 *       footnote="삭제하면 되돌릴 수 없어요."
 *     />
 *   } />
 */
export interface DeleteRecordField {
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
}

interface Props {
  fields: DeleteRecordField[];
  /** 하단 작은 회색 안내문 (선택). */
  footnote?: React.ReactNode;
}

export default function DeleteRecordDescription({ fields, footnote }: Props) {
  // ConfirmDialog 본문은 items-center text-center 정렬이라 description 도 기본 가운데로
  // 몰림. 라벨/값이 가운데 정렬되면 라벨이 어디서 끝나는지 안 보여 가독성 ↓ — 그래서
  // muted 박스 + 라벨 좌·값 우 양쪽 정렬로 정보 단위 명확화.
  return (
    // 제목(ConfirmDialog title) 과 정보 박스 사이 시각적 여백 확보.
    // 라벨 = 고정 폭 좌측, 값 = 그 옆에 좌측 정렬 — "분류 │ 분류내용" 형태로
    // 라벨/값이 자연스럽게 한 줄로 읽힘. (이전 justify-between 양쪽 정렬은 짧은
    // 값일 때 라벨/값 사이 공백이 너무 커 시선이 끊어졌음.)
    <span className="block w-full mt-2">
      <span className="block w-full rounded-md bg-muted/50 px-3 py-2 text-left">
        <span className="block divide-y divide-border/40">
          {fields.map((f, i) => (
            <span
              key={i}
              className="flex items-baseline gap-2 py-1 first:pt-0 last:pb-0"
            >
              <span className="text-[11px] font-medium text-muted-foreground shrink-0 w-14">
                {f.label}
              </span>
              <span
                className={
                  // 삭제 확인은 "무엇을 지우는지" 보여주는 게 핵심 — 긴 이름도 잘리지
                  // 않게 줄바꿈 허용 (break-keep 으로 한국어 어절 단위).
                  "text-[12.5px] text-foreground text-left flex-1 min-w-0 break-keep " +
                  (f.valueClassName ?? "")
                }
              >
                {f.value}
              </span>
            </span>
          ))}
        </span>
      </span>
      {footnote && (
        <span className="mt-2 block text-center text-[11.5px] text-muted-foreground/80 break-keep">
          {footnote}
        </span>
      )}
    </span>
  );
}
