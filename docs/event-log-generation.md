# Event Log Generation Rules

## 1. 목적

본 문서는 배달 주문 로그 분석 미니 프로젝트에서 사용하는  
**event_log 샘플 데이터 자동 생성 규칙**을 정의한다.

해당 규칙은 다음 목적을 가진다.

-   배달 주문 이벤트 흐름을 현실적으로 재현
-   KPI 계산 로직 검증을 위한 다양한 케이스 생성
-   이벤트 누락, 중복, 순서 오류 등 실제 로그 환경 시뮬레이션

---

## 2. 생성 단위

-   샘플 데이터는 **이벤트 로그(event_log)** 단위로 생성한다.
-   기본적으로 **주문 1건(order_id)** 은 **7개의 이벤트**를 가진다.
-   일부 주문은 확률적으로 이벤트 누락, 중복, 순서 오류를 포함한다.

---

## 3. 이벤트 타입

샘플 데이터 생성에 사용되는 이벤트 타입은 다음과 같다.

| event_type       |
| ---------------- |
| ORDER_CREATED    |
| STORE_ACCEPTED   |
| COOKING_STARTED  |
| COOKING_FINISHED |
| RIDER_ASSIGNED   |
| PICKED_UP        |
| DELIVERED        |

---

## 4. 배달 주문 흐름 및 구간 정의

배달 주문은 아래 흐름을 따른다고 가정한다.

```
ORDER_CREATED
→ STORE_ACCEPTED
→ COOKING_STARTED
→ COOKING_FINISHED
→ RIDER_ASSIGNED
→ PICKED_UP
→ DELIVERED
```

이를 분석을 위해 다음 구간(Segment)으로 분리한다.

| 구간 | from → to                          |
| ---- | ---------------------------------- |
| S1   | ORDER_CREATED → STORE_ACCEPTED     |
| S2   | STORE_ACCEPTED → COOKING_STARTED   |
| S3   | COOKING_STARTED → COOKING_FINISHED |
| S4   | COOKING_FINISHED → RIDER_ASSIGNED  |
| S5   | RIDER_ASSIGNED → PICKED_UP         |
| S6   | PICKED_UP → DELIVERED              |

---

## 5. 이벤트 시간 생성 규칙

각 주문은 `ORDER_CREATED`를 기준 시각으로 하여
구간별 소요 시간을 더해 이벤트 발생 시각을 생성한다.

### 5.1 기본 구간 소요 시간 (분 단위)

| 구간 | 기본 소요 시간 |
| ---- | -------------- |
| S1   | 1 ~ 6분        |
| S2   | 0 ~ 5분        |
| S3   | 8 ~ 25분       |
| S4   | 1 ~ 10분       |
| S5   | 2 ~ 12분       |
| S6   | 6 ~ 25분       |

---

### 5.2 지연 시나리오

일부 주문은 다음 지연 시나리오 중 하나를 적용한다.

| 시나리오       | 영향 구간 | 지연 시간 |
| -------------- | --------- | --------- |
| 조리 지연      | S3        | 25 ~ 60분 |
| 배차 지연      | S4        | 10 ~ 35분 |
| 픽업 지연      | S5        | 12 ~ 35분 |
| 배달 이동 지연 | S6        | 25 ~ 60분 |

> 하나의 주문에는 기본적으로 **하나의 지연 시나리오만 적용**한다.

---

## 6. 이상치(Anomaly) 생성 규칙

현실적인 로그 환경을 재현하기 위해 다음 이상치를 확률적으로 포함한다.

### 6.1 이벤트 누락 (Missing Event)

-   발생 확률: 기본 3%
-   대상 이벤트:
    -   COOKING_STARTED
    -   RIDER_ASSIGNED
    -   PICKED_UP
    -   DELIVERED
-   누락된 이벤트는 해당 주문 타임라인에서 완전히 제거된다.

---

### 6.2 이벤트 중복 (Duplicate Event)

-   발생 확률: 기본 2%
-   동일 `order_id` + 동일 `event_type` 이벤트를
    `event_id`만 변경하여 추가 생성한다.

---

### 6.3 이벤트 순서 오류 (Out-of-Order)

-   발생 확률: 기본 5%
-   이벤트 출력 순서를 무작위로 섞어 저장한다.
-   단, `event_time` 자체는 정상 또는 비정상일 수 있다.

---

## 7. 시간 및 ID 규칙

### 7.1 시간 형식

-   모든 이벤트 시각은 **ISO 8601 형식**을 사용한다.
-   기본 타임존: `+09:00 (Asia/Seoul)`

예시:

```
2025-12-15T11:03:22+09:00
```

---

### 7.2 ID 규칙

-   `order_id`: 주문 단위 유일 식별자
-   `event_id`: 이벤트 단위 유일 식별자 (중복 제거 및 멱등 처리용)

---

## 8. 분석 단계에서의 처리 가이드

샘플 데이터는 의도적으로 이상치를 포함하므로,
분석 파이프라인에서는 다음 처리가 필요하다.

-   `order_id` 기준 그룹핑
-   `event_time` 기준 정렬
-   `event_id` 기준 중복 제거
-   누락 이벤트 발생 시 KPI 계산 제외 또는 `null` 처리

---

## 9. 확장 가능성

본 생성 규칙은 다음 확장을 고려하여 설계되었다.

-   거리(`distance_km`) 및 금액(`order_amount`) 메타데이터 추가
-   다중 지연 시나리오 적용
-   플랫폼 비교(배민 / 쿠팡이츠 등)

---

## 실행 예시

### 1,000건 주문 → 이벤트 로그 생성(JSONL)

node scripts/generateEventLog.js --count=1000 --seed=42 --format=jsonl

### CSV로 출력

node scripts/generateEventLog.js --count=1000 --seed=42 --format=csv

### 이상치 비율 조절

node scripts/generateEventLog.js --count=500 --seed=7 --missingRate=0.05 --duplicateRate=0.03 --shuffleRate=0.1
