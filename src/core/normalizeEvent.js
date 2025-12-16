/**
 * 지금 구현된 것
 * - 필수 필드 존재 여부 체크
 * - event_type 표준화
 * - event_time -> Date 변환
 * - 파싱 불가 이벤트 제거 (null 변환)
 *
 * normalize는 정책이 점점 늘어나는 파일
 *
 * 예를 들어
 * - event_type whitelist 체크
 * - event_time 가 미래 시점인 이벤트 처리
 * - 필수 이벤트만 통과시키고 나머지 분리
 * - timezone 강제 보정
 *
 * KPI 안정화된 뒤에 해도 됨
 */

export function normalizeEvent(e) {
	// 필수 필드 체크
	if (!e?.event_id || !e?.order_id || !e?.event_type || !e?.event_time)
		return null;

	const eventType = String(e.event_type).toUpperCase();
	const eventTime = new Date(e.event_time);

	if (Number.isNaN(eventTime.getTime())) return null;

	return {
		...e,
		event_type: eventType,
		event_time: eventTime,
	};
}
