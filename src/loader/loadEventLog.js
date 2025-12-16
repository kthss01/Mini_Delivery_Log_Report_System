import fs from "fs/promises";

/**
 * 지금 구현된 것
 * - JSONL 파일 읽기
 * - 한 줄씩 파싱 -> 객체 배열
 * - 비동기 처리
 *
 * 나중에 할 수 있는 개선
 * - CSV 파서 추가
 * - 대용량 파일 스트리밍 처리
 * - 파일 유효성검사
 */

export async function loadEventLog(filePath, { format = "jsonl" } = {}) {
	const text = await fs.readFile(filePath, "utf-8");

	if (format === "csv") {
		// MVP: CSV 파서는 나중에 확장(지금은 jsonl 기준으로 시작 추천)
		throw new Error("CSV loader not implemented yet. Use JSONL first.");
	}

	// JSONL
	return text
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean) // Boolean(value)가 false가 되는 값들을 전부 제거
		.map((line) => JSON.parse(line));
}
