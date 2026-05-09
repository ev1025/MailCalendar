/**
 * calendar_events insert/update payload 정제기.
 *
 * 신규/옵션 컬럼(tag/repeat/sort_order/shared_with/shared_accepted_by/series_id)이
 * 아직 DB 스키마에 없는 환경에서 fallback retry 가능하도록, 비어있거나 default
 * 의미인 값은 payload 에서 제거. 호출자(useCalendarEvents)는 1차 insert 실패 시
 * 이 필드들을 한꺼번에 빼고 재시도.
 */
export function safeCalendarEventData(data: Record<string, unknown>) {
  const {
    tag,
    repeat,
    sort_order,
    shared_with,
    shared_accepted_by,
    series_id,
    ...rest
  } = data;
  const result: Record<string, unknown> = { ...rest };
  if (tag !== undefined && tag !== null && tag !== "") result.tag = tag;
  if (repeat !== undefined && repeat !== null && repeat !== "none")
    result.repeat = repeat;
  if (sort_order !== undefined && sort_order !== null)
    result.sort_order = sort_order;
  if (shared_with !== undefined) result.shared_with = shared_with;
  if (shared_accepted_by !== undefined)
    result.shared_accepted_by = shared_accepted_by;
  if (series_id !== undefined) result.series_id = series_id;
  return result;
}
