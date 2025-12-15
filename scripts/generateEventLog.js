/**
 * Sample event_log generator (Pure JS)
 * Output: JSONL (default) or CSV
 *
 * Usage:
 *   node scripts/generateEventLog.js --count=1000 --seed=42 --format=jsonl
 *   node scripts/generateEventLog.js --count=1000 --seed=42 --format=csv
 *
 * Notes:
 * - ISO8601 with +09:00 (Asia/Seoul) style offset
 * - includes realistic anomalies: missing/duplicate/out-of-order events
 */

const fs = require("fs");
const path = require("path");

// -------------------------
// CLI args
// -------------------------
const args = Object.fromEntries(
	process.argv.slice(2).map((p) => {
		const [k, v] = p.replace(/^--/, "").split("=");
		return [k, v ?? true];
	})
);

const COUNT = Number(args.count ?? 200);
const SEED = Number(args.seed ?? 1);
const FORMAT = String(args.format ?? "jsonl"); // jsonl | csv
const OUT_DIR = String(args.outDir ?? "data");
const OUT_FILE = String(
	args.outFile ?? `event_log.${FORMAT === "csv" ? "csv" : "jsonl"}`
);

// anomaly rates
const RATE_MISSING = Number(args.missingRate ?? 0.03);
const RATE_DUPLICATE = Number(args.duplicateRate ?? 0.02);
const RATE_SHUFFLE = Number(args.shuffleRate ?? 0.05);

// SLA (optional; used only if you want later)
const PLATFORM = "baemin";

