# Shopify 상품 가격/재고 업데이트 실패 이슈

**증상:** 상품 ID는 생성되지만 가격/재고/무게 정보가 누락됨
**원인:** Bulk Operation 완료 대기 없이 다음 배치 시작 → 업데이트 함수 미실행
**영향:** 모든 배치의 상품이 불완전한 상태로 업로드됨
**우선순위:** 🔴 Critical (데이터 무결성 문제)

---

## 📋 목차

1. [문제 요약](#1-문제-요약)
2. [Shopify 상품 생성 프로세스](#2-shopify-상품-생성-프로세스)
3. [현재 코드의 문제점](#3-현재-코드의-문제점)
4. [왜 가격/재고가 안 올라가나?](#4-왜-가격재고가-안-올라가나)
5. [코드 분석](#5-코드-분석)
6. [해결 방법](#6-해결-방법)
7. [테스트 방법](#7-테스트-방법)

---

## 1. 문제 요약

### 현상

```
사용자가 Shopify 업로드 실행
  ↓
상품이 생성됨 (Shopify Admin에서 확인 가능)
  ↓
하지만...
  - 가격: $0.00 (또는 비어있음)
  - 재고: 0개 (또는 추적 안 함)
  - 무게: 비어있음
  - SKU: 비어있음
```

### 왜 이런 일이?

**Shopify Bulk Operation은 2단계로 작동합니다:**

```
1단계: 상품 기본 정보 생성
  - ID (자동 생성)
  - Title
  - Description
  - Images
  - Collections

2단계: 가격/재고/무게 업데이트
  - Price ← 별도 API 호출 필요!
  - Inventory ← 별도 API 호출 필요!
  - Weight ← 별도 API 호출 필요!
  - SKU ← 별도 API 호출 필요!
```

**현재 문제:** 1단계만 실행되고 2단계가 실행 안 됨!

---

## 2. Shopify 상품 생성 프로세스

### 정상적인 전체 흐름

```
┌──────────────────────────────────────────────────────────────┐
│ STEP 1: Bulk Operation으로 상품 생성                         │
├──────────────────────────────────────────────────────────────┤
│  Input (JSONL):                                              │
│  {                                                            │
│    "input": {                                                 │
│      "title": "상품명",                                       │
│      "descriptionHtml": "<p>설명</p>",                       │
│      "productType": "카테고리",                              │
│      "handle": "b001xyz",  ← ASIN                            │
│      "vendor": "브랜드",                                      │
│      "status": "ACTIVE"                                      │
│    },                                                         │
│    "media": [...]                                            │
│  }                                                            │
│                                                               │
│  Output:                                                      │
│  {                                                            │
│    "id": "gid://shopify/Product/123456789",                  │
│    "title": "상품명"                                         │
│  }                                                            │
│                                                               │
│  ⚠️ 주의: 가격/재고/무게는 여기서 설정 안 됨!               │
└──────────────────────────────────────────────────────────────┘
                     │
                     │ Bulk Operation 완료 (2-5분 소요)
                     │ result.url에서 생성된 상품 ID 다운로드
                     ▼
┌──────────────────────────────────────────────────────────────┐
│ STEP 2: 각 상품의 가격/재고/무게 업데이트                    │
├──────────────────────────────────────────────────────────────┤
│  for (각 생성된 상품) {                                      │
│                                                               │
│    2-1. 상품 Handle 조회 (ASIN)                             │
│         GET /products/{id}                                    │
│         → handle: "b001xyz"                                   │
│                                                               │
│    2-2. 원본 크롤링 데이터에서 정보 찾기                     │
│         findOriginalProductDataByAsin("b001xyz")              │
│         → { price: 19.99, quantity: 100, weight: 1.5 }       │
│                                                               │
│    2-3. 가격 업데이트                                        │
│         productVariantsBulkUpdate                            │
│         → price: $21.99 (마진 10% 적용)                      │
│                                                               │
│    2-4. 재고 활성화                                          │
│         inventoryActivate                                    │
│         → tracked: true                                       │
│                                                               │
│    2-5. 재고 수량 설정                                       │
│         inventoryAdjustQuantities                            │
│         → quantity: 100                                       │
│                                                               │
│    2-6. 무게 업데이트                                        │
│         productVariantsBulkUpdate                            │
│         → weight: 680g (1.5 lb 변환)                         │
│  }                                                            │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. 현재 코드의 문제점

### 코드 흐름

**파일:** `src/shopify/index.ts`

```typescript
async upload() {
  try {
    // ... 초기화

    const bulkOperationIds: string[] = [];

    // 각 배치(2500개) 처리
    for await (const uploadData of prepareData) {

      // STEP 1: Bulk Operation 시작
      const result = await this.bulkOperationRunMutation(fileKey);
      bulkOperationIds.push(result.id);

      // ❌ 문제: 완료 대기 없이 다음 배치로!

    } // ← for 루프 끝

    // STEP 2: 완료 대기 및 가격/재고 업데이트
    for (let i = 0; i < bulkOperationIds.length; i++) {
      await this.pollingCurrentBulkOperation(bulkOperationIds[i]);
      // ↑ 이 함수 안에서 updatePricesAndInventoryFromBulkResult() 호출
    }

  } catch (error) {
    // ⚠️ 두 번째 배치에서 에러 발생 시 여기로 점프!
    log.error('upload fail');
    return false;
  }
}
```

### 시나리오: 5000개 업로드

```
00:00 - 1번째 배치 (0-2500개)
          Bulk Operation 시작 (ID: 111)
          Shopify: "2500개 만들기 시작!" (RUNNING)
          bulkOperationIds = ["111"]

00:01 - ❌ for 루프 계속 (완료 대기 안 함!)

00:02 - 2번째 배치 (2500-5000개)
          Bulk Operation 시작 시도 (ID: 222)
          ❌ Shopify 에러: "Already running: 111"

00:03 - catch 블록으로 점프
          return false

00:04 - 프로그램 종료

❌ 결과:
  - pollingCurrentBulkOperation() 함수 도달 못함!
  - updatePricesAndInventoryFromBulkResult() 호출 안 됨!
  - 첫 번째 배치 2500개: ID만 생성, 가격/재고 없음!
  - 두 번째 배치 2500개: 아예 생성 안 됨!
```

---

## 4. 왜 가격/재고가 안 올라가나?

### 핵심 함수들

#### 4.1 pollingCurrentBulkOperation()

**위치:** `src/shopify/index.ts:951-977`

```typescript
async pollingCurrentBulkOperation(bulkOperationId: string): Promise<void> {

  while (true) {
    try {
      const result = await this.currentBulkOperation(bulkOperationId);

      // Bulk Operation 완료 시
      if (result.status !== BulkOperationStatus.Running) {
        if (result.status === BulkOperationStatus.Completed && result.url) {

          // ✅ 여기가 핵심!
          // result.url에서 생성된 상품 ID 목록 다운로드 후
          // 가격/재고/무게 업데이트 함수 호출
          if (!this.completedBulkOperations.has(bulkOperationId)) {
            this.completedBulkOperations.add(bulkOperationId);

            log.info(`Processing bulk result for: ${bulkOperationId}`);

            // ✅ 이 함수가 가격/재고를 업데이트함!
            await this.updatePricesAndInventoryFromBulkResult(result.url);

            log.info(`Completed processing bulk result for: ${bulkOperationId}`);
          }
        }

        return;  // 폴링 종료
      }

      // 아직 진행 중이면 100ms 대기 후 재시도
      await new Promise(resolve => setTimeout(resolve, 100));

    } catch (error) {
      log.error(`Error in polling bulk operation ${bulkOperationId}:`, error);
      throw error;
    }
  }
}
```

**Bulk Operation 결과 예시:**

```json
{
  "id": "gid://shopify/BulkOperation/123456",
  "status": "COMPLETED",
  "url": "https://storage.googleapis.com/shopify-bulk-operations/result-123456.jsonl",
  "objectCount": 2500,
  "fileSize": 50000000
}
```

**result.url 파일 내용:**

```jsonl
{"data":{"productCreate":{"product":{"id":"gid://shopify/Product/111","title":"상품1"}}}}
{"data":{"productCreate":{"product":{"id":"gid://shopify/Product/222","title":"상품2"}}}}
...
(2500줄)
```

---

#### 4.2 updatePricesAndInventoryFromBulkResult()

**위치:** `src/shopify/index.ts:1289-1430`

```typescript
async updatePricesAndInventoryFromBulkResult(bulkResultUrl: string) {

  try {
    // 1. 결과 파일 다운로드
    const response = await fetch(bulkResultUrl);
    const bulkResult = await response.text();

    const lines = bulkResult.split('\n').filter(line => line.trim());
    const createdProducts: Array<{id: string, title: string}> = [];

    // 2. 생성된 상품 ID 목록 추출
    for (const line of lines) {
      try {
        const result = JSON.parse(line);

        if (result.data?.productCreate?.product) {
          createdProducts.push({
            id: result.data.productCreate.product.id,
            title: result.data.productCreate.product.title
          });
        }
      } catch (parseError) {
        log.error('Failed to parse bulk result line:', parseError);
      }
    }

    // 3. 재고 위치 ID 가져오기
    const locationId = await this.createOrGetLocation();

    // 4. 각 상품에 대해 가격/재고/무게 업데이트
    for (const product of createdProducts) {

      // 4-1. 상품 Handle 조회 (ASIN)
      const productHandle = await this.getProductHandle(product.id);

      if (!productHandle) {
        log.error('Failed to get product handle for:', product.title);
        continue;
      }

      // 4-2. 원본 크롤링 데이터에서 정보 찾기
      const originalData = await this.findOriginalProductDataByAsin(productHandle);

      if (originalData) {
        // 4-3. 마진 적용 가격 계산
        const finalPrice = originalData.price + (originalData.price * this.margin) / 100;

        // 4-4. 무게 단위 변환 (kg/lb/oz → grams)
        let weightInGrams: number | undefined;
        if (originalData.weight && originalData.weightUnit) {
          if (originalData.weightUnit === 'kg') {
            weightInGrams = Math.round(originalData.weight * 1000);
          } else if (originalData.weightUnit === 'lb') {
            weightInGrams = Math.round(originalData.weight * 453.592);
          } else if (originalData.weightUnit === 'oz') {
            weightInGrams = Math.round(originalData.weight * 28.3495);
          }
        }

        // ✅ 4-5. 가격/재고/무게 업데이트 (여기가 핵심!)
        await this.updateProductPriceAndInventory(
          product.id,
          originalData.asin,
          finalPrice,
          originalData.quantity,
          locationId,
          weightInGrams
        );

        // 4-6. 카테고리 업데이트
        if (originalData.category && originalData.category.trim()) {
          // ... 카테고리 설정 로직
        }
      } else {
        log.error('Original data not found for handle:', productHandle);
      }
    }

  } catch (error) {
    log.error('Failed to update prices and inventory:', error);
  }
}
```

---

#### 4.3 updateProductPriceAndInventory()

**위치:** `src/shopify/index.ts:979-1287`

```typescript
async updateProductPriceAndInventory(
  productId: string,
  asin: string,
  price: number,
  quantity: number,
  locationId: string,
  weightInGrams?: number
) {

  try {
    // 1. Variant ID 조회
    const variantId = await this.getVariantId(productId);

    if (!variantId) {
      log.error('Variant not found for product:', productId);
      return false;
    }

    // 2. 가격 업데이트
    const updatePriceOp = `#graphql
      mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          userErrors {
            message
            field
          }
        }
      }
    `;

    await this.client.request(updatePriceOp, {
      variables: {
        productId: productId,
        variants: [{
          id: variantId,
          price: price.toString(),  // ← 가격 설정
          inventoryItem: {
            sku: asin,              // ← SKU 설정
            tracked: true,          // ← 재고 추적 활성화
            requiresShipping: true
          }
        }]
      }
    });

    // 3. 재고 활성화
    const activateInventoryOp = `#graphql
      mutation inventoryActivate($inventoryItemId: ID!, $locationId: ID!) {
        inventoryActivate(inventoryItemId: $inventoryItemId, locationId: $locationId) {
          userErrors {
            message
            field
          }
        }
      }
    `;

    const inventoryItemId = await this.getInventoryItemId(variantId);

    await this.client.request(activateInventoryOp, {
      variables: {
        inventoryItemId,
        locationId
      }
    });

    // 4. 재고 수량 설정
    const adjustInventoryOp = `#graphql
      mutation inventoryAdjustQuantities($input: InventoryAdjustQuantitiesInput!) {
        inventoryAdjustQuantities(input: $input) {
          userErrors {
            message
            field
          }
        }
      }
    `;

    await this.client.request(adjustInventoryOp, {
      variables: {
        input: {
          name: "available",
          reason: "correction",
          changes: [{
            inventoryItemId,
            locationId,
            delta: quantity  // ← 재고 수량 설정
          }]
        }
      }
    });

    // 5. 무게 업데이트
    if (weightInGrams) {
      const updateWeightOp = `#graphql
        mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            userErrors {
              message
              field
            }
          }
        }
      `;

      await this.client.request(updateWeightOp, {
        variables: {
          productId,
          variants: [{
            id: variantId,
            weight: weightInGrams / 1000,  // ← 무게 설정 (kg)
            weightUnit: "GRAMS"
          }]
        }
      });
    }

    return true;

  } catch (error) {
    log.error('Update price and inventory failed:', error);
    return false;
  }
}
```

---

#### 4.4 findOriginalProductDataByAsin()

**위치:** `src/shopify/index.ts:1540-1553`

```typescript
async findOriginalProductDataByAsin(asin: string) {
  try {
    // 크롤링 Dataset 열기
    const dsStorage = await Crawler.DataSetOpen(this.storageId);

    // 전체 데이터 로드 (최대 10,000개)
    const allData = await dsStorage.getData({ offset: 0, limit: 10000 });

    // ASIN으로 검색
    const asinLower = (asin || '').toLowerCase();
    const foundItem = allData.items.find(
      item => (item.asin || '').toLowerCase() === asinLower
    );

    return foundItem;  // { asin, price, quantity, weight, ... }
  } catch (error) {
    log.error('Failed to find original product data by ASIN:', error);
    return null;
  }
}
```

**원본 크롤링 데이터 예시:**

```json
{
  "asin": "B001XYZ",
  "title": "상품명",
  "price": 19.99,
  "quantity": 100,
  "weight": 1.5,
  "weightUnit": "lb",
  "category": "Electronics",
  "brand": "브랜드명",
  "images": [...]
}
```

---

## 5. 코드 분석

### 문제 지점

```typescript
// src/shopify/index.ts:381-427

// ❌ 현재 코드 (잘못됨)
for await (const uploadData of prepareData) {

  // Bulk Operation 시작
  const result = await this.bulkOperationRunMutation(fileKey);
  bulkOperationIds.push(result.id);

  // ⚠️ 완료 대기 없이 다음 배치로!

} // ← 첫 번째 for 끝

// 폴링 시작 (너무 늦음!)
for (let i = 0; i < bulkOperationIds.length; i++) {
  await this.pollingCurrentBulkOperation(bulkOperationIds[i]);
  // ↑ 여기서 updatePricesAndInventoryFromBulkResult() 호출
}
```

**문제:**
1. 첫 번째 배치 시작 (RUNNING)
2. 즉시 두 번째 배치 시작 시도
3. 에러 발생 → catch 블록으로 점프
4. 폴링 루프에 **도달 못함!**
5. 따라서 `updatePricesAndInventoryFromBulkResult()` **호출 안 됨!**
6. 가격/재고 업데이트 **안 됨!**

---

## 6. 해결 방법

### 수정: 즉시 완료 대기 및 업데이트

**위치:** `src/shopify/index.ts:410-420`

```typescript
// ✅ 수정 후 (올바름)
for await (const uploadData of prepareData) {

  // Bulk Operation 시작
  const result = await this.bulkOperationRunMutation(fileKey);
  const bulkOperationId = result.id;

  log.info(`Bulk operation started: ${bulkOperationId}`);
  log.info('Waiting for completion and updating prices/inventory...');

  // ✅ 즉시 완료 대기 (여기서 가격/재고 업데이트도 함께!)
  await this.pollingCurrentBulkOperation(bulkOperationId);
  // ↑ 이 함수 안에서 updatePricesAndInventoryFromBulkResult() 호출됨

  log.info(`✅ Batch completed with price/inventory updates!`);

  // ✅ 이제 다음 배치로 (안전)

}

// ✅ 아래 코드 삭제 (더 이상 불필요)
// const bulkOperationIds: string[] = [];  ← 삭제
// for (let i = 0; i < bulkOperationIds.length; i++) { ... }  ← 삭제
```

---

### 완전한 수정 버전

```typescript
async upload() {
  try {
    // ... 초기화 (권한 체크, 위치 로드 등)

    const publications = await this.getPublications();
    const prepareData = this.prepareData();

    let batchNumber = 0;

    // 각 배치(2500개) 처리
    for await (const uploadData of prepareData) {
      batchNumber++;

      log.info(`\n=== Processing batch ${batchNumber} ===`);
      log.info(`Batch size: ${uploadData.length} products`);

      // 1. Staged Upload 준비
      const stagedTarget = await this.stagedUploadsCreate();
      const uploadUrl = stagedTarget.url;
      const parameters = stagedTarget.parameters;
      const fileKey = parameters.find((e) => e.name == 'key')?.value as string;

      // 2. FormData 생성
      const formData = new FormData();
      parameters.forEach((param) => {
        formData.append(param.name, param.value);
      });

      // 3. JSONL 변환
      const productsJSONL = await this.convertData(publications, uploadData);

      // 4. JSONL 파일 저장
      const kvStorage = await Crawler.KeyValueStoreOpen(this.storageId);
      await kvStorage.setValue('productsJSONL', productsJSONL, {
        contentType: 'text/plain',
      });

      // 5. 파일 스트림 추가
      formData.append('file', createReadStream(
        path.join(app.getPath('sessionData'),
          './storage/key_value_stores', this.storageId, 'productsJSONL.txt')
      ));

      // 6. S3 업로드
      const response = await fetch(uploadUrl, { method: 'POST', body: formData });

      if (response.ok) {
        // 7. Bulk Operation 시작
        log.info('Starting bulk operation...');
        const bulkOperationRunMutationResult =
          await this.bulkOperationRunMutation(fileKey);

        const bulkOperationId = bulkOperationRunMutationResult.id;

        log.info(`Bulk operation ID: ${bulkOperationId}`);
        log.info('Status: RUNNING');

        // ✅ 8. 즉시 완료 대기 (다음 배치 시작 전에 완료해야 함)
        log.info('Waiting for bulk operation to complete...');
        log.info('This will take 2-5 minutes...');

        await this.pollingCurrentBulkOperation(bulkOperationId);
        // ↑ 폴링 함수 내부에서:
        //   - Bulk Operation 완료 대기
        //   - result.url에서 생성된 상품 ID 다운로드
        //   - updatePricesAndInventoryFromBulkResult() 호출
        //   - 각 상품의 가격/재고/무게 업데이트

        log.info(`✅ Batch ${batchNumber} completed successfully!`);
        log.info('  - Products created: ✅');
        log.info('  - Prices updated: ✅');
        log.info('  - Inventory updated: ✅');
        log.info('  - Weights updated: ✅');

      } else {
        throw new Error('jsonl upload error');
      }
    }

    // 9. 캐시 정리
    this.processedUrls.clear();
    this.completedBulkOperations.clear();

    // 10. 완료 알림
    log.info('\n=== All batches completed successfully! ===');
    sendToRenderer('shopify:uploadComplete', {
      message: 'All uploads completed successfully with price/inventory updates'
    });

    return true;
  } catch (error) {
    if (error instanceof Error) {
      log.error('upload fail : ', error.message);
      log.error('upload fail detail : ', error);
    } else {
      log.error('upload fail : ', error);
    }
    return false;
  }
}
```

---

## 7. 테스트 방법

### 7.1 로그 확인

업로드 진행 중 로그를 확인하세요:

```
=== Processing batch 1 ===
Batch size: 2500 products
Starting bulk operation...
Bulk operation ID: gid://shopify/BulkOperation/123456
Status: RUNNING
Waiting for bulk operation to complete...
This will take 2-5 minutes...

[폴링 중...]

Processing bulk result for: gid://shopify/BulkOperation/123456
  - Downloading result file...
  - Found 2500 created products
  - Updating price for: 상품1 (B001XYZ)
  - Updating price for: 상품2 (B002ABC)
  ...
  (2500개)
Completed processing bulk result for: gid://shopify/BulkOperation/123456

✅ Batch 1 completed successfully!
  - Products created: ✅
  - Prices updated: ✅
  - Inventory updated: ✅
  - Weights updated: ✅

=== Processing batch 2 ===
...
```

### 7.2 Shopify Admin 확인

1. **Products 페이지**
   ```
   상품명: 상품1
   Price: $21.99 ✅ (원가 $19.99 + 마진 10%)
   Inventory: 100 ✅
   SKU: B001XYZ ✅
   Weight: 680 g ✅ (1.5 lb 변환)
   ```

2. **특정 상품 상세 페이지**
   - Variants 섹션 확인
   - Price 필드 채워져 있는지
   - SKU 필드 채워져 있는지
   - Inventory 섹션에서 "Track quantity" 활성화되어 있는지
   - Available quantity가 설정되어 있는지
   - Shipping 섹션에서 Weight 설정되어 있는지

### 7.3 GraphQL 쿼리로 확인

```graphql
query {
  product(id: "gid://shopify/Product/123456789") {
    id
    title
    handle

    variants(first: 1) {
      nodes {
        id
        price
        sku
        weight
        weightUnit

        inventoryItem {
          id
          tracked
        }

        inventoryQuantity
      }
    }
  }
}
```

**예상 응답:**

```json
{
  "data": {
    "product": {
      "id": "gid://shopify/Product/123456789",
      "title": "상품명",
      "handle": "b001xyz",
      "variants": {
        "nodes": [{
          "id": "gid://shopify/ProductVariant/987654321",
          "price": "21.99",
          "sku": "B001XYZ",
          "weight": 0.68,
          "weightUnit": "KILOGRAMS",
          "inventoryItem": {
            "id": "gid://shopify/InventoryItem/111222333",
            "tracked": true
          },
          "inventoryQuantity": 100
        }]
      }
    }
  }
}
```

---

## 8. 추가 개선 사항

### 8.1 로그 레벨 추가

```typescript
// 상세 진행 상황 로그
log.info(`Updating price for product ${productId}: ${price}`);
log.info(`Setting inventory quantity to: ${quantity}`);
log.info(`Setting weight to: ${weightInGrams}g`);
```

### 8.2 에러 복구 로직

```typescript
// 가격 업데이트 실패 시에도 계속 진행
try {
  await this.updateProductPriceAndInventory(...);
} catch (error) {
  log.error(`Failed to update product ${productId}:`, error);
  // 계속 진행 (다음 상품 처리)
}
```

### 8.3 진행률 표시

```typescript
// Renderer에게 진행 상황 전송
sendToRenderer('shopify:uploadProgress', {
  batchNumber,
  totalBatches,
  productsProcessed: currentIndex,
  totalProducts: createdProducts.length,
  currentProduct: product.title
});
```

---

## 9. FAQ

**Q: 왜 Bulk Operation에서 바로 가격을 설정 안 하나요?**
A: Shopify Bulk Operation의 제약사항입니다. productCreate mutation은 기본 정보만 받고, 가격/재고는 별도 API로 설정해야 합니다.

**Q: 가격 업데이트가 실패하면 어떻게 되나요?**
A: 해당 상품만 건너뛰고 다음 상품 처리를 계속합니다. 로그에 에러가 기록됩니다.

**Q: updatePricesAndInventoryFromBulkResult() 함수 실행 시간은?**
A: 2500개 상품 기준 약 5-10분 소요 (상품당 2-3개 API 호출 × 2500)

**Q: 원본 데이터를 못 찾으면?**
A: `findOriginalProductDataByAsin()`가 null 반환 → 가격/재고 업데이트 건너뜀 → 로그에 에러 기록

**Q: 두 번째 배치는 첫 번째 배치 완료 후에 시작되나요?**
A: 네, 수정 후에는 각 배치가 완전히 완료(가격/재고 업데이트 포함)된 후 다음 배치가 시작됩니다.

---

## 10. 체크리스트

- [ ] `src/shopify/index.ts:410-420` - 즉시 폴링 및 업데이트 추가
- [ ] `src/shopify/index.ts:377-378` - `bulkOperationIds` 배열 삭제
- [ ] `src/shopify/index.ts:423-427` - 나중 폴링 루프 삭제
- [ ] 로그 추가 (배치 진행 상황, 가격/재고 업데이트)
- [ ] 테스트: 100개 업로드 → Shopify Admin에서 가격/재고 확인
- [ ] 테스트: 3000개 업로드 → 모든 배치 가격/재고 확인
- [ ] 테스트: findOriginalProductDataByAsin() 함수 동작 확인
- [ ] 테스트: 네트워크 오류 시 에러 처리
- [ ] 문서 업데이트

---

**작성자:** Claude (Anthropic)
**작성일:** 2025-01-05
**버전:** 1.0
**관련 문서:** BULK_UPLOAD_ISSUE_ANALYSIS.md
