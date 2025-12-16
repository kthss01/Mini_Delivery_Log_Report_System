# 용어 정리

## MVP (Minimum Viable Product)

> 핵심 가치가 드러나고, 실제로 사용해볼 수 있는 최소한의 완성 상태

-   누군가에게 보여주면서 설명할 수 있는 최초의 버전

## KPI (Key Performance Indicator)

> 핵심 성과 지표

-   수많은 데이터 중에서 **이 수치만 보면 성과를 알 수 있다**라고 합의한 대표 지표들

### KPI 정의의 의미

단순히 지표를 나열하는게 아니라, 아래를 명확히 하는 과정

1. 무엇이 성공인지
2. 그 성공을 어떤 수치로 볼 것인지
3. 어디까지 가면 잘했다고 말할 수 있는지

## 리드타임 (Lead Time)

> 어떤 작업을 요청한 시점부터, 그 결과가 실제로 완료되기까지 걸리는 전체 시간

-   시작 -> 끝까지 걸린 총 소요 시간

## JSONL (JSON Lines)

> 여러 개의 JSON 객체를 "한 줄에 하나씩" 저장하는 파일 포맷

## SLA (Service Level Agreement, 서비스 수준 계약)

> 이 이벤트는 '이 시간 안에 끝나야 한다'
> 라는 목표 시간(약속 시간)

배달 서비스에서는 아주 흔하게 쓰임

## Projcet buildTimeline.js 내 Dimension

Dimension = "집계할 때 기준이 되는 축 (axis)"

-   시간 (time)은 KPI의 값
-   지역/가게 같은 건 KPI를 어떻게 나눠서 볼지의 기준

```js
// buildTimeline.js

const dimensions = {
	/** 지역 단위 집계 기준
	 *  예: Seoul-Gangnam
	 *  가장 자주 쓰이는 KPI 축
	 *  "어디가 느린가?"를 보기 위한 1순위 dimension
	 **/
	region,

	/** 가게 단위 집계 기준
	 *  조리 지연 분석
	 *  문제 가게 Top N 추출
	 *  KPI에서 빠지면 안 되는 핵심 dimension
	 **/
	store_id,

	/** 라이더 단위 분석 (선택)
	 *  배차/픽업 지연 분석에 사용
	 *  모든 주문에 없을 수 있음 -> null 허용
	 *  MVP에서는 있어도 되고 없어도 됨
	 **/
	rider_id,

	/** 플랫폼 구분
	 *  현재는 거의 항상 baemin
	 *  나중에 coupang-eats 추가하여 바로 비교 가능
	 *  MVP에서는 고정값이어도 괜찮음
	 **/
	platform,
};
```

# ESM vs CommonJS (CJS)

JavsScript 모듈 시스템

## ESM (ECMAScript Modules)

-   JavaScript 공식 표준 모듈 시스템
-   브라우저 & Node.js 공통
-   최신 프로젝트에서 권장

### 문법

```js
// 불러오기
import fs from 'fs';
import loadEventLog from './loader/loadEventLog.js';

// 내보내기
export defaut loadEventLog;
```

### 파일 확장자 & 설정

#### 방법 1 : package.json

```json
{
	"type": "module"
}
```

#### 방법 2 : 확장자 사용

-   .mjs

##### 동작 방식

-   정적으로 로드 (실행 전에 구조가 결정됨)
-   최상위에서만 import 가능

##### 장점

-   브라우저와 동일한 문법
-   트리 쉐이킹 가능
-   정적 분석, 타입 추론에 유리
-   미래 표준

##### 단점

-   설정을 모르면 에러가 자주 남
-   상대경로에 js 확장자 필수 (Node)

## CommonJS

-   Node.js 의 전통적인 모듈 시스템
-   오래된 프로젝트, 라이브러리에 아직 많이 사용됨

### 문법

```js
// 불러오기
const fs = require("fs");
const loadEventLog = require("./loader/loadEventLog");

// 내보내기
module.exports = loadEventLog;
```

### 파일 확장자

-   .js
-   pakcage.json에 별도 설정 없음 (기본값)

### 동작 방식

-   런타임에 동기적으로 로드
-   require() 는 함수라 조건문 안에서도 사용 가능

### 장점

-   설정이 간단
-   Node.js에서 안정적
-   학습 난이도 낮음

### 단점

-   브라우저와 문법이 다름
-   정적 분석이 어려움
-   최신 JS 생태계 흐름과는 점점 멀어짐
