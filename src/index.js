// src/index.js
import { loadEventLog } from "./loader/loadEventLog.js";
import { normalizeEvent } from "./core/normalizeEvent.js";
import { buildTimeline } from "./core/buildTimeline.js";
import { calculateLeadTime } from "./core/calculateLeadTime.js";
import { aggregateKPI } from "./core/aggregateKPI.js";

// (선택) 결과 저장 유틸이 있으면 분리 가능
import fs from "fs";
import path from "path";

async function main() {
	// 1) 설정(옵션)
	const inputPath = process.env.INPUT_PATH || "data/event_log.jsonl";
	const format = inputPath.endsWith(".csv") ? "csv" : "jsonl";

	// SLA 예시: 45분(초 단위)
	const slaSeconds = 45 * 60;

	// KPI 그룹 기준 예시: region, store, hour 등
	const groupKey = "hour_bucket"; // 나중에 "store_id" / "hour_bucket" 등으로 변경 가능
	// const groupKey = "region"; // 나중에 "store_id" / "hour_bucket" 등으로 변경 가능

	// 2) Load
	const rawEvents = await loadEventLog(inputPath, { format });
	console.log("[load] rawEvents:", rawEvents.length);

	// 3) Normalize (map + filter)
	const events = rawEvents
		.map(normalizeEvent) // 정규화
		.filter(Boolean); // null 제거(유효하지 않은 이벤트 drop)
	console.log("[normalize] events:", events.length);

	// 4) Build timelines
	const timelines = buildTimeline(events);
	console.log("[timeline] orders:", timelines.length);

	// ✅ buildTimeline에서 제공하는 상태/이상치 요약(디버깅에 매우 유용)
	const completed = timelines.filter((t) => t.status?.isCompleted).length;
	const missingAny = timelines.filter(
		(t) => (t.anomalies?.missing?.length ?? 0) > 0
	).length;
	const duplicateTypesAny = timelines.filter(
		(t) => (t.anomalies?.duplicateTypes?.length ?? 0) > 0
	).length;
	const outOfOrderAny = timelines.filter(
		(t) => t.anomalies?.outOfOrder
	).length;

	console.log("[timeline] completed:", completed);
	console.log("[timeline] missing(any):", missingAny);
	console.log("[timeline] duplicateTypes(any):", duplicateTypesAny);
	console.log("[timeline] outOfOrder(any):", outOfOrderAny);

	// 5) Calculate lead times
	const orderMetrics = calculateLeadTime(timelines);
	console.log("[leadtime] metrics:", orderMetrics.length);

	// 6) Aggregate KPI
	const kpi = aggregateKPI(orderMetrics, { slaSeconds, groupKey });

	// 7) Output
	console.log(JSON.stringify(kpi, null, 2));

	// (선택) 결과 파일 저장
	const outDir = "output";
	fs.mkdirSync(outDir, { recursive: true });
	fs.writeFileSync(
		path.join(outDir, "kpi.json"),
		JSON.stringify(kpi, null, 2)
	);
}

main().catch((err) => {
	console.error("[Pipeline Error]", err);
	process.exit(1);
});
