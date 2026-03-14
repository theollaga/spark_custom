# Spark - Amazon to Shopify Automation

아마존 상품을 자동으로 크롤링하여 Shopify 스토어에 업로드하는 Electron 기반 데스크톱 애플리케이션입니다.

[![Electron](https://img.shields.io/badge/Electron-28.2.0-47848F?logo=electron)](https://www.electronjs.org/)
[![Vue](https://img.shields.io/badge/Vue-3.4.15-4FC08D?logo=vue.js)](https://vuejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3.3-3178C6?logo=typescript)](https://www.typescriptlang.org/)

## 주요 기능

- ✅ 아마존 상품 자동 크롤링 (Playwright + Crawlee)
- ✅ Shopify 스토어 일괄 업로드 (Bulk Operation)
- ✅ 실시간 크롤링 모니터링
- ✅ 가격 마진 자동 적용
- ✅ 재고 및 위치 관리
- ✅ 컬렉션 자동 생성
- ✅ 자동 업데이트

## 시스템 요구사항

- Windows 10 이상 (Windows 전용)
- 8GB RAM 이상 권장
- 인터넷 연결 필수
- Shopify 파트너 계정 (업로드 기능 사용 시)

## 빠른 시작

### 1. 설치

```bash
# 의존성 설치
npm install

# Playwright 브라우저 설치
npm run install:playwright
```

### 2. 환경 변수 설정

`.env` 파일 생성:

```env
MAIN_VITE_APIVERSION=v1
MAIN_VITE_APIURL=https://api.eduaddition.com
```

### 3. 실행

```bash
# 개발 모드
npm run dev

# 디버그 모드
npm run debug
```

## 사용 방법

### 크롤링

1. 로그인 후 **Task** 페이지로 이동
2. **Task Settings**에서 옵션 설정
3. **Task Actions**에서 키워드 입력 후 **Start Crawling**
4. **Task Monitor**에서 진행 상황 확인

### Shopify 업로드

1. **Settings** 페이지에서 Shopify 정보 입력
   - Store Name
   - Access Token
   - Price Margin
2. **Dataset Manage**에서 상품 선택
3. **Upload to Shopify** 클릭

## Shopify Access Token 발급

1. [Shopify Partners](https://partners.shopify.com/) 접속
2. 개발 스토어 생성
3. **Apps** → **Create app** → **Create app manually**
4. **Admin API integration**에서 권한 설정:
   - `write_products`, `read_products`
   - `write_locations`, `read_locations`
   - `write_inventory`, `read_inventory`
   - `write_orders`, `read_orders`
5. **Access Token** 복사

## 빌드

### 빌드 전 준비

```bash
# 1. Playwright 브라우저 설치
npm run install:playwright

# 2. resources/browser → browser.zip 압축
# 3. resources/browser 폴더 삭제
```

### Windows 빌드

```bash
npm run build:win
```

결과물: `dist/Spark-{version}-setup.exe`

## 주요 명령어

```bash
npm run dev              # 개발 서버
npm run debug            # 디버그 모드
npm run build            # 빌드
npm run build:win        # Windows 배포 빌드
npm run format           # 코드 포맷팅
npm run lint             # ESLint 검사
npm run typecheck        # 타입 체크
```

## 데이터 저장 위치

```
%appdata%/spark/
├── storage/           # 크롤링 데이터
├── browser/           # Chromium 브라우저
├── config.json        # 앱 설정
└── logs/              # 로그 파일
```

## 문제 해결

### Chromium 실행 실패

```bash
npm run install:playwright
```

### Shopify API 오류

- Access Token 권한 확인
- 스토어 연결 상태 확인

### 크롤링 데이터 없음

- Headful 모드로 브라우저 확인
- 네트워크 연결 확인

## 기술 스택

- **Frontend**: Vue 3, TypeScript, Element Plus, Tailwind CSS
- **Backend**: Electron, Node.js, Crawlee, Playwright
- **API**: Shopify Admin GraphQL, Socket.IO

## 개발자 문서

더 자세한 내용은 [개발자 문서](./README_DEV.md)를 참조하세요.

## 라이선스

이 프로젝트는 Spharmy 내부 프로젝트입니다.

---

**Spark v0.2.5** - Built with ❤️ by Spharmy Team
