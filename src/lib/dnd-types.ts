/**
 * dnd-kit 의 attributes/listeners 를 React.HTMLAttributes 호환 타입으로 래핑.
 *
 * dnd-kit 은 useSortable() 에서 반환하는 attributes/listeners 를 자체 타입으로
 * 노출하는데, 이 객체를 일반 컴포넌트의 dragAttributes/dragListeners prop 으로
 * 넘기려면 React.HTMLAttributes<T> 형태가 필요해서 매번
 *   attributes as unknown as React.HTMLAttributes<HTMLElement>
 * 식으로 이중 캐스팅을 해왔음.
 *
 * 이 헬퍼는 한 함수로 캐스팅을 가둬서 호출처를 깨끗하게 유지.
 *
 * 사용 예:
 *   const { attributes, listeners, setNodeRef } = useSortable({ id });
 *   const dragProps = toDragProps<HTMLDivElement>({ attributes, listeners });
 *   <Card dragAttributes={dragProps.attributes} dragListeners={dragProps.listeners} />
 */

import type { DraggableSyntheticListeners, DraggableAttributes } from "@dnd-kit/core";

export type DragAttributes<T extends HTMLElement = HTMLElement> = React.HTMLAttributes<T>;
export type DragListeners<T extends HTMLElement = HTMLElement> = React.HTMLAttributes<T>;

export function toDragProps<T extends HTMLElement = HTMLElement>(input: {
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
}): {
  attributes: DragAttributes<T>;
  listeners: DragListeners<T> | undefined;
} {
  return {
    attributes: input.attributes as unknown as DragAttributes<T>,
    listeners: input.listeners as unknown as DragListeners<T> | undefined,
  };
}
