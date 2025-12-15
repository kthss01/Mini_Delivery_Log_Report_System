# Data Processing Pipeline

## 1. 개요

본 문서는 배달 주문 이벤트 로그 분석 시스템의  
**데이터 처리 파이프라인(Data Processing Pipeline)** 을 정의한다.

본 파이프라인은 원시 이벤트 로그(`event_log`)를 입력으로 받아,
주문 단위 타임라인을 복원하고 KPI를 계산하여
리포트 및 대시보드에서 활용 가능한 결과를 생성하는 것을 목표로 한다.

모든 파이프라인은 **순수 JavaScript 기반**으로 구현된다.

---

## 2. 파이프라인 전체 흐름

```
Raw event_log
↓
(1) Load & Normalize
↓
(2) Timeline Builder
↓
(3) Lead Time Calculator
↓
(4) KPI Aggregator
↓
(5) Output / Visualization
```

각 단계는 **독립적인 책임**을 가지며,
앞 단계의 오류나 이상치는 가능한 한 해당 단계에서 흡수한다.

---

## 3. 단계별 상세 설계

### 3.1 Load & Normalize

#### 목적

-   파일(JSONL / CSV) 형태의 이벤트 로그 로드
-   데이터 타입 및 포맷 정규화

#### 주요 처리

-   `event_time` 문자열 → `Date` 객체 변환
-   `event_type` 대문자 정규화
-   필수 필드(`event_id`, `order_id`, `event_type`, `event_time`) 검증
-   명백히 잘못된 이벤트 제거

#### 출력 예시

```js
{
  event_id: "evt_000123",
  order_id: "ord_20251215_0007",
  event_type: "ORDER_CREATED",
  event_time: Date,
  store_id: "store_12",
  region: "Seoul-Gangnam",
  rider_id: "rider_03"
}
```

### 3.2 Timeline Builder

목적은 이벤트 로그를 주문(`order_id`) 단위로 묶어
정상적인 **주문 타임라인**을 복원하는 것이다.

이 단계는 이후 리드타임 계산과 KPI 집계의 기준이 되므로
파이프라인 전체에서 가장 핵심적인 역할을 수행한다.

#### 주요 역할

-   `order_id` 기준으로 이벤트를 그룹핑한다
-   `event_time` 기준으로 이벤트를 정렬한다
-   `event_id` 기준으로 중복 이벤트를 제거한다
-   필수 이벤트 누락 여부를 감지한다

#### 처리 순서

1. 입력 이벤트 로그 배열을 `order_id` 기준으로 묶는다
2. 각 주문 그룹 내 이벤트를 `event_time` 오름차순으로 정렬한다
3. 동일한 `event_id`를 가진 이벤트는 하나만 유지한다
4. 주문 흐름에 필요한 이벤트가 모두 존재하는지 확인한다

#### 출력 데이터 개념

-   하나의 주문은 하나의 타임라인 객체로 표현된다
-   이벤트는 시간 순서대로 정렬된 배열로 저장된다
-   누락 또는 중복 이벤트 정보는 별도 메타 정보로 기록된다

#### 출력 예시 (개념)

-   orderId: ord_20251215_0007
-   events: ORDER_CREATED → STORE_ACCEPTED → COOKING_STARTED → … → DELIVERED
-   anomalies:
    -   missing: 없음
    -   duplicated: 없음
    -   outOfOrder: false

### 3.3 Lead Time Calculator

이 단계의 목적은 각 주문에 대해  
**구간별 리드타임과 전체 배달 리드타임을 계산**하는 것이다.

Timeline Builder 단계에서 생성된 주문 타임라인을 입력으로 사용한다.

#### 계산 대상

-   주문 단위(`order_id`)
-   이벤트 타입 간 시간 차이

#### 계산 원칙

-   각 구간은 두 개의 이벤트 쌍으로 정의된다
-   두 이벤트 중 하나라도 누락된 경우 해당 구간은 계산하지 않는다
-   계산 불가능한 구간은 `null` 값으로 처리한다

#### 구간 정의

-   S1: ORDER_CREATED → STORE_ACCEPTED
-   S2: STORE_ACCEPTED → COOKING_STARTED
-   S3: COOKING_STARTED → COOKING_FINISHED
-   S4: COOKING_FINISHED → RIDER_ASSIGNED
-   S5: RIDER_ASSIGNED → PICKED_UP
-   S6: PICKED_UP → DELIVERED

#### 전체 리드타임 계산

-   전체 리드타임은 주문 생성부터 배달 완료까지의 시간이다
-   `ORDER_CREATED` 또는 `DELIVERED` 이벤트가 없으면 계산하지 않는다

#### 출력 데이터 개념

-   주문별로 하나의 리드타임 결과 객체가 생성된다
-   각 구간의 리드타임은 초 단위로 저장된다
-   전체 리드타임은 구간

