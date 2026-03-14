# Spharmy Spark - 프로젝트 워크플로우 가이드

## 📋 목차
1. [프로젝트 개요](#프로젝트-개요)
2. [아키텍처 구조](#아키텍처-구조)
3. [전체 워크플로우](#전체-워크플로우)
4. [주요 모듈별 상세 설명](#주요-모듈별-상세-설명)
5. [데이터 흐름](#데이터-흐름)
6. [코드 구조 및 파일 설명](#코드-구조-및-파일-설명)

---

## 🎯 프로젝트 개요

**Spharmy Spark**는 Amazon 상품을 자동으로 크롤링하여 Shopify 스토어에 대량 업로드하는 데스크톱 자동화 플랫폼입니다.

### 핵심 기능
- ✅ Amazon 상품 검색 결과 자동 크롤링
- ✅ 상품 상세 정보 추출 (제목, 가격, 이미지, 설명, 옵션 등)
- ✅ 크롤링 데이터 관리 (선택/제외)
- ✅ Shopify GraphQL API를 통한 대량 업로드
- ✅ 실시간 모니터링 및 로그
- ✅ 가격 마진 자동 계산
- ✅ 재고 및 위치 관리
- ✅ 컬렉션 자동 생성

### 기술 스택
- **프론트엔드**: Vue 3 + TypeScript + Element Plus + Tailwind CSS
- **백엔드**: Electron + Node.js
- **크롤링**: Crawlee + Playwright (Chromium)
- **API 통신**: Shopify Admin GraphQL API, Socket.IO
- **상태 관리**: Pinia
- **빌드**: Electron Vite + Electron Builder

---

## 🏗️ 아키텍처 구조

### Electron 3-Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  RENDERER PROCESS (Vue 3)                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  UI Layer                                           │   │
│  │  - Vue Components (Pages, Layouts, Components)     │   │
│  │  - Element Plus UI Library                         │   │
│  │  - Tailwind CSS Styling                            │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  State Management (Pinia)                          │   │
│  │  - auth.ts: 사용자 인증 상태                       │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Routing (Vue Router)                              │   │
│  │  - /signin, /signup, /app/*                        │   │
│  └─────────────────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────────────────┘
                       │ IPC Communication (async/invoke)
                       │ window.api.* methods
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  PRELOAD SCRIPTS (Security Bridge)          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Context Bridge API Exposure                       │   │
│  │  - window.api.auth.*                               │   │
│  │  - window.api.crawler.*                            │   │
│  │  - window.api.shopify.*                            │   │
│  │  - window.api.store.*                              │   │
│  └─────────────────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────────────────┘
                       │ ipcRenderer ↔ ipcMain
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  MAIN PROCESS (Node.js)                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Window Management                                  │   │
│  │  - BrowserWindow creation & lifecycle              │   │
│  │  - Auto-update handling                            │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  IPC Handlers (ipc/)                               │   │
│  │  - auth.ipc.ts: 사용자 인증                        │   │
│  │  - crawler.ipc.ts: 크롤러 제어                     │   │
│  │  - shopify.ipc.ts: Shopify 업로드                 │   │
│  │  - store.ipc.ts: 로컬 스토리지                     │   │
│  │  - socket.ipc.ts: Socket.IO 연결                  │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Core Modules                                      │   │
│  │  ┌───────────────────────────────────────────────┐ │   │
│  │  │  Crawler Engine (crawlee/)                   │ │   │
│  │  │  - PlaywrightCrawler wrapper                │ │   │
│  │  │  - Router handlers (list, asin, detail)     │ │   │
│  │  │  - Navigation hooks                         │ │   │
│  │  └───────────────────────────────────────────────┘ │   │
│  │  ┌───────────────────────────────────────────────┐ │   │
│  │  │  Shopify Client (shopify/)                   │ │   │
│  │  │  - GraphQL Admin API client                 │ │   │
│  │  │  - Bulk operations                          │ │   │
│  │  │  - Product data conversion                  │ │   │
│  │  └───────────────────────────────────────────────┘ │   │
│  │  ┌───────────────────────────────────────────────┐ │   │
│  │  │  Socket.IO Client (socket/)                  │ │   │
│  │  │  - Authentication server connection         │ │   │
│  │  │  - Real-time event handling                 │ │   │
│  │  └───────────────────────────────────────────────┘ │   │
│  │  ┌───────────────────────────────────────────────┐ │   │
│  │  │  Electron Store (electron-store/)            │ │   │
│  │  │  - Local configuration storage              │ │   │
│  │  │  - Shopify credentials                      │ │   │
│  │  └───────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  External Dependencies                             │   │
│  │  - Playwright Browser (resources/browser.zip)      │   │
│  │  - Crawlee Storage (%appdata%/spark/storage/)      │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  EXTERNAL SERVICES                          │
│  - Amazon (크롤링 대상)                                     │
│  - Shopify Admin GraphQL API (상품 업로드)                  │
│  - Socket.IO Auth Server (사용자 인증)                      │
│  - Category Matching API (카테고리 매핑)                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔄 전체 워크플로우

### Phase 1: 애플리케이션 초기화

```
사용자가 Spark 실행
    ↓
[Main Process] app.whenReady()
    ↓
1. Chromium 브라우저 압축 해제
   - resources/browser.zip → %appdata%/spark/browser/
   - 256MB Chromium 실행 파일
    ↓
2. IPC Handlers 등록
   - auth, crawler, shopify, store, socket
    ↓
3. BrowserWindow 생성
   - 1200x700 크기
   - Custom Titlebar
   - Preload script 로드
    ↓
4. Auto-update 체크
   - electron-updater
   - CDN: https://cdn.eduaddition.com
    ↓
[Renderer Process] Vue App 초기화
    ↓
- Pinia Store 설정
- Vue Router 설정
- /signin 페이지로 이동
```

---

### Phase 2: 사용자 인증

```
사용자가 로그인 정보 입력
    ↓
[Renderer] SignIn.vue
    ↓
window.api.auth.socketLogin(id, password)
    ↓
[Main] auth.ipc.ts
    ↓
[Socket.IO Client] socket/index.ts
    ↓
Socket.IO Auth Server 연결
    ↓
인증 성공 시:
  - Pinia authStore에 사용자 정보 저장
  - /app/task 페이지로 리다이렉트
    ↓
인증 실패 시:
  - 에러 메시지 표시
```

---

### Phase 3: 크롤링 작업

#### 3.1 크롤링 설정

```
[TaskSettings.vue]
사용자가 크롤링 설정
    ↓
1. 검색 URL 입력
   - Amazon 검색 결과 URL 또는
   - ASIN 직접 입력
    ↓
2. 옵션 선택
   - Headless 모드 (브라우저 숨김)
   - Prime 상품만 크롤링
    ↓
설정 저장 (Electron Store)
```

#### 3.2 크롤링 실행

```
[TaskActions.vue]
사용자가 "크롤링 시작" 버튼 클릭
    ↓
window.api.crawler.run(requests, headless, isPrime)
    ↓
[Main] crawler.ipc.ts
    ↓
[Crawler] crawlee/index.ts
    ↓
1. 기존 Crawler 인스턴스 종료
   - Crawler.kill()
   - Chrome 프로세스 정리
    ↓
2. 새 Crawler 인스턴스 초기화
   - PlaywrightCrawler 생성
   - Storage ID 생성: MMDD_HHmmss
   - Browser 경로: %appdata%/spark/browser/chromium-1181/chrome-win/chrome.exe
   - maxConcurrency: 1 (순차 크롤링)
    ↓
3. Router 등록
   ┌─────────────────────────────────────────────────┐
   │ Router Handler                                  │
   ├─────────────────────────────────────────────────┤
   │ AMAZON_SEARCH_LIST (req.list.ts)               │
   │  - Amazon 검색 결과 페이지 파싱                │
   │  - 상품 ASIN 목록 추출                         │
   │  - 다음 페이지 큐에 추가                       │
   │  - AMAZON_PRODUCT_DETAIL로 라우팅             │
   ├─────────────────────────────────────────────────┤
   │ AMAZON_SEARCH_ASIN (req.asin.ts)               │
   │  - ASIN으로 상품 검색                          │
   │  - AMAZON_PRODUCT_DETAIL로 라우팅             │
   ├─────────────────────────────────────────────────┤
   │ AMAZON_PRODUCT_DETAIL (req.detail.ts)          │
   │  - 상품 상세 페이지 스크래핑                   │
   │  - 데이터 추출 (아래 참조)                     │
   │  - Dataset에 저장                              │
   └─────────────────────────────────────────────────┘
    ↓
4. 실시간 로그 전송
   - sendLogToRenderer('crawler:log', log)
   - TaskMonitor.vue에서 표시
    ↓
5. 크롤링 완료 시
   - sendToRenderer('crawler:complete', reason)
   - Crawler.kill() (브라우저 정리)
```

#### 3.3 상품 데이터 추출 (req.detail.ts)

```
[AMAZON_PRODUCT_DETAIL Router]
Playwright Page 객체로 Amazon 상품 페이지 접근
    ↓
1. 구매 가능 여부 확인
   - #buyNow 버튼 존재 확인
   - 없으면 스킵 (구매 불가 상품)
    ↓
2. 기본 정보 추출
   ┌─────────────────────────────────────┐
   │ Locator                │ 추출 데이터│
   ├─────────────────────────────────────┤
   │ span#productTitle      │ title      │
   │ a#bylineInfo           │ brand      │
   │ #twister-plus-price... │ price      │
   │ [name=quantity]        │ quantity   │
   │ #wayfinding-breadcrumbs│ tags       │
   └─────────────────────────────────────┘
    ↓
3. 상세 정보 추출 (3가지 스타일 대응)
   Style 1: #productOverview_feature_div
   Style 2: #productFactsDesktop_feature_div
   Style 3: #nic-po-expander-section-desktop
    ↓
   - overview: 제품 사양 테이블
   - aboutThis: 제품 설명 리스트
    ↓
4. 옵션 정보 추출
   - window.twisterController.twisterJSInitData
   - 색상, 사이즈 등 변형 상품 정보
    ↓
5. 이미지 추출
   - #imageBlock_feature_div > script
   - ImageBlockATF 데이터 파싱
   - eval() 사용하여 JSON 추출
   - colorImages.initial 배열
    ↓
6. Product 객체 생성
   {
     url: string,
     asin: string,
     title: string,
     brand: string,
     price: number,
     options: { selectedVariations, variationDisplayLabels },
     quantity: number,
     tags: string[],
     category: string,
     overview: string[],
     aboutThis: string[],
     images: ImageData[]
   }
    ↓
7. Dataset에 저장
   - %appdata%/spark/storage/datasets/{storageId}/
   - JSON 형식으로 저장
    ↓
8. Renderer에 전송
   - sendToRenderer('crawler:data', product)
   - sendLogToRenderer('상품 정보 수집 완료')
```

---

### Phase 4: 데이터 관리

```
[DatasetManage.vue]
사용자가 크롤링 결과 확인
    ↓
1. Dataset 로드
   window.api.crawler.getData(storageId, page, limit)
    ↓
   [Main] crawler.ipc.ts
    ↓
   - Dataset.open(storageId)
   - KeyValueStore.open(storageId)
   - deselected ASIN 목록 로드
   - 페이지네이션 (50개씩)
    ↓
2. 상품 선택/제외
   사용자가 체크박스 클릭
    ↓
   window.api.crawler.selectData(storageId, select, [asin])
    ↓
   [Main] crawler.ipc.ts
    ↓
   - deselected 배열 업데이트
   - KeyValueStore에 저장
    ↓
3. 업로드할 상품 확인
   - 전체: total
   - 선택: selected
   - 제외: deselected
```

---

### Phase 5: Shopify 업로드

#### 5.1 Shopify 설정

```
[Settings.vue]
사용자가 Shopify 설정 입력
    ↓
1. Shopify Store Domain
   - 예: mystore.myshopify.com
    ↓
2. Access Token
   - Admin API Access Token
   - 필요한 권한:
     * write_products
     * write_inventory
     * write_price_rules
     * read_locations
    ↓
3. Price Margin (%)
   - 예: 30% → Amazon 가격 × 1.3
    ↓
window.api.store.set('appSettings', settings)
    ↓
[Main] store.ipc.ts
    ↓
Electron Store에 저장
- %appdata%/spark/config.json
```

#### 5.2 업로드 실행

```
[DatasetManage.vue]
사용자가 "Shopify 업로드" 버튼 클릭
    ↓
window.api.shopify.upload(storageId, selectedLocationId)
    ↓
[Main] shopify.ipc.ts
    ↓
[Shopify Client] shopify/index.ts
    ↓
┌─────────────────────────────────────────────────┐
│ Shopify Upload Process                         │
├─────────────────────────────────────────────────┤
│ Step 1: API Scope 검증                         │
│  - checkAccessScopes()                         │
│  - 필요 권한 확인                              │
│  - 부족 시 에러 반환                           │
├─────────────────────────────────────────────────┤
│ Step 2: Locations 로드                         │
│  - loadAllLocations()                          │
│  - GraphQL: locations query                   │
│  - 재고 위치 목록 캐싱                         │
├─────────────────────────────────────────────────┤
│ Step 3: Collections 로드                       │
│  - loadAllCollections()                        │
│  - GraphQL: collections query                 │
│  - 기존 컬렉션 캐싱                            │
├─────────────────────────────────────────────────┤
│ Step 4: Publications 로드                      │
│  - getPublications()                           │
│  - 상품을 게시할 채널 ID                       │
├─────────────────────────────────────────────────┤
│ Step 5: 데이터 준비 (2500개 단위)             │
│  - prepareData() generator                     │
│  - Dataset에서 페이지 단위로 로드              │
│  - deselected ASIN 필터링                      │
│    ↓                                           │
│  - convertData()                               │
│    ┌────────────────────────────────────────┐  │
│    │ Product → Shopify JSONL 변환          │  │
│    ├────────────────────────────────────────┤  │
│    │ 1. HTML Description 생성              │  │
│    │    - aboutThis → <ul><li>             │  │
│    │    - overview → <ul><li>              │  │
│    │                                        │  │
│    │ 2. Category 정규화                    │  │
│    │    - 공백 제거                        │  │
│    │    - 특수문자 제거                    │  │
│    │                                        │  │
│    │ 3. ProductInput 생성                  │  │
│    │    {                                  │  │
│    │      handle: asin,                    │  │
│    │      title: title,                    │  │
│    │      vendor: brand,                   │  │
│    │      productType: category,           │  │
│    │      tags: [...tags, category],       │  │
│    │      descriptionHtml: html,           │  │
│    │      publications: [...]              │  │
│    │    }                                  │  │
│    │                                        │  │
│    │ 4. MediaInput 생성                    │  │
│    │    - Amazon 이미지 URL 매핑           │  │
│    │    - 최대 해상도 이미지 선택          │  │
│    │                                        │  │
│    │ 5. JSONL 포맷                         │  │
│    │    {"input": {...}, "media": [...]}   │  │
│    └────────────────────────────────────────┘  │
├─────────────────────────────────────────────────┤
│ Step 6: Staged Upload (AWS S3)                │
│  - stagedUploadsCreate() GraphQL mutation     │
│  - S3 signed URL 생성                         │
│  - FormData로 JSONL 파일 업로드               │
├─────────────────────────────────────────────────┤
│ Step 7: Bulk Operation 실행                   │
│  - bulkOperationRunMutation()                 │
│  - mutation: PRODUCT_CREATE                   │
│  - stagedUploadPath 전달                      │
│  - Bulk Operation ID 반환                     │
├─────────────────────────────────────────────────┤
│ Step 8: Polling (작업 완료 대기)              │
│  - pollingCurrentBulkOperation(bulkOpId)      │
│  - 5초마다 상태 체크                          │
│  - Status: CREATED → RUNNING → COMPLETED      │
│  - result URL에서 결과 다운로드               │
│  - 성공한 Product ID 목록 추출                │
├─────────────────────────────────────────────────┤
│ Step 9: Price Update (마진 적용)              │
│  - updateProductPricesAndInventory()          │
│  - Amazon 가격 × (1 + margin%)                │
│  - GraphQL: productVariantsBulkUpdate         │
├─────────────────────────────────────────────────┤
│ Step 10: Inventory Update                     │
│  - GraphQL: inventorySetQuantities            │
│  - selectedLocationId에 재고 설정             │
│  - Amazon quantity 값 사용                    │
├─────────────────────────────────────────────────┤
│ Step 11: Collection Assignment                │
│  - 카테고리별 컬렉션 자동 생성/할당           │
│  - getMatchCategory() API 호출                │
│  - 기존 컬렉션이 없으면 새로 생성             │
│  - collectionAddProducts mutation             │
└─────────────────────────────────────────────────┘
    ↓
업로드 완료 알림
- sendToRenderer('shopify:uploadComplete', result)
```

#### 5.3 GraphQL Mutations 상세

```graphql
# 1. Staged Upload 생성
mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
  stagedUploadsCreate(input: $input) {
    stagedTargets {
      url
      resourceUrl
      parameters {
        name
        value
      }
    }
  }
}

# 2. Bulk Operation 실행
mutation bulkOperationRunMutation($mutation: String!, $stagedUploadPath: String!) {
  bulkOperationRunMutation(
    mutation: $mutation
    stagedUploadPath: $stagedUploadPath
  ) {
    bulkOperation {
      id
      status
    }
    userErrors {
      field
      message
    }
  }
}

# 3. Bulk Operation 상태 확인
query currentBulkOperation {
  currentBulkOperation(type: MUTATION) {
    id
    status
    errorCode
    createdAt
    completedAt
    objectCount
    fileSize
    url
  }
}

# 4. Product Variants 가격/재고 업데이트
mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) {
    product {
      id
    }
    userErrors {
      field
      message
    }
  }
}

# 5. Inventory 수량 설정
mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
  inventorySetQuantities(input: $input) {
    inventoryAdjustmentGroup {
      createdAt
      reason
    }
    userErrors {
      field
      message
    }
  }
}

# 6. Collection 생성
mutation collectionCreate($input: CollectionInput!) {
  collectionCreate(input: $input) {
    collection {
      id
      title
    }
    userErrors {
      field
      message
    }
  }
}

# 7. Collection에 상품 추가
mutation collectionAddProducts($id: ID!, $productIds: [ID!]!) {
  collectionAddProducts(id: $id, productIds: $productIds) {
    collection {
      id
    }
    userErrors {
      field
      message
    }
  }
}
```

---

## 🗄️ 데이터 흐름

### 1. 크롤링 데이터 저장 구조

```
%appdata%/spark/storage/
├── datasets/
│   └── {storageId}/  (예: 1215_143052)
│       ├── 000000001.json
│       ├── 000000002.json
│       └── ...
│
├── key_value_stores/
│   └── {storageId}/
│       ├── deselected.json  (제외된 ASIN 목록)
│       └── productsJSONL.txt  (Shopify 업로드용 JSONL)
│
└── request_queues/
    └── {storageId}/
        └── queue.json  (크롤링 요청 큐)
```

### 2. Dataset 파일 구조 (JSON)

```json
{
  "url": "https://www.amazon.com/dp/B08N5WRWNW",
  "asin": "B08N5WRWNW",
  "title": "Apple AirPods Max - Silver",
  "brand": "Apple",
  "price": 549.00,
  "options": {
    "selectedVariations": {
      "color_name": "Silver"
    },
    "variationDisplayLabels": {
      "color_name": "Color"
    }
  },
  "quantity": 10,
  "tags": [
    "Electronics",
    "Headphones",
    "Over-Ear Headphones"
  ],
  "category": "Over-Ear Headphones",
  "overview": [
    "Brand : Apple",
    "Model Name : AirPods Max",
    "Color : Silver",
    "Form Factor : Over Ear",
    "Connectivity Technology : Wireless"
  ],
  "aboutThis": [
    "Computational audio combines custom acoustic design with the Apple H1 chip",
    "Designed with a knit-mesh canopy and memory foam ear cushions",
    "Active Noise Cancellation blocks outside noise",
    "Transparency mode for hearing the world around you"
  ],
  "images": [
    {
      "hiRes": "https://m.media-amazon.com/images/I/81uSMJY8RnL._AC_SL1500_.jpg",
      "thumb": "https://m.media-amazon.com/images/I/41+RdpMrg1L._AC_US40_.jpg",
      "large": "https://m.media-amazon.com/images/I/41+RdpMrg1L._AC_.jpg",
      "main": {
        "1500,1500": "https://m.media-amazon.com/images/I/81uSMJY8RnL._AC_SL1500_.jpg"
      }
    }
  ],
  "selected": true
}
```

### 3. Shopify JSONL 변환 후

```jsonl
{"input":{"handle":"B08N5WRWNW","title":"Apple AirPods Max - Silver","vendor":"Apple","productType":"Over-Ear Headphones","tags":["Electronics","Headphones","Over-Ear Headphones","Over-Ear Headphones"],"descriptionHtml":"<div><h1>About This</h1><ul><li>Computational audio combines...</li></ul><h1>Overview</h1><ul><li>Brand : Apple</li></ul></div>","publications":[{"publicationId":"gid://shopify/Publication/12345"}]},"media":[{"originalSource":"https://m.media-amazon.com/images/I/81uSMJY8RnL._AC_SL1500_.jpg","mediaContentType":"IMAGE"}]}
```

---

## 📂 코드 구조 및 파일 설명

### Main Process (src/main/)

#### **index.ts** - 메인 프로세스 진입점
```typescript
/**
 * 주요 역할:
 * - Electron app 초기화
 * - BrowserWindow 생성 및 관리
 * - Auto-update 처리
 * - Chromium 브라우저 압축 해제
 * - IPC 핸들러 초기화
 *
 * 중요 함수:
 * - createWindow(): BrowserWindow 생성
 * - unpackResourceFiles(): browser.zip 압축 해제
 * - appUpdateCheck(): 자동 업데이트 체크
 */
```

#### **ipc/index.ts** - IPC 핸들러 초기화
```typescript
/**
 * 주요 역할:
 * - 모든 IPC 핸들러 등록
 * - Renderer → Main 통신 라우팅
 *
 * Exported Functions:
 * - sendToRenderer(channel, ...args): Main → Renderer 메시지 전송
 * - sendLogToRenderer(log): 크롤링 로그 전송
 */
```

#### **ipc/crawler.ipc.ts** - 크롤러 IPC 핸들러
```typescript
/**
 * IPC Handlers:
 *
 * crawler:run(requests, isHeadless, isPrime)
 *  - 크롤링 작업 시작
 *  - Crawler 인스턴스 초기화
 *  - storageId 반환
 *
 * crawler:stop()
 *  - 크롤링 중지
 *
 * crawler:getDataInfo(storageId)
 *  - Dataset 정보 조회 (total, selected, deselected)
 *
 * crawler:getData(storageId, page, limit)
 *  - Dataset 페이지네이션 조회
 *  - deselected 상태 포함
 *
 * crawler:selectData(storageId, select, asins)
 *  - 상품 선택/제외 처리
 *  - KeyValueStore에 deselected 배열 저장
 */
```

#### **ipc/shopify.ipc.ts** - Shopify IPC 핸들러
```typescript
/**
 * IPC Handlers:
 *
 * shopify:upload(storageId, selectedLocationId)
 *  - Shopify 업로드 실행
 *  - Shopify 클래스 인스턴스 생성
 *  - 업로드 프로세스 시작
 *
 * shopify:getLocations(storageId)
 *  - Shopify 위치 목록 조회
 *  - 재고 관리용 Location ID
 */
```

#### **ipc/auth.ipc.ts** - 인증 IPC 핸들러
```typescript
/**
 * IPC Handlers:
 *
 * auth:socketLogin(id, password, forceLogin)
 *  - Socket.IO를 통한 로그인
 *  - 인증 서버 연결
 *
 * auth:apiLogin(id, password)
 *  - REST API 로그인 (백업)
 *
 * auth:logout()
 *  - 로그아웃 처리
 *
 * auth:signUp(payload)
 *  - 회원가입 처리
 */
```

#### **ipc/store.ipc.ts** - 로컬 스토리지 IPC 핸들러
```typescript
/**
 * IPC Handlers:
 *
 * store:get(key)
 *  - Electron Store에서 값 조회
 *
 * store:set(key, value)
 *  - Electron Store에 값 저장
 *  - appSettings, shopifySettings 등
 */
```

---

### Crawler Engine (src/crawlee/)

#### **index.ts** - Crawler 클래스
```typescript
/**
 * Static Class: Crawler
 *
 * Properties:
 * - instance: PlaywrightCrawler 인스턴스
 * - stopReason: 중지 사유
 * - storageId: 현재 스토리지 ID (MMDD_HHmmss)
 *
 * Methods:
 * - init(isHeadless, isPrime): Crawler 초기화
 *   - PlaywrightCrawler 생성
 *   - Browser 경로 설정
 *   - Router 등록
 *   - 최대 재시도: 3회
 *   - maxConcurrency: 1 (순차 처리)
 *
 * - stop(reason, silence): 크롤링 중지
 *   - autoscaledPool.abort()
 *   - Browser 정리
 *
 * - kill(): Chrome 프로세스 강제 종료
 *   - find-process로 chrome 프로세스 찾기
 *   - --enable-automation 플래그 확인
 *
 * - DataSetOpen(storageId): Dataset 열기
 * - KeyValueStoreOpen(storageId): KeyValueStore 열기
 */
```

#### **routers/index.ts** - Router 등록
```typescript
/**
 * Crawlee Router 생성
 *
 * Routes:
 * - AMAZON_SEARCH_LIST: 검색 결과 페이지
 * - AMAZON_SEARCH_ASIN: ASIN 검색
 * - AMAZON_PRODUCT_DETAIL: 상품 상세
 */
```

#### **routers/req.list.ts** - 검색 결과 Router
```typescript
/**
 * AMAZON_SEARCH_LIST Handler
 *
 * 기능:
 * 1. 검색 결과 페이지 파싱
 * 2. Prime 필터링 (isPrime 옵션)
 * 3. 상품 ASIN 추출
 *    - data-asin 속성
 *    - [data-component-type="s-search-result"]
 * 4. AMAZON_PRODUCT_DETAIL로 라우팅
 * 5. 다음 페이지 큐 추가
 *    - .s-pagination-next 버튼
 */
```

#### **routers/req.asin.ts** - ASIN 검색 Router
```typescript
/**
 * AMAZON_SEARCH_ASIN Handler
 *
 * 기능:
 * 1. ASIN으로 Amazon 검색
 *    - URL: /s?k={asin}
 * 2. 검색 결과에서 첫 번째 상품 선택
 * 3. AMAZON_PRODUCT_DETAIL로 라우팅
 */
```

#### **routers/req.detail.ts** - 상품 상세 Router
```typescript
/**
 * AMAZON_PRODUCT_DETAIL Handler
 *
 * 데이터 추출 프로세스:
 *
 * 1. 구매 가능 여부 확인
 *    - #buyNow 버튼 체크
 *
 * 2. 기본 정보
 *    - title: span#productTitle
 *    - brand: a#bylineInfo (href에서 추출)
 *    - price: #twister-plus-price-data-price
 *    - quantity: [name=quantity] select
 *
 * 3. 카테고리/태그
 *    - tags: #wayfinding-breadcrumbs_feature_div li a
 *    - category: tags 배열의 마지막 요소
 *
 * 4. 상세 설명 (3가지 스타일)
 *    Style 1: #productOverview_feature_div
 *    Style 2: #productFactsDesktop_feature_div
 *    Style 3: #nic-po-expander-section-desktop
 *
 * 5. 옵션 정보
 *    - window.twisterController.twisterJSInitData
 *    - selectedVariations (색상, 사이즈 등)
 *    - variationDisplayLabels
 *
 * 6. 이미지
 *    - #imageBlock_feature_div > script
 *    - ImageBlockATF 파싱
 *    - eval()로 JSON 추출
 *
 * 7. Dataset 저장
 *    - pushData(product)
 *
 * 8. 로그 전송
 *    - sendLogToRenderer()
 */
```

#### **navigationHook.ts** - Navigation Hook
```typescript
/**
 * Post-Navigation Hook
 *
 * 기능:
 * - 페이지 로드 후 추가 처리
 * - 에러 페이지 감지
 * - 로그인 요구 감지
 */
```

---

### Shopify Integration (src/shopify/)

#### **index.ts** - Shopify 클래스
```typescript
/**
 * Class: Shopify
 *
 * Constructor:
 * - storageId: 크롤링 스토리지 ID
 * - Electron Store에서 설정 로드
 *   - shopifyStoreName
 *   - shopifyAccessToken
 *   - margin (가격 마진)
 * - AdminApiClient 생성
 *
 * Properties:
 * - client: Shopify Admin API Client
 * - apiVersion: '2025-07'
 * - cachedLocations: Location 캐시
 * - cachedCollections: Collection 캐시 (Map)
 * - selectedLocationId: 선택된 재고 위치
 *
 * Main Methods:
 *
 * upload()
 *  - 전체 업로드 프로세스 관리
 *  - Scope 검증 → Locations 로드 → Collections 로드
 *  → prepareData → stagedUpload → bulkOperation
 *  → polling → priceUpdate → inventoryUpdate → collectionAssign
 *
 * prepareData()
 *  - Generator 함수
 *  - Dataset을 2500개씩 나눠서 yield
 *  - deselected ASIN 필터링
 *
 * convertData(publications, uploadData)
 *  - Product → Shopify JSONL 변환
 *  - HTML Description 생성
 *  - ProductInput + MediaInput 생성
 *
 * stagedUploadsCreate()
 *  - AWS S3 Staged Upload 생성
 *  - signed URL 및 parameters 반환
 *
 * bulkOperationRunMutation(fileKey)
 *  - Bulk Operation 실행
 *  - PRODUCT_CREATE mutation
 *  - Bulk Operation ID 반환
 *
 * pollingCurrentBulkOperation(bulkOpId)
 *  - 5초마다 상태 체크
 *  - COMPLETED 될 때까지 대기
 *  - result URL에서 성공한 Product ID 추출
 *
 * updateProductPricesAndInventory(productIds)
 *  - 가격 업데이트 (마진 적용)
 *  - Amazon price × (1 + margin%)
 *
 * updateInventory(productIds)
 *  - 재고 수량 설정
 *  - selectedLocationId에 설정
 *
 * assignCollections(productIds)
 *  - 카테고리별 컬렉션 생성/할당
 *  - getMatchCategory() API 호출
 *
 * Helper Methods:
 *
 * checkAccessScopes()
 *  - 필요한 API 권한 확인
 *
 * loadAllLocations()
 *  - GraphQL: locations query
 *  - 페이지네이션 처리
 *
 * loadAllCollections()
 *  - GraphQL: collections query
 *  - Map<title, id> 형태로 캐싱
 *
 * getPublications()
 *  - 상품을 게시할 채널 ID
 */
```

---

### Frontend (src/renderer/)

#### **main.ts** - Vue App 진입점
```typescript
/**
 * Vue 3 앱 초기화
 *
 * Plugins:
 * - Pinia (State Management)
 * - Vue Router
 * - Element Plus (UI Library)
 * - i18n (다국어 - 미구현)
 */
```

#### **router/index.ts** - Vue Router 설정
```typescript
/**
 * Routes:
 *
 * /signin - SignIn.vue (로그인)
 * /signup - SignUp.vue (회원가입)
 * /app - Home.vue (레이아웃)
 *   ├─ /task - Task.vue (작업 허브)
 *   │   ├─ /task-actions - TaskActions.vue (크롤링 시작/중지)
 *   │   ├─ /task-settings - TaskSettings.vue (크롤링 설정)
 *   │   ├─ /task-monitor - TaskMonitor.vue (실시간 모니터링)
 *   │   └─ /task-log - TaskLog.vue (작업 로그)
 *   ├─ /dataset - DatasetManage.vue (데이터 관리)
 *   └─ /settings - Settings.vue (앱 설정)
 *
 * Navigation Guards:
 * - beforeEach: 인증 체크
 *   - authStore.isSignIn === false → /signin 리다이렉트
 */
```

#### **stores/auth.ts** - 인증 Store (Pinia)
```typescript
/**
 * Auth Store
 *
 * State:
 * - user: User 객체 (id, email, name 등)
 * - isSignIn: boolean
 *
 * Actions:
 * - setUser(user): 사용자 정보 설정
 * - clearUser(): 로그아웃 시 사용자 정보 제거
 */
```

#### **pages/SignIn.vue** - 로그인 페이지
```typescript
/**
 * 기능:
 * - 아이디/비밀번호 입력
 * - window.api.auth.socketLogin() 호출
 * - 성공 시:
 *   - authStore.setUser()
 *   - /app/task로 리다이렉트
 * - 실패 시:
 *   - 에러 메시지 표시
 */
```

#### **pages/Task.vue** - 작업 허브
```typescript
/**
 * 기능:
 * - 탭 네비게이션 (Actions, Settings, Monitor, Log)
 * - router-view로 자식 라우트 렌더링
 */
```

#### **pages/TaskActions.vue** - 크롤링 실행
```typescript
/**
 * 기능:
 * - "작업 시작" 버튼
 *   - window.api.crawler.run(requests, headless, isPrime)
 *   - /task-monitor로 이동
 *
 * - "작업 중지" 버튼
 *   - window.api.crawler.stop()
 *
 * - 작업 히스토리
 *   - 이전 크롤링 결과 목록
 *   - storageId 선택 → DatasetManage로 이동
 */
```

#### **pages/TaskSettings.vue** - 크롤링 설정
```typescript
/**
 * 기능:
 * - URL 입력
 *   - Amazon 검색 URL 또는 ASIN
 *
 * - 옵션 선택
 *   - Headless 모드
 *   - Prime 상품만
 *
 * - 설정 저장
 *   - window.api.store.set('taskSettings', settings)
 */
```

#### **pages/TaskMonitor.vue** - 실시간 모니터링
```typescript
/**
 * 기능:
 * - IPC 이벤트 리스닝
 *   - 'crawler:log': 크롤링 로그 수신
 *   - 'crawler:data': 상품 데이터 수신
 *   - 'crawler:complete': 완료 알림
 *
 * - 로그 테이블 표시
 *   - timestamp, level, label, url, message
 *
 * - 실시간 업데이트
 *   - 새 로그 자동 추가
 */
```

#### **pages/DatasetManage.vue** - 데이터 관리
```typescript
/**
 * 기능:
 * - Dataset 로드
 *   - window.api.crawler.getData(storageId, page, limit)
 *
 * - 상품 목록 테이블
 *   - 체크박스 (선택/제외)
 *   - ASIN, 제목, 브랜드, 가격, 수량
 *   - 이미지 썸네일
 *
 * - 선택/제외 처리
 *   - window.api.crawler.selectData(storageId, select, asins)
 *
 * - Shopify 업로드
 *   - window.api.shopify.upload(storageId)
 *   - 업로드 진행률 표시
 *   - 완료 시 알림
 *
 * - 페이지네이션
 *   - 50개씩 표시
 */
```

#### **pages/Settings.vue** - 앱 설정
```typescript
/**
 * 기능:
 * - Shopify 설정
 *   - Store Name
 *   - Access Token
 *   - Price Margin (%)
 *
 * - Location 선택
 *   - window.api.shopify.getLocations()
 *   - 재고 위치 선택
 *
 * - 설정 저장
 *   - window.api.store.set('appSettings', settings)
 *
 * - Access Token 검증
 *   - window.api.shopify.checkAccessScopes()
 *   - 필요 권한 확인
 */
```

---

### API Clients (src/api*, src/socket/)

#### **api/index.ts** - 인증 API 클라이언트
```typescript
/**
 * Axios 클라이언트
 *
 * Endpoints:
 * - POST /auth/login
 * - POST /auth/signup
 * - POST /auth/logout
 *
 * Base URL: 환경 변수에서 로드
 */
```

#### **api_new/index.ts** - 카테고리 매칭 API
```typescript
/**
 * 함수: getMatchCategory(category: string)
 *
 * 기능:
 * - Amazon 카테고리 → Shopify 카테고리 매핑
 * - 외부 API 호출
 * - 캐싱 가능
 */
```

#### **socket/index.ts** - Socket.IO 클라이언트
```typescript
/**
 * Socket.IO 클라이언트
 *
 * Events:
 * - connect: 연결 성공
 * - disconnect: 연결 종료
 * - forceLogout: 강제 로그아웃
 *   - sendToRenderer('auth:forceLogout', message)
 *
 * Methods:
 * - login(id, password, forceLogin)
 *   - emit('login', data)
 *   - 인증 서버에 로그인 요청
 *
 * - logout()
 *   - emit('logout')
 *   - Socket 연결 종료
 */
```

---

### Types (src/types/)

#### **index.ts** - 공통 타입
```typescript
/**
 * User: 사용자 정보
 *  - id, email, name, createdAt 등
 *
 * appSettings: 앱 설정
 *  - shopifySettings: Shopify 설정
 *  - taskSettings: 크롤링 설정
 *
 * shopifySettings:
 *  - shopifyStoreName: string
 *  - shopifyAccessToken: string
 *  - margin: number (%)
 *
 * CrawlerStopReason:
 *  - reason: string
 *  - silence: boolean
 */
```

#### **crawlee/index.ts** - Crawlee 타입
```typescript
/**
 * product: Amazon 상품 데이터
 *  - url, asin, title, brand, price
 *  - options, quantity, tags, category
 *  - overview, aboutThis, images
 *  - selected (UI 전용)
 *
 * productOptions:
 *  - selectedVariations: 선택된 옵션 (색상, 사이즈)
 *  - variationDisplayLabels: 옵션 라벨
 *
 * crawleeLog: 크롤링 로그
 *  - label, url, message, level, timestamp
 *
 * LABEL: Crawlee Router 라벨
 *  - AMAZON_SEARCH_LIST
 *  - AMAZON_SEARCH_ASIN
 *  - AMAZON_PRODUCT_DETAIL
 */
```

#### **admin.types.d.ts** - Shopify GraphQL 타입
```typescript
/**
 * @shopify/admin-api-client의 GraphQL 타입
 *
 * 자동 생성됨 (.graphqlrc.ts 설정)
 *
 * 주요 타입:
 * - ProductInput
 * - CreateMediaInput
 * - MediaContentType
 * - BulkOperationStatus
 * - InventorySetQuantitiesInput
 * - CollectionInput
 */
```

---

## 🔍 주요 워크플로우 시퀀스 다이어그램

### 1. 크롤링 시작 → 완료

```
User                TaskActions.vue    crawler.ipc.ts    Crawler          req.detail.ts    Dataset
 │                       │                   │               │                  │              │
 │ Click "시작"          │                   │               │                  │              │
 ├──────────────────────>│                   │               │                  │              │
 │                       │ invoke            │               │                  │              │
 │                       │ crawler:run       │               │                  │              │
 │                       ├──────────────────>│               │                  │              │
 │                       │                   │ Crawler.init()│                  │              │
 │                       │                   ├──────────────>│                  │              │
 │                       │                   │               │ PlaywrightCrawler│              │
 │                       │                   │               │ instance 생성    │              │
 │                       │                   │               │                  │              │
 │                       │                   │ instance.run()│                  │              │
 │                       │                   ├──────────────>│                  │              │
 │                       │                   │               │ Router Handler   │              │
 │                       │                   │               ├─────────────────>│              │
 │                       │                   │               │                  │ 데이터 추출  │
 │                       │                   │               │                  │              │
 │                       │                   │               │                  │ pushData()   │
 │                       │                   │               │                  ├─────────────>│
 │                       │                   │               │                  │              │ 저장
 │                       │                   │               │<─────────────────┤              │
 │                       │ send              │               │                  │              │
 │<──────────────────────┤ crawler:log       │               │                  │              │
 │ 로그 표시             │                   │               │                  │              │
 │                       │                   │               │                  │              │
 │                       │                   │<──────────────┤ 완료             │              │
 │                       │ send              │               │                  │              │
 │<──────────────────────┤ crawler:complete  │               │                  │              │
 │ 완료 알림             │                   │               │                  │              │
```

### 2. Shopify 업로드

```
User          DatasetManage    shopify.ipc    Shopify Class    GraphQL API    S3         Dataset
 │                 │               │                │                │          │            │
 │ Click "업로드"  │               │                │                │          │            │
 ├────────────────>│               │                │                │          │            │
 │                 │ invoke        │                │                │          │            │
 │                 │ shopify:upload│                │                │          │            │
 │                 ├──────────────>│                │                │          │            │
 │                 │               │ new Shopify()  │                │          │            │
 │                 │               ├───────────────>│                │          │            │
 │                 │               │                │ checkScopes    │          │            │
 │                 │               │                ├───────────────>│          │            │
 │                 │               │                │                │          │            │
 │                 │               │                │ loadLocations  │          │            │
 │                 │               │                ├───────────────>│          │            │
 │                 │               │                │                │          │            │
 │                 │               │                │ prepareData    │          │            │
 │                 │               │                ├───────────────────────────────────────>│
 │                 │               │                │                │          │            │ 로드
 │                 │               │                │<───────────────────────────────────────┤
 │                 │               │                │ convertData    │          │            │
 │                 │               │                │ (JSONL 변환)   │          │            │
 │                 │               │                │                │          │            │
 │                 │               │                │ stagedUpload   │          │            │
 │                 │               │                ├───────────────>│          │            │
 │                 │               │                │<───────────────┤          │            │
 │                 │               │                │ signed URL     │          │            │
 │                 │               │                │                │          │            │
 │                 │               │                │ upload JSONL   │          │            │
 │                 │               │                ├───────────────────────────>│            │
 │                 │               │                │                │          │            │
 │                 │               │                │ bulkOperation  │          │            │
 │                 │               │                ├───────────────>│          │            │
 │                 │               │                │<───────────────┤          │            │
 │                 │               │                │ bulkOpId       │          │            │
 │                 │               │                │                │          │            │
 │                 │               │                │ polling (5초)  │          │            │
 │                 │               │                ├───────────────>│          │            │
 │                 │               │                │<───────────────┤          │            │
 │                 │               │                │ COMPLETED      │          │            │
 │                 │               │                │                │          │            │
 │                 │               │                │ updatePrices   │          │            │
 │                 │               │                ├───────────────>│          │            │
 │                 │               │                │                │          │            │
 │                 │               │                │ updateInventory│          │            │
 │                 │               │                ├───────────────>│          │            │
 │                 │               │                │                │          │            │
 │                 │ send          │                │                │          │            │
 │<────────────────┤ shopify:uploadComplete         │                │          │            │
 │ 완료 알림       │               │                │                │          │            │
```

---

## 🛠️ 개발 가이드

### 환경 변수 설정

```bash
# .env
VITE_API_URL=https://your-auth-server.com
VITE_APP_VERSION=0.2.5
```

### 개발 모드 실행

```bash
npm install
npm run dev
```

### 빌드

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

### GraphQL 타입 생성

```bash
npm run graphql:codegen
```

---

## 🐛 트러블슈팅

### 1. WMIC 오류
- **증상**: "시스템이 지정한 파일을 찾을 수 없습니다" 오류
- **원인**: Playwright/Crawlee가 시스템 정보 수집 시 WMIC 호출
- **해결**: 환경 변수 설정 (index.ts에서 이미 적용됨)

### 2. Chromium 실행 실패
- **증상**: "browser.zip not found" 오류
- **원인**: browser.zip이 리소스 폴더에 없음
- **해결**: resources/browser.zip 파일 확인

### 3. Shopify API 권한 오류
- **증상**: "missingScopes" 오류
- **원인**: Access Token에 필요한 권한 없음
- **해결**: Shopify Admin에서 권한 추가
  - write_products
  - write_inventory
  - read_locations

### 4. 크롤링 중 브라우저 멈춤
- **증상**: 크롤링이 특정 페이지에서 멈춤
- **원인**: Amazon 봇 감지 또는 네트워크 오류
- **해결**:
  - Headful 모드로 실행
  - 재시도 (자동 3회 재시도)

---

## 📊 성능 최적화

### 1. 크롤링 성능
- maxConcurrency: 1 (순차 처리로 봇 감지 회피)
- requestHandlerTimeoutSecs: 600 (10분)
- maxRequestRetries: 3

### 2. Shopify 업로드
- 배치 크기: 2500개 (Shopify API 제한)
- Polling 간격: 5초
- 병렬 업로드: 지원 안 함 (순차 처리)

### 3. 메모리 관리
- Crawlee memoryMbytes: 4096
- NODE_OPTIONS: --max-old-space-size=4096

---

## 🔐 보안 고려사항

### 1. Electron Security
- Context Isolation: 활성화
- nodeIntegration: 비활성화
- Preload Script: 안전한 API만 노출

### 2. 민감 정보 저장
- Shopify Access Token: Electron Store (암호화)
- 사용자 비밀번호: 저장 안 함 (Socket.IO 인증만)

### 3. IPC 보안
- Renderer → Main: ipcRenderer.invoke (비동기)
- Main → Renderer: webContents.send (단방향)
- 모든 입력 검증

---

## 📝 라이선스

본 프로젝트는 내부 사용 목적으로 제작되었습니다.

---

## 👥 기여자

- 개발자: Spharmy Team
- 버전: 0.2.5
- 마지막 업데이트: 2025

---

**이 문서는 Spharmy Spark 프로젝트의 전체 워크플로우와 코드 구조를 설명합니다.**
**각 모듈의 상세한 구현은 소스 코드의 주석을 참고하세요.**
