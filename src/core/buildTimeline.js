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

const EVENT_FLOW = [
	"ORDER_CREATED",
	"STORE_ACCEPTED",
	"COOKING_STARTED",
	"COOKING_FINISHED",
	"RIDER_ASSIGNED",
	"PICKED_UP",
	"DELIVERED",
];

// 최소 필수(완료 주문 판단에 중요)
const REQUIRED_FOR_COMPLETED = ["ORDER_CREATED", "DELIVERED"];

// event_type 중복이 있을 때 어떤 걸 선택할지 정책
// - ORDER_CREATED: earliest (가장 빠른 생성 시각이 의미 있음)
// - 나머지: latest (최종 상태/업데이트가 중요하다고 가정)
function selectEventByTypePolicy(type, eventsOfType) {
	if (!eventsOfType.length) return null;

	if (type === "ORDER_CREATED") {
		return eventsOfType.reduce((min, cur) =>
			cur.event_time < min.event_time ? cur : min
		);
	}
	return eventsOfType.reduce((max, cur) =>
		cur.event_time > max.event_time ? cur : max
	);
}

function isNonDecreasing(times) {
	for (let i = 1; i < times.length; i++) {
		if (times[i] < times[i - 1]) return false;
	}
	return true;
}

function pickDimensions(eventsSorted) {
	// best-effort: ORDER_CREATED가 있으면 우선, 없으면 첫 이벤트 기준
	const created = eventsSorted.find((e) => e.event_type === "ORDER_CREATED");
	const base = created ?? eventsSorted[0] ?? {};

	return {
		region: base.region ?? null,
		store_id: base.store_id ?? null,
		rider_id: base.rider_id ?? null,
		platform: base.platform ?? null,
	};
}

export function buildTimeline(events) {
	const byOrder = new Map();

	// 1) order_id 기준 그룹핑
	for (const e of events) {
		const key = e.order_id;
		if (!byOrder.has(key)) byOrder.set(key, []);
		byOrder.get(key).push(e);
	}

	const timelines = [];

	for (const [orderId, list] of byOrder.entries()) {
		// 2) out-of-order 감지 (정렬 전 입력 기준)
		const originalTimes = list
			.map((e) => e.event_time?.getTime?.() ?? NaN)
			.filter(Number.isFinite);
		const outOfOrder =
			originalTimes.length >= 2 ? !isNonDecreasing(originalTimes) : false;

		// 3) event_id 중복 제거 + duplicatedEventIds 기록
		const seenIds = new Set();
		const duplicatedEventIds = [];
		const dedupedById = [];

		for (const e of list) {
			if (!e.event_id) continue;
			if (seenIds.has(e.event_id)) {
				duplicatedEventIds.push(e.event_id);
				continue;
			}
			seenIds.add(e.event_id);
			dedupedById.push(e);
		}

		// 4) event_time 기준 정렬
		dedupedById.sort((a, b) => a.event_time - b.event_time);

		// 5) event_type 중복 감지 + type별 이벤트 모으기
		const byType = new Map(); // type -> events[]
		for (const e of dedupedById) {
			const type = e.event_type;
			if (!type) continue;
			if (!byType.has(type)) byType.set(type, []);
			byType.get(type).push(e);
		}

		const duplicateTypes = [];
		for (const [type, arr] of byType.entries()) {
			if (arr.length > 1) duplicateTypes.push(type);
		}

		// 6) policy 적용: type별 대표 이벤트 1개 선정
		const eventIndex = {};
		for (const type of EVENT_FLOW) {
			const arr = byType.get(type) ?? [];
			const selected = selectEventByTypePolicy(type, arr);
			if (selected) eventIndex[type] = selected;
		}

		// 7) 누락 감지
		// - flow 전체 기준 누락도 보고
		// - completed 필수 누락도 별도로 판단 가능
		const missing = EVENT_FLOW.filter((t) => !eventIndex[t]);

		const missingForCompleted = REQUIRED_FOR_COMPLETED.filter(
			(t) => !eventIndex[t]
		);
		const isCompleted = missingForCompleted.length === 0;

		// 8) dimensions 추출
		const dimensions = pickDimensions(dedupedById);

		timelines.push({
			orderId,
			// 전체 이벤트 목록(정렬/ID dedupe 완료)
			events: dedupedById.map((e) => ({
				...e,
				// 외부에 노출할 때 필드명을 좀 더 일관되게 쓰고 싶다면 여기서 변환 가능
			})),
			// 타입별 대표 이벤트(정책 적용)
			eventIndex,
			// 이상치 정보
			anomalies: {
				outOfOrder,
				duplicatedEventIds,
				duplicateTypes,
				missing, // 전체 흐름 기준 누락
				missingForCompleted, // 완료 판별용 필수 누락
			},
			// 완료 여부(집계 단계에서 매우 편함)
			status: {
				isCompleted,
			},
			// 집계용 차원
			dimensions,
		});
	}

	return timelines;
}
