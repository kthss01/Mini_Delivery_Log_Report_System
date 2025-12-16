/**
 * 진행 내역
 * 1) order_id 기준 그룹핑
 * - 이벤트 배열을 Map(order_id -> events[]) 로 묶음
 * - 주문 단위로 타임라인을 만들 준비 완료
 *
 * 2) event_id 기준 중복 제거 (부분 완료)
 * - 같은 event_id 를 가진 이벤트는 1개만 유지
 * - 주의 : 현재는 event_type 중복 (같은 타입이 여러 번)은 처리하지 않음
 *
 * 3) event_time 기준 정렬
 * - 각 주문 이벤트를 event_time 오름차순으로 정렬
 * - out-of-order (원래 입력이 뒤섞였는지) "표식"는 아직 없음
 *
 * 4) 타임라인 배열 생성
 * - 결과 형태:
 *   - { orderId, events: dedupedSortedEvents }
 * - anomalies(이상치 정보) 필드는 아직 없음
 *
 * TODO list
 * - anomalies (이상치) 리포트 구조 추가
 * - event_type 중복 처리 정책 결정 + 적용
 * - 필수 이벤트 세트 정의 + 누락 감지
 * - (추후 필요) out-of-order 감지 로직 추가
 */

/**
 * timeline 이해
 *  흩어져 있는 주문 이벤트 로그들을 '주문 1건 기준의 시간 흐름'으로 재구성하는 작업
 *  '정렬된 시간 구조' 만드는 것
 */

export function buildTimeline(events) {
	const byOrder = new Map();

	// order_id 기준 그룹핑
	for (const e of events) {
		const key = e.order_id;
		if (!byOrder.has(key)) byOrder.set(key, []);
		byOrder.get(key).push(e);
	}

	const timelines = [];
	for (const [orderId, list] of byOrder.entries()) {
		// event_id 기준 중복 제거
		const seen = new Set();
		const deduped = [];
		for (const ev of list) {
			if (seen.has(ev.event_id)) continue;
			seen.add(ev.event_id);
			deduped.push(ev);
		}

		// 시간 정렬
		deduped.sort((a, b) => a.event_time - b.event_time);

		// timeline 배열 생성
		timelines.push({
			orderId,
			events: deduped,
		});
	}

	return timelines;
}
