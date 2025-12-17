function avg(nums) {
	if (!nums.length) return null;
	return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function ratio(part, total) {
	if (!total) return 0;
	return Number((part / total).toFixed(2));
}

export function aggregateKPI(
	orderMetrics,
	{ slaSeconds = 2700, groupKey = "region", topN = 3 } = {}
) {
	const totalOrders = orderMetrics.length;
	const completed = orderMetrics.filter(
		(m) => typeof m.totalLeadTime === "number"
	);
	const completedOrders = completed.length;

	// 지연율
	const delayedCount = completed.filter(
		(m) => m.totalLeadTime > slaSeconds
	).length;

	// 병목(가장 큰 segment) TopN
	const bottleneckCounts = new Map();
	for (const m of completed) {
		let maxSeg = null;
		let maxVal = -1;
		for (const [k, v] of Object.entries(m.segments)) {
			if (typeof v === "number" && v > maxVal) {
				maxVal = v;
				maxSeg = k;
			}
		}
		if (maxSeg)
			bottleneckCounts.set(
				maxSeg,
				(bottleneckCounts.get(maxSeg) ?? 0) + 1
			);
	}

	const bottleneckTop = [...bottleneckCounts.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, topN)
		.map(([segment, count]) => ({
			segment,
			ratio: ratio(count, completedOrders),
		}));

	// ✅ 데이터 품질 KPI
	const missingCount = orderMetrics.filter((m) => m.hasMissing).length;
	const duplicateTypesCount = orderMetrics.filter(
		(m) => m.hasDuplicateTypes
	).length;
	const outOfOrderCount = orderMetrics.filter((m) => m.hasOutOfOrder).length;

	const dataQuality = {
		totalOrders,
		completedOrders,
		completionRate: ratio(completedOrders, totalOrders),
		missingRate: ratio(missingCount, totalOrders),
		duplicateTypesRate: ratio(duplicateTypesCount, totalOrders),
		outOfOrderRate: ratio(outOfOrderCount, totalOrders),
	};

	// ✅ 그룹별 KPI (region / store_id / hour_bucket 등)
	const groups = new Map();
	for (const m of completed) {
		const keyRaw = m[groupKey];
		const key =
			keyRaw === null || keyRaw === undefined
				? "UNKNOWN"
				: String(keyRaw);
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key).push(m);
	}

	const byGroup = {};
	for (const [k, arr] of groups.entries()) {
		const leadTimes = arr
			.map((x) => x.totalLeadTime)
			.filter((v) => typeof v === "number");
		const delayed = arr.filter((x) => x.totalLeadTime > slaSeconds).length;

		byGroup[k] = {
			completedOrders: arr.length,
			averageLeadTime: avg(leadTimes),
			delayedOrderRate: ratio(delayed, arr.length),
		};
	}

	return {
		totalOrders,
		completedOrders,
		averageLeadTime: avg(completed.map((m) => m.totalLeadTime)),
		delayedOrderRate: ratio(delayedCount, completedOrders),
		bottleneckTop,
		byGroup,
		dataQuality,
	};
}
