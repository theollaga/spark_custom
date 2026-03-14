# Spark - 개발자 문서

아마존 크롤링 및 Shopify 자동 업로드 시스템의 상세 개발자 문서입니다.

## 목차

- [프로젝트 개요](#프로젝트-개요)
- [아키텍처](#아키텍처)
- [디렉토리 구조](#디렉토리-구조)
- [핵심 모듈](#핵심-모듈)
- [데이터 흐름](#데이터-흐름)
- [IPC 통신](#ipc-통신)
- [빌드 프로세스](#빌드-프로세스)
- [트러블슈팅](#트러블슈팅)

---

## 프로젝트 개요

### 기본 정보

- **프로젝트명**: Spark
- **버전**: 0.2.5
- **플랫폼**: Windows 전용
- **Node 버전**: 20.12.2

### 핵심 기능

1. **사용자 인증**: Socket.IO 기반 실시간 세션 관리
2. **아마존 크롤링**: Playwright + Crawlee 자동화
3. **데이터 관리**: Crawlee Storage 기반 상품 관리
4. **Shopify 연동**: GraphQL Bulk Operation 업로드
5. **자동 업데이트**: Electron Auto-Updater

---

## 아키텍처

### Electron 3-Layer 구조

```
┌─────────────────────────────────────────┐
│      Renderer Process (Vue 3)           │
│  - UI/UX (Element Plus + Tailwind)     │
│  - State Management (Pinia)            │
│  - Routing (Vue Router)                │
└─────────────────┬───────────────────────┘
                  │
              IPC Bridge
                  │
┌─────────────────┴───────────────────────┐
│         Preload Scripts                 │
│  - Context Isolation                    │
│  - Security Layer                       │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────┴───────────────────────┐
│         Main Process (Node.js)          │
│  - Window Management                    │
│  - IPC Handlers                         │
│  - Crawler Engine (Crawlee)             │
│  - Shopify Client                       │
│  - Socket.IO Client                     │
└─────────────────────────────────────────┘
```

### 기술 스택

#### Frontend (Renderer)
- Vue 3 (3.4.15) - Progressive Framework
- TypeScript (5.3.3) - Type Safety
- Element Plus (2.7.1) - UI Components
- Tailwind CSS (3.4.3) - Utility CSS
- Pinia (2.1.7) - State Management
- Vue Router (4.3.2) - Routing

#### Backend (Main)
- Electron (28.2.0) - Desktop Framework
- Node.js (20.12.2) - Runtime
- Crawlee (3.14.1) - Web Scraping
- Playwright (1.52.0) - Browser Automation

#### API & Communication
- Shopify Admin API (2025-07) - GraphQL API
- Socket.IO Client (4.7.5) - Real-time
- Axios (1.7.2) - HTTP Client

---

## 디렉토리 구조

```
spharmy-spark/
├── src/
│   ├── main/                      # Main Process
│   │   ├── index.ts              # 앱 진입점
│   │   └── ipc/                  # IPC Handlers
│   │       ├── auth.ipc.ts       # 인증 핸들러
│   │       ├── crawler.ipc.ts    # 크롤링 핸들러
│   │       ├── shopify.ipc.ts    # Shopify 핸들러
│   │       ├── store.ipc.ts      # 스토리지 핸들러
│   │       ├── socket.ipc.ts     # 소켓 핸들러
│   │       └── electron.ipc.ts   # Electron 유틸
│   │
│   ├── preload/                   # Preload Scripts
│   │   ├── index.ts              # Preload 진입점
│   │   └── ipc.ts                # IPC Bridge
│   │
│   ├── renderer/                  # Renderer Process
│   │   └── src/
│   │       ├── pages/            # 페이지 컴포넌트
│   │       │   ├── SignIn.vue
│   │       │   ├── SignUp.vue
│   │       │   ├── Task.vue
│   │       │   ├── TaskActions.vue
│   │       │   ├── TaskSettings.vue
│   │       │   ├── TaskMonitor.vue
│   │       │   ├── TaskLog.vue
│   │       │   ├── DatasetManage.vue
│   │       │   └── Settings.vue
│   │       ├── components/       # 컴포넌트
│   │       ├── stores/           # Pinia 스토어
│   │       ├── router/           # Vue Router
│   │       ├── assets/           # CSS, Images
│   │       └── main.ts           # Vue 초기화
│   │
│   ├── crawlee/                   # 크롤링 엔진
│   │   ├── index.ts              # Crawler 클래스
│   │   ├── navigationHook.ts     # 네비게이션 훅
│   │   └── routers/              # 크롤링 라우터
│   │       ├── index.ts
│   │       ├── req.list.ts       # 상품 리스트
│   │       ├── req.asin.ts       # ASIN 검색
│   │       └── req.detail.ts     # 상품 상세
│   │
│   ├── shopify/                   # Shopify 연동
│   │   └── index.ts              # Shopify 클래스
│   │
│   ├── socket/                    # Socket.IO
│   │   └── index.ts
│   │
│   ├── api/                       # API (인증)
│   │   └── index.ts
│   │
│   ├── api_new/                   # 외부 API (카테고리)
│   │   └── index.ts
│   │
│   ├── electron-store/            # 로컬 스토리지
│   │   └── index.ts
│   │
│   ├── config/                    # 설정
│   │   └── index.ts
│   │
│   └── types/                     # TypeScript 타입
│       ├── index.ts
│       ├── admin.types.d.ts
│       └── crawlee/
│
├── resources/                     # 리소스
│   ├── browser.zip               # Chromium (256MB)
│   └── icon.png                  # 앱 아이콘
│
├── patches/                       # NPM 패치
│   └── adm-zip+0.5.12.patch
│
├── .env                          # 환경 변수
├── package.json
├── electron.vite.config.ts       # Vite 설정
├── electron-builder.yml          # 빌드 설정
└── tsconfig.json
```

---

## 핵심 모듈

### 1. Main Process (src/main/index.ts)

**역할**: Electron 앱 진입점 및 메인 프로세스 관리

```typescript
// 주요 기능
- BrowserWindow 생성 및 관리
- 커스텀 타이틀바 설정 (custom-electron-titlebar)
- 자동 업데이트 체크 (electron-updater)
- Chromium 브라우저 압축 해제 (browser.zip)
- IPC 핸들러 초기화
- WMIC 오류 방지 환경 변수 설정
```

**주요 프로세스**:

1. **앱 시작**
   ```typescript
   app.whenReady().then(() => {
     unpackResourceFiles();  // browser.zip 압축 해제
     initIPC();              // IPC 핸들러 등록
     createWindow();         // 윈도우 생성
     appUpdateCheck();       // 업데이트 체크
   });
   ```

2. **브라우저 압축 해제**
   ```typescript
   const unpackResourceFiles = async () => {
     const chromePath = path.join(app.getPath('sessionData'),
       '/browser/chromium-1181/chrome.exe');
     if (!existsSync(chromePath)) {
       const zip = new admZip(browserZip);
       zip.extractAllTo(extractPath, true);
     }
   };
   ```

### 2. Crawler 모듈 (src/crawlee/index.ts)

**역할**: 아마존 크롤링 엔진

```typescript
class Crawler {
  static instance: PlaywrightCrawler | null;
  static storageId: string;  // MMDD_HHmmss 형식
  static stopReason: CrawlerStopReason;

  // 크롤러 초기화
  static async init(isHeadless: boolean, isPrime: boolean) {
    this.storageId = dayjs().format('MMDD_HHmmss');
    const config = new Configuration({
      defaultBrowserPath: 'chromium path',
      defaultDatasetId: this.storageId,
      memoryMbytes: 4096,
      persistStorage: true,
    });

    this.instance = new PlaywrightCrawler({
      requestHandler: router,
      headless: !isHeadless,
      maxConcurrency: 1,
      launchContext: {
        launchOptions: {
          args: ['--disable-gpu', '--no-sandbox', ...]
        }
      }
    }, config);
  }

  // 크롤링 중지
  static async stop(reason?: string) {
    await this.instance.autoscaledPool?.abort();
    await this.instance.browserPool.closeAllBrowsers();
    await this.instance.teardown();
  }

  // Chrome 프로세스 강제 종료
  static async kill() {
    const chromProcList = await find('name', 'chrome');
    chromProcList.forEach(proc => process.kill(proc.pid));
  }
}
```

**크롤링 라우터**:

- `req.list.ts` - 아마존 검색 결과 페이지
- `req.asin.ts` - ASIN 직접 검색
- `req.detail.ts` - 상품 상세 페이지 (핵심)

**수집 데이터 구조**:
```typescript
{
  asin: string;
  title: string;
  brand: string;
  price: number;
  quantity: number;
  weight: number;
  weightUnit: string;  // kg, lb, oz
  category: string;
  tags: string[];
  images: Array<{
    main: { [size: string]: url }
  }>;
  aboutThis: string[];
  overview: string[];
}
```

**저장 위치**: `%appdata%/spark/storage/datasets/{storageId}/`

### 3. Shopify 모듈 (src/shopify/index.ts)

**역할**: Shopify 스토어 상품 업로드

```typescript
class Shopify {
  storageId: string;
  shopifyStoreName: string;
  shopifyAccessToken: string;
  margin: number;  // 가격 마진 (%)
  client: AdminApiClient;

  // 메인 업로드 프로세스
  async upload() {
    // 1. 권한 체크
    const missingScopes = await this.checkAccessScopes();

    // 2. Location 및 Collection 로드
    await this.loadAllLocations();
    await this.loadAllCollections();

    // 3. 데이터 준비 및 변환
    for await (const uploadData of this.prepareData()) {
      // 4. Staged Upload
      const stagedTarget = await this.stagedUploadsCreate();

      // 5. JSONL 변환
      const jsonl = await this.convertData(publications, uploadData);

      // 6. 파일 업로드
      await fetch(uploadUrl, { method: 'POST', body: formData });

      // 7. Bulk Operation 실행
      const bulkOpId = await this.bulkOperationRunMutation(fileKey);

      // 8. 완료 대기 (폴링)
      await this.pollingCurrentBulkOperation(bulkOpId);
    }
  }

  // 가격 및 재고 업데이트
  async updateProductPriceAndInventory(
    productId: string,
    asin: string,
    price: number,
    quantity: number,
    locationId: string,
    weightInGrams?: number
  ) {
    // 1. Variant 조회
    // 2. 가격 업데이트
    // 3. 재고 활성화
    // 4. 재고 수량 조정
    // 5. 무게 업데이트
  }

  // 컬렉션 생성 또는 조회
  async createOrGetCollection(categoryName: string) {
    // 캐시 확인 → 검색 → 생성
  }
}
```

**업로드 프로세스**:

```
크롤링 데이터 로드 (2500개 배치)
     ↓
JSONL 변환 (Amazon → Shopify 포맷)
     ↓
Staged Upload 생성 (S3 업로드 URL)
     ↓
JSONL 파일 업로드
     ↓
Bulk Mutation 실행
     ↓
완료 대기 (폴링, 100ms 간격)
     ↓
가격/재고/무게/컬렉션 업데이트
```

**필수 Shopify API 권한**:
```
write_products, read_products
write_locations, read_locations
write_channels, read_channels
write_inventory, read_inventory
write_orders, read_orders
```

### 4. IPC 통신 (src/main/ipc/)

**Main → Renderer**:

```typescript
// 로그 전송
sendLogToRenderer({
  label: string,
  url: string,
  message: string,
  level: 'info' | 'warn' | 'error',
  timestamp: number
});

// 이벤트 전송
sendToRenderer('crawler:complete', data);
sendToRenderer('auth:forceLogout', message);
sendToRenderer('shopify:uploadComplete', data);
```

**Renderer → Main**:

```typescript
// 인증
window.api.auth.login(loginId, password, forceLogin);
window.api.auth.logout();

// 크롤링
window.api.crawler.run(requests, isHeadless, isPrime);
window.api.crawler.stop();
window.api.crawler.getData(storageId, page, limit);
window.api.crawler.selectData(storageId, select, asins);

// Shopify
window.api.shopify.upload(storageId);
window.api.shopify.checkAccessScopes();

// 스토어
window.api.store.get('appSettings');
window.api.store.set('appSettings', settings);
```

### 5. Socket.IO (src/socket/index.ts)

**역할**: 실시간 인증 및 세션 관리

```typescript
export const socket: Socket = io(config.endPoint, {
  path: '/socket',
  transports: ['websocket'],
  autoConnect: false,
  reconnection: false,
});

// 로그인
export const login = (loginId, password, forceLogin) => {
  return new Promise<boolean>((resolve, reject) => {
    socket.auth = { loginId, password };
    socket.io.opts.query = { forceLogin };
    socket.connect();
  });
};

// 강제 로그아웃 이벤트
socket.on('auth:forceLogout', (message) => {
  sendToRenderer('auth:forceLogout', message);
});
```

---

## 데이터 흐름

### 크롤링 → 업로드 전체 프로세스

```
┌─────────────┐
│   Amazon    │ 검색 키워드 또는 ASIN
└──────┬──────┘
       │
       │ Crawlee + Playwright
       ↓
┌─────────────┐
│  Crawler    │ → Dataset Storage
│   Engine    │   (%appdata%/spark/storage/datasets/{id}/)
└──────┬──────┘
       │
       │ 크롤링 완료
       ↓
┌─────────────┐
│ Dataset     │ → 상품 조회 및 선택/해제
│ Manage Page │   KeyValueStore (deselected)
└──────┬──────┘
       │
       │ 업로드 요청
       ↓
┌─────────────┐
│  Shopify    │
│   Module    │
└──────┬──────┘
       │
       ├─→ JSONL 변환 (Amazon → Shopify)
       │
       ├─→ Staged Upload (S3)
       │
       ├─→ Bulk Mutation (GraphQL)
       │
       ├─→ 폴링 (완료 대기)
       │
       ├─→ 가격 업데이트 (마진 적용)
       │
       ├─→ 재고 업데이트
       │
       ├─→ 무게 업데이트
       │
       └─→ 컬렉션 추가
              ↓
       Shopify Store
```

### 데이터 저장소 구조

```
%appdata%/spark/
├── storage/
│   ├── datasets/
│   │   └── {storageId}/              # 크롤링된 상품
│   │       ├── 000000001.json
│   │       ├── 000000002.json
│   │       └── ...
│   │
│   ├── key_value_stores/
│   │   └── {storageId}/              # 메타 데이터
│   │       ├── deselected.json       # 선택 해제 ASIN
│   │       └── productsJSONL.txt     # Shopify 업로드용
│   │
│   └── request_queues/
│       └── {storageId}/              # 크롤링 큐
│
├── browser/                          # Chromium
│   └── chromium-1181/
│       └── chrome-win/
│           └── chrome.exe
│
├── config.json                       # Electron Store
└── logs/                             # Electron Log
```

---

## 빌드 프로세스

### 빌드 설정 (electron-builder.yml)

```yaml
appId: Spark
productName: Spark

# ASAR 압축 제외 (Chromium)
asarUnpack:
  - resources/**

# 빌드 제외 파일
files:
  - '!patches/*'
  - '!storage/*'
  - '!example.storage.zip'

# Windows 설정
win:
  executableName: Spark

nsis:
  artifactName: ${productName}-${version}-setup.${ext}
  createDesktopShortcut: always

# 자동 업데이트
publish:
  provider: generic
  url: https://cdn.eduaddition.com
```

### 빌드 전 체크리스트

1. **Playwright 브라우저 설치**
   ```bash
   npm run install:playwright
   # → resources/browser/ 생성
   ```

2. **브라우저 압축**
   ```bash
   # resources/browser/ → browser.zip 압축
   # browser 폴더 삭제
   ```

3. **타입 체크**
   ```bash
   npm run typecheck
   ```

4. **빌드 실행**
   ```bash
   npm run build:win
   # → dist/Spark-0.2.5-setup.exe
   ```

### 빌드 산출물

```
dist/
├── Spark-0.2.5-setup.exe          # NSIS 설치 파일
├── win-unpacked/                  # 언팩 버전 (디버깅)
└── builder-effective-config.yaml  # 빌드 설정
```

### 자동 업데이트 프로세스

1. **앱 시작 시 체크**
   ```typescript
   autoUpdater.checkForUpdates();
   ```

2. **새 버전 발견**
   ```typescript
   autoUpdater.on('update-available', () => {
     // 알림 표시
     new Notification({ title: '업데이트 알림' }).show();
   });
   ```

3. **다운로드 완료**
   ```typescript
   autoUpdater.on('update-downloaded', () => {
     // 사용자 확인 후 설치
     autoUpdater.quitAndInstall();
   });
   ```

---

## WMIC 방지 설정

Windows에서 `wmic.exe` 실행 오류를 방지하기 위한 설정입니다.

### 설정 파일

1. **electron.vite.config.ts** (빌드 타임)
   ```typescript
   process.env.PLAYWRIGHT_DISABLE_MEMORY_SNAPSHOT = '1';
   process.env.PLAYWRIGHT_DISABLE_CRASH_REPORTS = '1';
   process.env.PLAYWRIGHT_DISABLE_LOGGING = '1';
   ```

2. **src/main/index.ts** (메인 프로세스)
   ```typescript
   process.env.PLAYWRIGHT_DISABLE_MEMORY_SNAPSHOT = '1';
   process.env.PLAYWRIGHT_DISABLE_CRASH_REPORTS = '1';
   process.env.NODE_OPTIONS = '--max-old-space-size=4096';
   ```

3. **src/crawlee/index.ts** (크롤러)
   ```typescript
   process.env.PLAYWRIGHT_DISABLE_MEMORY_SNAPSHOT = '1';
   process.env.PLAYWRIGHT_DISABLE_CRASH_REPORTS = '1';
   ```

4. **src/config/index.ts** (전역 타입)
   ```typescript
   declare global {
     var CRAWLEE_DISABLE_WMIC: boolean;
     var CRAWLEE_DISABLE_SYSTEM_INFO: boolean;
     // ... 80여 개 설정
   }
   ```

---

## 패치 분석

### adm-zip+0.5.12.patch

**목적**: Electron 환경에서 `original-fs` 사용 비활성화

**파일**: `node_modules/adm-zip/util/fileSystem.js`

**변경**:
```diff
- if (typeof process === "object" && process.versions && process.versions["electron"]) {
+ if (typeof process === "object" && process.versions && process.versions["electron"] && false) {
```

**이유**:
- `original-fs`는 ASAR 외부 파일 접근 시 문제 발생
- `browser.zip` 압축 해제에 필요
- 일반 `fs` 모듈로 안정성 확보

**적용**: `postinstall` 스크립트에서 `patch-package` 자동 실행

---

## 트러블슈팅

### 1. Chromium 실행 실패

**증상**: "필수 파일을 찾을 수 없습니다"

**원인**: `browser.zip` 미압축 또는 경로 오류

**해결**:
```bash
npm run install:playwright
# resources/browser/ 폴더 확인
```

### 2. Shopify API 권한 오류

**증상**: `missingScopes` 에러

**원인**: Access Token 권한 부족

**해결**:
1. Shopify Admin → Apps → 앱 설정
2. 필수 권한 확인 및 재설정
3. 새 Access Token 발급

### 3. 크롤링 데이터 없음

**증상**: 크롤링 완료 후 데이터셋 비어있음

**원인**:
- 아마존 봇 탐지
- 네트워크 오류
- 잘못된 키워드/ASIN

**해결**:
1. Headful 모드로 브라우저 확인
2. 네트워크 연결 확인
3. 키워드/ASIN 정확성 확인

### 4. 메모리 부족

**증상**: Chromium 실행 중 크래시

**원인**: 메모리 부족

**해결**:
```typescript
// src/crawlee/index.ts
new Configuration({
  memoryMbytes: 4096,  // 메모리 증가
});
```

### 5. 빌드 실패

**증상**: `npm run build:win` 실패

**원인**:
- `browser.zip` 누락
- TypeScript 오류
- 의존성 오류

**해결**:
```bash
# TypeScript 체크
npm run typecheck

# 의존성 재설치
rm -rf node_modules
npm install

# browser.zip 확인
ls resources/browser.zip
```

---

## 환경 변수

### .env

```env
# API 서버 엔드포인트
MAIN_VITE_APIURL=https://api.eduaddition.com

# API 버전
MAIN_VITE_APIVERSION=v1
```

### 자동 설정 환경 변수

```bash
# Playwright
PLAYWRIGHT_DISABLE_MEMORY_SNAPSHOT=1
PLAYWRIGHT_DISABLE_CRASH_REPORTS=1
PLAYWRIGHT_DISABLE_LOGGING=1

# Crawlee Storage
CRAWLEE_STORAGE_DIR=%appdata%/spark/storage

# Node
NODE_OPTIONS=--max-old-space-size=4096
```

---

## API 엔드포인트

### 내부 API (인증 서버)

```
POST /api/v1/auth/signIn
POST /api/v1/auth/signUp
```

### 외부 API (카테고리 매칭)

```
POST https://allmarketing.mycafe24.com/api/getCategoryByAmazon
- amazon_category → shopify_category 매핑
```

### Shopify GraphQL API

주요 Mutation:
```graphql
stagedUploadsCreate
bulkOperationRunMutation
productCreate
productUpdate
productVariantsBulkUpdate
inventoryActivate
inventoryAdjustQuantities
collectionCreate
collectionAddProducts
locationAdd
```

---

## 성능 최적화

### 크롤링 최적화

```typescript
// 동시 실행 제한
maxConcurrency: 1

// 요청 타임아웃
requestHandlerTimeoutSecs: 600

// 재시도 횟수
maxRequestRetries: 3

// 메모리 제한
memoryMbytes: 4096
```

### Shopify 업로드 최적화

```typescript
// 배치 크기
limit: 2500  // 한 번에 2500개씩

// 폴링 간격
setTimeout(100)  // 100ms

// 캐싱
cachedLocations: Location[]
cachedCollections: Map<string, string>
```

---

## 보안 고려사항

### 1. Context Isolation

Preload 스크립트로 Main과 Renderer 격리:

```typescript
// preload/index.ts
contextBridge.exposeInMainWorld('api', {
  auth: { ... },
  crawler: { ... },
  shopify: { ... }
});
```

### 2. Sandbox

```typescript
webPreferences: {
  sandbox: false  // Crawlee 동작 위해 필수
}
```

### 3. 토큰 저장

- Shopify Access Token: electron-store (평문)
- 로컬 파일시스템 권한으로 보호

### 4. Socket.IO 인증

```typescript
socket.auth = { loginId, password };
// 서버에서 중복 로그인 감지
```

---

## 디버깅

### Chrome DevTools

```bash
# 자동으로 DevTools 열기
npm run debug
```

### Electron 로그

```typescript
// electron-log 사용
log.info('message');
log.error('error');

// 로그 위치: %appdata%/spark/logs/
```

### Playwright 디버깅

```typescript
// Headful 모드로 실행
isHeadless: false

// 브라우저 동작 확인
```

---

## 참고 자료

### 공식 문서
- [Electron](https://www.electronjs.org/docs)
- [Crawlee](https://crawlee.dev/)
- [Playwright](https://playwright.dev/)
- [Shopify Admin GraphQL API](https://shopify.dev/docs/api/admin-graphql)
- [Vue 3](https://vuejs.org/)

### 주요 가이드
- [Electron Vite](https://electron-vite.org/)
- [Electron Builder](https://www.electron.build/)
- [Shopify Bulk Operations](https://shopify.dev/docs/api/usage/bulk-operations)

---

**Last Updated**: 2025-01-XX
**Author**: Spharmy Development Team