// -------------------------
// RNG (seeded)
// -------------------------
function mulberry32(seed) {
	let a = seed >>> 0;
	return function () {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
const rand = mulberry32(SEED);

function randInt(min, max) {
	// inclusive min/max
	return Math.floor(rand() * (max - min + 1)) + min;
}
function chance(p) {
	return rand() < p;
}
function pick(arr) {
	return arr[randInt(0, arr.length - 1)];
}

// -------------------------
// Time helpers (ISO8601 +09:00)
// -------------------------
function pad2(n) {
	return String(n).padStart(2, "0");
}
function toIsoWithOffset(date, offsetMinutes = 9 * 60) {
	// create ISO8601 with fixed offset (+09:00)
	const ms = date.getTime();
	const localMs = ms + offsetMinutes * 60 * 1000;
	const d = new Date(localMs);

	const yyyy = d.getUTCFullYear();
	const mm = pad2(d.getUTCMonth() + 1);
	const dd = pad2(d.getUTCDate());
	const hh = pad2(d.getUTCHours());
	const mi = pad2(d.getUTCMinutes());
	const ss = pad2(d.getUTCSeconds());

	const sign = offsetMinutes >= 0 ? "+" : "-";
	const abs = Math.abs(offsetMinutes);
	const oh = pad2(Math.floor(abs / 60));
	const om = pad2(abs % 60);

	return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}${sign}${oh}:${om}`;
}

function addMinutes(date, minutes) {
	return new Date(date.getTime() + minutes * 60 * 1000);
}

// -------------------------
// Domain pools
// -------------------------
const REGIONS = [
	"Seoul-Gangnam",
	"Seoul-Mapo",
	"Seoul-Songpa",
	"Seoul-Yeongdeungpo",
	"Seoul-Seodaemun",
];

const STORES = Array.from({ length: 50 }, (_, i) => `store_${pad2(i + 1)}`);
const RIDERS = Array.from({ length: 80 }, (_, i) => `rider_${pad2(i + 1)}`);

// -------------------------
// Event types
// -------------------------
const EVENT_TYPES = [
	"ORDER_CREATED",
	"STORE_ACCEPTED",
	"COOKING_STARTED",
	"COOKING_FINISHED",
	"RIDER_ASSIGNED",
	"PICKED_UP",
	"DELIVERED",
];

function baseSegmentMinutes() {
	// base distributions (minutes)
	return {
		S1: randInt(1, 6),
		S2: randInt(0, 5),
		S3: randInt(8, 25),
		S4: randInt(1, 10),
		S5: randInt(2, 12),
		S6: randInt(6, 25),
	};
}

function applyDelayScenario(seg) {
	// choose none or one major delay; you can extend to multi-delay
	const scenario = pick(["NONE", "COOK", "ASSIGN", "PICKUP", "DELIVERY"]);
	if (scenario === "COOK") seg.S3 = randInt(25, 60);
	if (scenario === "ASSIGN") seg.S4 = randInt(10, 35);
	if (scenario === "PICKUP") seg.S5 = randInt(12, 35);
	if (scenario === "DELIVERY") seg.S6 = randInt(25, 60);
	return { seg, scenario };
}

function makeOrderId(i) {
	// ord_YYYYMMDD_xxxx (simple)
	const day = randInt(1, 28);
	const hour = randInt(10, 22);
	const minute = randInt(0, 59);

	// fixed month/year for repeatability (Dec 2025)
	const yyyy = 2025;
	const mm = 12;
	const dd = day;

	return {
		orderId: `ord_${yyyy}${pad2(mm)}${pad2(dd)}_${String(i + 1).padStart(
			4,
			"0"
		)}`,
		baseTime: new Date(
			Date.UTC(yyyy, mm - 1, dd, hour - 9, minute, randInt(0, 59))
		), // store UTC, convert with +09 later
	};
}

function buildEventsForOrder(i) {
	const { orderId, baseTime } = makeOrderId(i);
	const storeId = pick(STORES);
	const region = pick(REGIONS);
	const riderId = pick(RIDERS);

	let seg = baseSegmentMinutes();
	const delayInfo = applyDelayScenario(seg);
	seg = delayInfo.seg;

	// construct event times
	const t0 = baseTime;
	const t1 = addMinutes(t0, seg.S1);
	const t2 = addMinutes(t1, seg.S2);
	const t3 = addMinutes(t2, seg.S3);
	const t4 = addMinutes(t3, seg.S4);
	const t5 = addMinutes(t4, seg.S5);
	const t6 = addMinutes(t5, seg.S6);

	const times = [t0, t1, t2, t3, t4, t5, t6];

	let events = EVENT_TYPES.map((type, idx) => {
		const evt = {
			event_id: `evt_${String(i + 1).padStart(4, "0")}_${String(
				idx + 1
			).padStart(2, "0")}_${randInt(1000, 9999)}`,
			order_id: orderId,
			event_type: type,
			event_time: toIsoWithOffset(times[idx], 9 * 60),
			store_id: storeId,
			region,
			platform: PLATFORM,
			rider_id: undefined,
			meta: {
				delay_scenario: delayInfo.scenario,
			},
		};

		// rider_id appears after assigned typically
		if (["RIDER_ASSIGNED", "PICKED_UP", "DELIVERED"].includes(type)) {
			evt.rider_id = riderId;
		}

		// remove undefined to keep JSON clean
		if (evt.rider_id === undefined) delete evt.rider_id;

		return evt;
	});

	// missing event anomaly
	if (chance(RATE_MISSING)) {
		const candidates = [
			"COOKING_STARTED",
			"RIDER_ASSIGNED",
			"PICKED_UP",
			"DELIVERED",
		];
		const missType = pick(candidates);
		events = events.filter((e) => e.event_type !== missType);
	}

	// duplicate event anomaly
	if (chance(RATE_DUPLICATE)) {
		const dupType = pick(EVENT_TYPES);
		const target = events.find((e) => e.event_type === dupType);
		if (target) {
			const dup = {
				...target,
				event_id: `${target.event_id}_DUP_${randInt(100, 999)}`,
			};
			events.push(dup);
		}
	}

	// shuffle/out-of-order anomaly (output order messed up)
	if (chance(RATE_SHUFFLE)) {
		for (let k = events.length - 1; k > 0; k--) {
			const j = randInt(0, k);
			[events[k], events[j]] = [events[j], events[k]];
		}
	}

	return events;
}

// -------------------------
// Output writers
// -------------------------
function ensureDir(p) {
	if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function toCsvRow(obj, headers) {
	return headers
		.map((h) => {
			const val = obj[h];
			if (val === null || val === undefined) return "";
			const s =
				typeof val === "object" ? JSON.stringify(val) : String(val);
			// naive CSV escaping
			if (s.includes(",") || s.includes('"') || s.includes("\n")) {
				return `"${s.replaceAll('"', '""')}"`;
			}
			return s;
		})
		.join(",");
}

function main() {
	ensureDir(OUT_DIR);
	const outPath = path.join(OUT_DIR, OUT_FILE);

	const all = [];
	for (let i = 0; i < COUNT; i++) {
		const evts = buildEventsForOrder(i);
		all.push(...evts);
	}

	if (FORMAT === "csv") {
		const headers = [
			"event_id",
			"order_id",
			"event_type",
			"event_time",
			"store_id",
			"region",
			"rider_id",
			"platform",
			"meta",
		];
		const lines = [headers.join(",")];
		for (const e of all) lines.push(toCsvRow(e, headers));
		fs.writeFileSync(outPath, lines.join("\n"), "utf-8");
	} else {
		// jsonl
		const lines = all.map((e) => JSON.stringify(e));
		fs.writeFileSync(outPath, lines.join("\n"), "utf-8");
	}

	console.log(`✅ Generated ${all.length} events from ${COUNT} orders`);
	console.log(`📄 Output: ${outPath}`);
	console.log(
		`⚙️ Rates: missing=${RATE_MISSING}, duplicate=${RATE_DUPLICATE}, shuffle=${RATE_SHUFFLE}, seed=${SEED}`
	);
}

main();