### 3.4 KPI Aggregator

이 단계의 목적은 주문 단위로 계산된 리드타임 결과를 집계하여  
**운영 지표(KPI)를 산출**하는 것이다.

Lead Time Calculator 단계의 출력 결과를 입력으로 사용한다.

#### 집계 대상

-   주문 단위 리드타임 결과
-   구간별 리드타임 값
-   전체 배달 리드타임 값

#### 산출 KPI 예시

-   평균 전체 배달 리드타임
-   구간별 평균 리드타임
-   지연 주문 비율 (SLA 기준)
-   병목 구간 비율 및 Top N

#### 집계 원칙

-   집계는 주문 단위 결과를 기반으로 수행한다
-   `null` 값은 KPI 성격에 따라 제외하거나 별도 집계한다
-   전체 리드타임이 없는 주문은 지연율 계산에서 제외한다

#### 그룹핑 기준

-   지역(`region`)
-   가게(`store_id`)
-   시간대(주문 생성 시각 기준)

그룹핑 기준은 필요에 따라 하나 또는 여러 개를 조합할 수 있다.

#### 병목 구간 산출 방식

-   각 주문에서 가장 오래 걸린 구간을 병목 구간으로 정의한다
-   병목 구간이 없는 주문은 집계 대상에서 제외한다
-   병목 구간의 발생 비율을 기준으로 Top N을 산출한다

#### 출력 데이터 개념

-   KPI 결과는 하나의 집계 객체로 표현된다
-   집계 결과는 대시보드 및 리포트에서 바로 사용 가능해야 한다

#### 출력 예시 (개념)

-   totalOrders: 1000
-   completedOrders: 920
-   averageLeadTime: 2870초
-   delayedOrderRate: 0.31
-   bottleneckTop3:
    -   S3: 42%
    -   S5: 33%
    -   S6: 15%

### 3.5 Output / Visualization

이 단계의 목적은 KPI 집계 결과를  
**외부에서 활용 가능한 형태로 출력하고 시각화하는 것**이다.

KPI Aggregator 단계의 결과를 입력으로 사용한다.

#### 출력 대상

-   KPI 집계 결과
-   주문 및 구간별 통계 요약 데이터

#### 출력 형태

-   콘솔 로그 출력 (개발 및 디버깅 목적)
-   JSON 형태의 결과 파일
-   웹 대시보드에서 사용 가능한 데이터 응답

#### 시각화 활용 예

-   시간대별 평균 배달 리드타임 추이
-   지역별 지연 주문 비율 비교
-   병목 구간 분포 현황

#### 설계 원칙

-   출력 포맷은 다른 단계와 독립적으로 변경 가능해야 한다
-   시각화 로직은 KPI 계산 로직과 분리한다
-   MVP 단계에서는 단순한 구조를 유지한다

#### 확장 방향

-   인터랙티브 차트 적용
-   필터 및 드릴다운 기능 추가
-   리포트 자동 생성 기능 확장

## 4. 폴더 구조와 파이프라인 매핑

본 프로젝트의 소스 코드는 데이터 처리 파이프라인 단계별로
역할이 명확히 구분된 구조를 가진다.

각 디렉토리는 파이프라인의 하나의 단계를 담당한다.

#### 디렉토리 구성 개념

-   loader

    -   원시 이벤트 로그 파일을 로드하는 역할

-   core

    -   파이프라인 핵심 로직을 담당
    -   타임라인 복원, 리드타임 계산, KPI 집계 포함

-   utils

    -   시간 계산, 그룹핑 등 공통 유틸 함수

-   index.js
    -   전체 파이프라인을 순차적으로 실행하는 진입점

#### 파이프라인 단계 매핑

-   Load & Normalize → loader
-   Timeline Builder → core
-   Lead Time Calculator → core
-   KPI Aggregator → core
-   Output / Visualization → index.js 또는 별도 모듈

이 구조는 단계별 테스트와 확장을 용이하게 한다.

## 5. 설계 의도 요약

본 데이터 처리 파이프라인은 다음 설계 원칙을 따른다.

#### 단일 책임 원칙

-   각 단계는 하나의 명확한 역할만 수행한다
-   데이터 정제, 계산, 출력 로직을 분리한다

#### 이상치에 강한 구조

-   이벤트 누락, 중복, 순서 오류를 전제로 설계한다
-   파이프라인이 중간에 중단되지 않도록 한다

#### 확장 가능한 설계

-   KPI 추가 시 기존 파이프라인 변경을 최소화한다
-   데이터 차원(지역, 가게, 시간대) 확장을 고려한다

#### 학습 및 포트폴리오 목적 적합성

-   순수 JavaScript로 구현하여 로직 이해에 집중한다
-   실제 서비스 로그 구조를 단순화하여 재현한다
