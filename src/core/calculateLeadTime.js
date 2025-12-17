const SEGMENTS = [
	["S1", "ORDER_CREATED", "STORE_ACCEPTED"],
	["S2", "STORE_ACCEPTED", "COOKING_STARTED"],
	["S3", "COOKING_STARTED", "COOKING_FINISHED"],
	["S4", "COOKING_FINISHED", "RIDER_ASSIGNED"],
	["S5", "RIDER_ASSIGNED", "PICKED_UP"],
	["S6", "PICKED_UP", "DELIVERED"],
];

function secondsBetween(a, b) {
	if (!a || !b) return null;
	const ms = b.getTime() - a.getTime();
	if (!Number.isFinite(ms) || ms < 0) return null; // 음수면 비정상으로 null
	return Math.floor(ms / 1000);
}

function hourBucket(date) {
	if (!date) return null;
	return date.getHours(); // Date 객체는 local time 기준(우린 +09로 파싱했으니 OK)
}

export function calculateLeadTime(timelines) {
	return timelines.map((t) => {
		const idx = t.eventIndex ?? {};

		const segments = {};
		for (const [code, from, to] of SEGMENTS) {
			const fromTime = idx[from]?.event_time ?? null;
			const toTime = idx[to]?.event_time ?? null;
			segments[code] = secondsBetween(fromTime, toTime);
		}

		const created = idx["ORDER_CREATED"]?.event_time ?? null;
		const delivered = idx["DELIVERED"]?.event_time ?? null;

		const totalLeadTime = secondsBetween(created, delivered);

		// ✅ A안: dimension을 metrics에 복사해서 aggregateKPI가 그대로 쓰게 함
		const region = t.dimensions?.region ?? null;
		const store_id = t.dimensions?.store_id ?? null;
		const hour_bucket = hourBucket(created);

		// 품질 플래그(집계용 최소만 전달)
		const hasMissing = (t.anomalies?.missing?.length ?? 0) > 0;
		const hasDuplicateTypes =
			(t.anomalies?.duplicateTypes?.length ?? 0) > 0;
		const hasOutOfOrder = Boolean(t.anomalies?.outOfOrder);

		return {
			orderId: t.orderId,
			region,
			store_id,
			hour_bucket,

			segments,
			totalLeadTime,
			isCompleted: t.status?.isCompleted ?? totalLeadTime !== null,

			// data quality flags
			hasMissing,
			hasDuplicateTypes,
			hasOutOfOrder,
		};
	});
}
