# Shopify Bulk Upload 2500개 제한 이슈 분석

**이슈:** 5000개 상품 업로드 시 2500개에서 멈춤
**원인:** Bulk Operation 완료 대기 없이 다음 배치 시작
**영향:** 두 번째 배치부터 실패, 데이터 부분 업로드
**우선순위:** 🔴 Critical (프로덕션 배포 차단)

---

## 📋 목차

1. [문제 요약](#1-문제-요약)
2. [전체 업로드 플로우](#2-전체-업로드-플로우)
3. [문제 코드 분석](#3-문제-코드-분석)
4. [Shopify Bulk Operation 제한사항](#4-shopify-bulk-operation-제한사항)
5. [시나리오별 분석](#5-시나리오별-분석)
6. [해결 방법](#6-해결-방법)
7. [테스트 방법](#7-테스트-방법)

---

## 1. 문제 요약

### 현상

```
사용자가 5000개 상품 업로드 시도
  ↓
1번째 배치 (0-2500개) → ✅ 성공
2번째 배치 (2500-5000개) → ❌ 실패
  ↓
최종 결과: 2500개만 업로드됨
```

### 근본 원인

**Shopify는 한 번에 1개의 Bulk Operation만 실행 가능합니다.**

현재 코드는:
1. 첫 번째 배치 업로드 시작 (RUNNING 상태)
2. **완료를 기다리지 않고** 즉시 두 번째 배치 시도
3. Shopify 에러: "A bulk operation is already running"
4. 프로그램 전체 중단

---

## 2. 전체 업로드 플로우

### 정상적인 흐름 (수정 필요)

```
┌──────────────────────────────────────────────────────────────┐
│ 1. USER INPUT (Renderer)                                     │
│    Settings.vue → "Upload to Shopify" 버튼 클릭             │
└────────────────────┬─────────────────────────────────────────┘
                     │ IPC: 'shopify:upload'
                     ▼
┌──────────────────────────────────────────────────────────────┐
│ 2. UPLOAD START (Main Process)                               │
│    src/main/ipc/shopify.ipc.ts                               │
│    → new Shopify(storageId)                                  │
│    → shopify.upload()                                        │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────┐
│ 3. DATA PREPARATION                                          │
│    src/shopify/index.ts:375                                  │
│    const prepareData = this.prepareData();  // Generator     │
│                                                               │
│    Yields 2500개씩:                                          │
│    - 첫 번째: [상품 0-2499]                                 │
│    - 두 번째: [상품 2500-4999]                              │
│    - ...                                                     │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────┐
│ 4. BATCH UPLOAD LOOP (문제 발생 지점!)                       │
│    src/shopify/index.ts:381-421                              │
│                                                               │
│    for await (const uploadData of prepareData) {             │
│      // 각 배치(2500개)마다 실행                            │
│                                                               │
│      ┌────────────────────────────────────────────────┐     │
│      │ 4-1. Staged Upload 생성                        │     │
│      │      Shopify에게 S3 업로드 URL 요청            │     │
│      └────────────────────────────────────────────────┘     │
│                                                               │
│      ┌────────────────────────────────────────────────┐     │
│      │ 4-2. JSONL 변환                                │     │
│      │      Amazon 데이터 → Shopify 포맷              │     │
│      └────────────────────────────────────────────────┘     │
│                                                               │
│      ┌────────────────────────────────────────────────┐     │
│      │ 4-3. S3 업로드                                 │     │
│      │      JSONL 파일 업로드                         │     │
│      └────────────────────────────────────────────────┘     │
│                                                               │
│      ┌────────────────────────────────────────────────┐     │
│      │ 4-4. Bulk Operation 시작                      │     │
│      │      Shopify: "이 파일 보고 상품 만들어줘"    │     │
│      │      Response: { id: "gid://...", status: "RUNNING" }│
│      └────────────────────────────────────────────────┘     │
│                                                               │
│      ┌────────────────────────────────────────────────┐     │
│      │ 4-5. ID 저장하고 계속 (❌ 여기가 문제!)        │     │
│      │      bulkOperationIds.push(id)                 │     │
│      │      // ⚠️ 완료 대기 없이 다음 배치로!        │     │
│      └────────────────────────────────────────────────┘     │
│    }                                                         │
└────────────────────┬─────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────┐
│ 5. POLLING (너무 늦게 실행!)                                 │
│    src/shopify/index.ts:423-427                              │
│                                                               │
│    for (let i = 0; i < bulkOperationIds.length; i++) {       │
│      await this.pollingCurrentBulkOperation(ids[i]);         │
│    }                                                         │
│                                                               │
│    ⚠️ 하지만 이미 두 번째 배치에서 에러 발생!               │
│       → 여기까지 도달하지 못함                               │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. 문제 코드 분석

### 3.1 Main Upload Function

**파일:** `src/shopify/index.ts`

**위치:** 353-447줄

```typescript
async upload() {
  try {
    // 1. 권한 검증
    const missingScopes = await this.checkAccessScopes();
    if (missingScopes.length > 0) {
      throw new Error('missingScopes');
    }

    // 2. 재고 위치 로드
    if (!this.cachedLocations || this.cachedLocations.length === 0) {
      await this.loadAllLocations();
    }

    // 3. 컬렉션 로드
    await this.loadAllCollections();

    // 4. 판매 채널 조회
    const publications = await this.getPublications();

    // 5. 데이터 준비 (Generator - 2500개씩)
    const prepareData = this.prepareData();

    // 6. Bulk Operation ID 저장 배열 생성
    const bulkOperationIds: string[] = [];  // ← 문제의 시작

    // 7. 각 배치 처리 (여기가 문제!)
    for await (const uploadData of prepareData) {

      // 7-1. Staged Upload 생성
      const stagedTarget = await this.stagedUploadsCreate();
      const uploadUrl = stagedTarget.url;
      const parameters = stagedTarget.parameters;
      const fileKey = parameters.find((e) => e.name == 'key')?.value as string;

      // 7-2. FormData 생성
      const formData = new FormData();
      parameters.forEach((param) => {
        formData.append(param.name, param.value);
      });

      // 7-3. JSONL 변환
      const productsJSONL = await this.convertData(publications, uploadData);

      // 7-4. JSONL 파일 저장
      const kvStorage = await Crawler.KeyValueStoreOpen(this.storageId);
      await kvStorage.setValue('productsJSONL', productsJSONL, {
        contentType: 'text/plain',
      });

      // 7-5. 파일 스트림 추가
      formData.append('file', createReadStream(
        path.join(app.getPath('sessionData'),
          './storage/key_value_stores', this.storageId, 'productsJSONL.txt')
      ));

      // 7-6. S3 업로드
      const response = await fetch(uploadUrl, { method: 'POST', body: formData });

      if (response.ok) {
        // 7-7. Bulk Operation 시작
        const bulkOperationRunMutationResult =
          await this.bulkOperationRunMutation(fileKey);

        const bulkOperationId = bulkOperationRunMutationResult.id;

        // ❌ 문제: ID만 저장하고 바로 다음 배치로!
        bulkOperationIds.push(bulkOperationId);

        // ⚠️ 여기서 완료를 기다려야 하는데 안 기다림!
        // await this.pollingCurrentBulkOperation(bulkOperationId);

      } else {
        throw new Error('jsonl upload error');
      }
    }

    // 8. 모든 배치 완료 대기 (너무 늦음!)
    // ⚠️ 이미 위에서 에러 발생했으므로 여기 도달 못함
    for (let i = 0; i < bulkOperationIds.length; i++) {
      const bulkOperationId = bulkOperationIds[i];
      await this.pollingCurrentBulkOperation(bulkOperationId);
    }

    // 9. 캐시 정리
    this.processedUrls.clear();
    this.completedBulkOperations.clear();

    // 10. 완료 알림
    sendToRenderer('shopify:uploadComplete', {
      message: 'All uploads completed successfully'
    });

    return true;
  } catch (error) {
    // 에러 발생 시
    if (error instanceof Error) {
      log.error('upload fail : ', error.message);
      log.error('upload fail detail : ', error);
    } else {
      log.error('upload fail : ', error);
    }
    return false;  // ← 두 번째 배치 실패 시 여기서 종료
  }
}
```

---

### 3.2 Data Preparation Generator

**파일:** `src/shopify/index.ts`

**위치:** 271-308줄

```typescript
async *prepareData() {
  // Crawler 스토리지 열기
  const dsStorage = await Crawler.DataSetOpen(this.storageId);       // Dataset
  const kvStorage = await Crawler.KeyValueStoreOpen(this.storageId); // Key-Value

  // 제외된 상품 목록 (UI에서 체크박스 해제한 것들)
  const deselected = (await kvStorage.getValue<string[]>('deselected')) || [];

  let uploadData: product[] = [];
  let page = 1;
  const limit = 2500;  // Shopify Bulk Operation 권장 배치 크기

  while (true) {
    const offset = (page - 1) * limit;

    // Dataset에서 2500개씩 읽기
    const allDataset = await dsStorage.getData({
      offset,
      limit,
    });

    // 더 이상 데이터 없으면 종료
    if (allDataset.items.length === 0) break;

    // 제외 목록에 없는 상품만 필터링
    uploadData = allDataset.items.filter((e) => !deselected.includes(e.asin));

    page++;  // 다음 페이지

    // 필터링 후 남은 데이터가 없으면 건너뛰기
    if (uploadData.length === 0) {
      continue;
    }

    // ✅ 2500개 청크 반환
    yield uploadData;
  }
}
```

**동작:**
```javascript
// 5000개 상품이 있다면
prepareData()
  → yield [상품 0-2499]      // 첫 번째 yield
  → yield [상품 2500-4999]   // 두 번째 yield
  → return                    // 끝
```

---

### 3.3 Bulk Operation Mutation

**파일:** `src/shopify/index.ts`

**위치:** 483-546줄

```typescript
async bulkOperationRunMutation(stagedUploadPath: string) {
  const op = `#graphql
    mutation bulkOperationRunMutation($stagedUploadPath: String!){
      bulkOperationRunMutation(
        mutation: "mutation call($input: ProductInput!, $media: [CreateMediaInput!]) {
          productCreate(input: $input, media: $media) {
            product { id title collections(first: 10) { nodes { id title } } }
            userErrors { message field }
          }
        }",
        stagedUploadPath: $stagedUploadPath
      ) {
        bulkOperation {
          id
          url
          status
        }
        userErrors {
          message
          field
        }
      }
    }
  `;

  const { errors, data } = await this.client.request(op, {
    variables: {
      stagedUploadPath,
    },
  });

  if (errors) {
    log.error('Errors details:', JSON.stringify(errors, null, 2));
    throw new Error(errors.message);
  }

  if (!data) throw new Error('data is not found');

  let bulkOperation: { id: string; url?: string; status: string } | null = null;

  // ⚠️ 5가지 시도로 bulkOperation 추출 (타입 안전성 문제)
  if (data.bulkOperationRunMutation?.bulkOperation) {
    bulkOperation = data.bulkOperationRunMutation.bulkOperation;
  }
  else if (data.bulkOperationRunMutation?.bulkOperationRunMutation?.bulkOperation) {
    bulkOperation = data.bulkOperationRunMutation.bulkOperationRunMutation.bulkOperation;
  }
  else if (data.bulkOperation) {
    bulkOperation = data.bulkOperation;
  }
  else if (data.data?.bulkOperation) {
    bulkOperation = data.data.bulkOperation;
  }
  else if (data.bulkOperationRunMutation?.userErrors?.length > 0) {
    const userErrors = data.bulkOperationRunMutation.userErrors;
    log.error('User errors found:', userErrors);
    throw new Error(`Bulk operation failed: ${userErrors.map((e: { message: string }) => e.message).join(', ')}`);
  }

  if (!bulkOperation) {
    if (data.bulkOperationRunMutation) {
      log.error('Available keys in bulkOperationRunMutation:',
        Object.keys(data.bulkOperationRunMutation));
    }

    if (data.errors) {
      log.error('Response errors:', data.errors);
    }

    throw new Error('bulkOperation is not found in response structure');
  }

  return bulkOperation;
}
```

**응답 예시:**
```json
{
  "bulkOperationRunMutation": {
    "bulkOperation": {
      "id": "gid://shopify/BulkOperation/123456789",
      "url": null,
      "status": "RUNNING"
    },
    "userErrors": []
  }
}
```

---

### 3.4 Polling Function

**파일:** `src/shopify/index.ts`

**위치:** 951-977줄

```typescript
async pollingCurrentBulkOperation(bulkOperationId: string) {
  // ✅ 이 함수는 제대로 작성되어 있음
  while (true) {
    const result = await this.currentBulkOperation(bulkOperationId);

    if (result.status !== BulkOperationStatus.Running) {
      // 완료 또는 실패 시 종료
      return;
    }

    // ⚠️ 문제: 100ms 고정 간격 (Rate Limiting 위험)
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

async currentBulkOperation(bulkOperationId: string) {
  const op = `#graphql
    query currentBulkOperation{
      currentBulkOperation(type: MUTATION) {
        id
        status
        errorCode
        createdAt
        completedAt
        objectCount
        fileSize
        url
        partialDataUrl
      }
    }
  `;

  const { errors, data } = await this.client.request(op);

  if (errors) throw new Error(errors.message);
  if (!data) throw new Error('data is not found');

  const currentBulkOperation = data.currentBulkOperation;

  if (!currentBulkOperation) {
    throw new Error('currentBulkOperation is not found');
  }

  return currentBulkOperation;
}
```

**상태 흐름:**
```
bulkOperation.status
  → "RUNNING" (진행 중)
  → "RUNNING" (30%)
  → "RUNNING" (60%)
  → "RUNNING" (90%)
  → "COMPLETED" (완료)
```

---

## 4. Shopify Bulk Operation 제한사항

### Shopify의 동시 실행 제한

**공식 문서:** https://shopify.dev/docs/api/usage/bulk-operations

```
동시 실행 가능 수: 1개
큐 크기: 0 (큐 없음)
재시도: 자동 없음
```

**즉:**
- ✅ Bulk Operation A 실행 → 완료 → Bulk Operation B 실행 (OK)
- ❌ Bulk Operation A 실행 (진행 중) → Bulk Operation B 시작 시도 (ERROR)

### 에러 메시지

```json
{
  "errors": {
    "message": "A bulk mutation operation for this app and shop is already in progress: gid://shopify/BulkOperation/123456789"
  }
}
```

---

## 5. 시나리오별 분석

### 시나리오 1: 2500개 업로드 (정상 작동)

```
00:00 - 1번째 배치 시작 (0-2500개)
00:01 - JSONL 업로드 → S3
00:02 - Bulk Operation 시작 (ID: 123456)
        Shopify: "2500개 만들기 시작!" (RUNNING)
00:03 - bulkOperationIds = ["123456"]
00:04 - for 루프 종료 (더 이상 데이터 없음)

00:05 - 폴링 시작
        await pollingCurrentBulkOperation("123456")
00:30 - Shopify 진행률: 10%
01:00 - Shopify 진행률: 25%
02:00 - Shopify 진행률: 50%
03:00 - Shopify 진행률: 75%
04:00 - Shopify: "완료!" (COMPLETED)

✅ 성공: 2500개 업로드 완료
```

---

### 시나리오 2: 5000개 업로드 (현재 코드 - 실패)

```
00:00 - 1번째 배치 시작 (0-2500개)
00:01 - JSONL 업로드 → S3
00:02 - Bulk Operation 시작 (ID: 123456)
        Shopify: "2500개 만들기 시작!" (RUNNING)
00:03 - bulkOperationIds = ["123456"]
        ⚠️ for 루프 계속 (두 번째 배치로)

00:04 - 2번째 배치 시작 (2500-5000개)
00:05 - JSONL 업로드 → S3
00:06 - Bulk Operation 시작 시도 (ID: 789012)

        ❌ Shopify 응답:
        {
          "errors": {
            "message": "A bulk operation is already running: gid://shopify/BulkOperation/123456"
          }
        }

00:07 - throw new Error(errors.message)
00:08 - catch 블록으로 점프
00:09 - log.error('upload fail')
00:10 - return false

❌ 실패: 2500개만 업로드됨
        나머지 2500개는 S3에만 올라가고 Shopify에는 안 들어감
```

---

### 시나리오 3: 10000개 업로드 (현재 코드 - 심각한 실패)

```
00:00 - 1번째 배치 (0-2500) 시작
00:02 - Bulk Op 시작 (ID: 111)
00:03 - 2번째 배치 (2500-5000) 시작
00:05 - Bulk Op 시작 시도 → ❌ 에러
00:06 - 프로그램 중단

결과:
  - 1번째 배치 (0-2500): ✅ 업로드 진행 중 (백그라운드)
  - 2번째 배치 (2500-5000): ❌ S3에만 올라감, Shopify는 실패
  - 3번째 배치 (5000-7500): ❌ 시도조차 안 함
  - 4번째 배치 (7500-10000): ❌ 시도조차 안 함

최종: 2500개만 업로드됨
```

---

## 6. 해결 방법

### 6.1 즉시 완료 대기 (권장)

**수정 위치:** `src/shopify/index.ts:410-420`

**현재 코드:**
```typescript
if (response.ok) {
  const bulkOperationRunMutationResult =
    await this.bulkOperationRunMutation(fileKey);

  const bulkOperationId = bulkOperationRunMutationResult.id;

  // ❌ ID만 저장
  bulkOperationIds.push(bulkOperationId);
} else {
  throw new Error('jsonl upload error');
}
```

**수정 후:**
```typescript
if (response.ok) {
  // Bulk Operation 시작
  const bulkOperationRunMutationResult =
    await this.bulkOperationRunMutation(fileKey);

  const bulkOperationId = bulkOperationRunMutationResult.id;

  // ✅ 즉시 완료 대기 (다음 배치 시작 전에 완료해야 함)
  log.info(`Waiting for bulk operation ${bulkOperationId} to complete...`);
  await this.pollingCurrentBulkOperation(bulkOperationId);
  log.info(`Bulk operation ${bulkOperationId} completed!`);

} else {
  throw new Error('jsonl upload error');
}
```

**추가 변경:**

1. **bulkOperationIds 배열 제거** (더 이상 불필요)

```typescript
// 377-378줄 삭제
// const bulkOperationIds: string[] = [];
```

2. **나중 폴링 루프 제거** (이미 위에서 완료)

```typescript
// 423-427줄 삭제
// for (let i = 0; i < bulkOperationIds.length; i++) {
//   const bulkOperationId = bulkOperationIds[i];
//   await this.pollingCurrentBulkOperation(bulkOperationId);
// }
```

---

### 6.2 Retry 로직 추가 (선택사항)

네트워크 일시 오류 대응:

```typescript
for await (const uploadData of prepareData) {
  let retryCount = 0;
  const maxRetries = 3;
  let success = false;

  while (!success && retryCount < maxRetries) {
    try {
      // Staged Upload
      const stagedTarget = await this.stagedUploadsCreate();
      // ... JSONL 변환 및 업로드

      // Bulk Operation 시작
      const result = await this.bulkOperationRunMutation(fileKey);

      // ✅ 완료 대기
      await this.pollingCurrentBulkOperation(result.id);

      success = true;
      log.info(`Batch uploaded successfully (attempt ${retryCount + 1})`);

    } catch (error) {
      retryCount++;
      log.error(`Batch failed (attempt ${retryCount}/${maxRetries}):`, error);

      if (retryCount >= maxRetries) {
        log.error('Max retries reached, skipping this batch');
        sendToRenderer('shopify:batchFailed', {
          message: `Failed after ${maxRetries} attempts`
        });
        // 다음 배치 계속 (전체 중단하지 않음)
      } else {
        // Exponential Backoff
        const waitTime = Math.pow(2, retryCount) * 1000;  // 2초, 4초, 8초
        log.info(`Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
}
```

---

### 6.3 Exponential Backoff for Polling (권장)

**수정 위치:** `src/shopify/index.ts:951-977`

**현재 코드:**
```typescript
async pollingCurrentBulkOperation(bulkOperationId: string) {
  while (true) {
    const result = await this.currentBulkOperation(bulkOperationId);
    if (result.status !== BulkOperationStatus.Running) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 100));  // ⚠️ 100ms 고정
  }
}
```

**수정 후:**
```typescript
async pollingCurrentBulkOperation(bulkOperationId: string) {
  let delay = 100;       // 초기 대기 시간
  const maxDelay = 5000; // 최대 대기 시간 (5초)

  while (true) {
    const result = await this.currentBulkOperation(bulkOperationId);

    if (result.status !== BulkOperationStatus.Running) {
      log.info(`Bulk operation ${bulkOperationId} completed with status: ${result.status}`);
      return;
    }

    // Exponential Backoff
    await new Promise(resolve => setTimeout(resolve, delay));
    delay = Math.min(delay * 1.5, maxDelay);  // 100ms → 150ms → 225ms → ... → 5000ms

    log.debug(`Polling bulk operation ${bulkOperationId}, next check in ${delay}ms`);
  }
}
```

**효과:**
```
1번째 체크: 100ms 대기
2번째 체크: 150ms 대기
3번째 체크: 225ms 대기
4번째 체크: 337ms 대기
5번째 체크: 506ms 대기
...
10번째 체크 이후: 5000ms 대기 (고정)
```

---

## 7. 테스트 방법

### 7.1 로컬 테스트

**준비:**
1. 테스트용 Shopify 스토어 생성
2. 3000개 상품 크롤링 (1500개 × 2배치)
3. 로그 활성화

**테스트 코드:**
```typescript
// src/shopify/index.ts upload() 함수에 추가
log.info('=== Upload started ===');
log.info(`Total batches: ${Math.ceil(totalProducts / 2500)}`);

for await (const uploadData of prepareData) {
  batchNumber++;
  log.info(`\n=== Processing batch ${batchNumber} ===`);
  log.info(`Batch size: ${uploadData.length}`);

  // ... 업로드 로직

  log.info(`Bulk operation started: ${bulkOperationId}`);
  log.info('Waiting for completion...');

  await this.pollingCurrentBulkOperation(bulkOperationId);

  log.info(`✅ Batch ${batchNumber} completed!`);
}

log.info('=== All batches completed ===');
```

**예상 로그 출력:**
```
=== Upload started ===
Total batches: 2

=== Processing batch 1 ===
Batch size: 2500
Bulk operation started: gid://shopify/BulkOperation/123456
Waiting for completion...
[폴링 중...]
✅ Batch 1 completed!

=== Processing batch 2 ===
Batch size: 500
Bulk operation started: gid://shopify/BulkOperation/789012
Waiting for completion...
[폴링 중...]
✅ Batch 2 completed!

=== All batches completed ===
```

---

### 7.2 Shopify Admin 확인

1. **Shopify Admin → Products**
   - 예상: 3000개 상품 존재

2. **Shopify Admin → Settings → Apps and sales channels**
   - 예상: 2개의 Bulk Operation 기록

3. **GraphQL 쿼리 실행 (선택사항)**
```graphql
query {
  currentBulkOperation(type: MUTATION) {
    id
    status
    objectCount
    createdAt
    completedAt
  }
}
```

---

### 7.3 에러 시뮬레이션 테스트

**1. 네트워크 오류 시뮬레이션:**
```typescript
// 임시로 에러 발생
if (batchNumber === 2) {
  throw new Error('Simulated network error');
}
```

**2. Rate Limit 시뮬레이션:**
```typescript
// 폴링 간격 1ms로 설정
setTimeout(resolve, 1);  // Shopify에서 Rate Limit 에러 발생해야 함
```

**3. 타임아웃 테스트:**
```typescript
// 매우 긴 폴링
let maxIterations = 1000;
while (maxIterations-- > 0) {
  // 강제로 긴 대기
}
```

---

## 8. 수정 완료 체크리스트

- [ ] `src/shopify/index.ts:410-420` - 즉시 완료 대기 추가
- [ ] `src/shopify/index.ts:377-378` - `bulkOperationIds` 배열 삭제
- [ ] `src/shopify/index.ts:423-427` - 나중 폴링 루프 삭제
- [ ] `src/shopify/index.ts:951-977` - Exponential Backoff 추가
- [ ] 로그 추가 (배치 진행 상황)
- [ ] 테스트: 3000개 업로드 (2배치)
- [ ] 테스트: 6000개 업로드 (3배치)
- [ ] 테스트: 네트워크 오류 복구
- [ ] 문서 업데이트: README.md

---

## 9. 참고 자료

### Shopify 공식 문서

- [Bulk Operations](https://shopify.dev/docs/api/usage/bulk-operations)
- [Rate Limits](https://shopify.dev/docs/api/usage/rate-limits)
- [GraphQL Admin API](https://shopify.dev/docs/api/admin-graphql)

### 관련 코드 파일

- `src/shopify/index.ts` - Shopify 업로드 메인 로직
- `src/main/ipc/shopify.ipc.ts` - IPC 핸들러
- `src/types/admin.types.d.ts` - Shopify 타입 정의

---

## 10. FAQ

**Q: 왜 2500개씩 나누나요?**
A: Shopify Bulk Operation의 권장 배치 크기입니다. 더 크면 타임아웃 위험이 있습니다.

**Q: 폴링은 얼마나 오래 걸리나요?**
A: 2500개 상품 기준 약 2-5분 소요됩니다.

**Q: 폴링 중 에러나면 어떻게 되나요?**
A: Retry 로직이 있으면 재시도, 없으면 해당 배치 실패하고 다음 배치 계속 진행합니다.

**Q: 첫 번째 배치가 완료될 때까지 UI가 멈추나요?**
A: 네, 하지만 로그를 통해 진행 상황을 볼 수 있습니다. 향후 Worker Thread로 개선 가능합니다.

**Q: 10000개 업로드하면 얼마나 걸리나요?**
A: 약 20-40분 (4배치 × 5-10분/배치)

---

**작성자:** Claude (Anthropic)
**작성일:** 2025-01-05
**버전:** 1.0
**다음 리뷰:** 수정 완료 후
