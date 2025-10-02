# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요
HQMX는 YouTube를 비롯한 다양한 SNS 플랫폼에서 고품질 미디어를 다운로드할 수 있는 통합 플랫폼입니다. yt-dlp를 사용하지 않고 자체 개발된 안정적이고 빠른 다운로드 시스템을 구축하였습니다.

## 아키텍처 구조

### 백엔드 (Node.js + Express)
- **메인 서버**: [backend/src/app.js](backend/src/app.js) - PM2로 EC2에서 운영 중
  - 보안: Helmet, CORS, Rate Limiting
  - 에러 핸들링: 전역 에러 핸들러, 타입별 처리 (ValidationError, UnauthorizedError)
  - 우아한 종료: SIGTERM/SIGINT 처리, 서비스 정리

- **API 계층** (라우트):
  - v1: `/api/youtube/*` - 기본 YouTube 분석
  - v2-v3: 추가 분석 방법들
  - v4: `/api/youtube/v4/*` - **현재 운영 버전** (다중 프록시 + 경쟁사 통합)

- **서비스 계층** (핵심 비즈니스 로직):
  - [proxyPoolManager.js](backend/src/services/proxyPoolManager.js): 8개 프록시 풀 관리 (지역별 분산)
  - [competitorIntegrationService.js](backend/src/services/competitorIntegrationService.js): 경쟁사 서비스 통합 오케스트레이터
  - [youtubeBrowserService.js](backend/src/services/youtubeBrowserService.js): Playwright 기반 브라우저 자동화
  - [parallelDownloader.js](backend/src/services/parallelDownloader.js): 청크 기반 병렬 다운로드

- **추출기 계층** (Extractor Pattern):
  - [saveFromExtractor.js](backend/src/services/extractors/saveFromExtractor.js): SaveFrom.net (2단계 Google Video URL 추출)
  - [ssyoutubeExtractor.js](backend/src/services/extractors/ssyoutubeExtractor.js): SSYouTube.com (HTML 파싱)
  - [playwrightExtractor.js](backend/src/services/extractors/playwrightExtractor.js): Playwright 기반 (Y2mate 자동화)
  - [youtube4kdownloaderExtractor.js](backend/src/services/extractors/youtube4kdownloaderExtractor.js): 4K Downloader 서비스
  - [curlExtractor.js](backend/src/services/extractors/curlExtractor.js): cURL 기반 추출
  - **패턴**: 모든 추출기는 동일한 인터페이스 구현 (`extract(videoUrl, quality)`)

### 서비스 의존성 그래프
```
competitorIntegrationService
├── extractors/* (5개 추출기)
├── proxyPoolManager (프록시 선택)
└── parallelDownloader (청크 다운로드)

youtubeBrowserService
└── proxyPoolManager

routes/youtube-v4.js
└── competitorIntegrationService
```

### 프론트엔드 (바닐라 JS)
- **메인 페이지**: [frontend/index.html](frontend/index.html) - 다국어 지원 (20개 언어)
- **핵심 스크립트**:
  - [script.js](frontend/script.js): 메인 UI 로직, API 통신
  - [i18n.js](frontend/i18n.js): Google Translate API 연동, 다국어 처리
  - [userProfileCollector.js](frontend/js/userProfileCollector.js): 사용자 프로파일링
- **스타일링**: [style.css](frontend/style.css) - 반응형 디자인, 다크모드 지원

## 필수 설정 (절대 변경 금지)

### Smartproxy 설정
```env
PROXY_HOST=proxy.smartproxy.net
PROXY_PORT=3120
PROXY_USERNAME=smart-hqmx0000
PROXY_PASSWORD=Straight8
```

### EC2 배포 정보
- **IP**: 54.242.63.16
- **도메인**: https://hqmx.net
- **SSH 키**: hqmx-ec2.pem

#### 백엔드 설정
- **포트**: 3001
- **배포 경로**: /home/ubuntu/hqmx/backend/
- **프로세스 관리**: PM2
- **실행 명령**: `pm2 restart all`

#### 프론트엔드 설정 (⚠️ 중요)
- **웹 서버**: Nginx
- **배포 경로**: /var/www/html/ (Nginx DocumentRoot)
- **소유자**: www-data
- **⚠️ 주의**: /home/ubuntu/hqmx/frontend/가 아님!

## 개발 명령어

### 환경 설정
```bash
# 백엔드 환경변수 설정 (필수)
cp backend/.env.example backend/.env
# .env 파일에서 필요한 설정값들을 확인하고 수정
```

### 백엔드 개발
```bash
cd backend
npm install
npm run dev        # nodemon으로 개발 서버 시작
npm start          # 프로덕션 서버 시작
npm test           # Jest 테스트 실행 (현재 테스트 파일 없음)
```

### PM2 배포 (주의: ecosystem.config.js 파일 필요)
```bash
npm run deploy     # PM2 배포 (설정 파일 확인 필요)
```

### 프론트엔드 개발
```bash
cd frontend
npm install
npm run sync:translations  # Google Translate API로 다국어 번역 동기화

# 프론트엔드 로컬 테스트 (백엔드 연동)
# 1. 백엔드 서버 시작 (별도 터미널)
cd backend && npm run dev

# 2. 프론트엔드 제공 (Live Server 또는 간단한 HTTP 서버)
# VSCode: Live Server 확장 사용
# 또는 Python: python3 -m http.server 8000
# 또는 Node.js: npx http-server -p 8000

# 3. 브라우저에서 http://localhost:8000 접속
```

### 로컬 전체 시스템 테스트
```bash
# 터미널 1: 백엔드 시작
cd backend
npm run dev

# 터미널 2: 프론트엔드 HTTP 서버
cd frontend
npx http-server -p 8000

# 테스트 URL: http://localhost:8000
# API 엔드포인트: http://localhost:3001/api/youtube/v4/analyze
```

### EC2 배포

#### 백엔드 배포 (PM2)
```bash
# 1. 백엔드 파일 업로드
cd /Users/wonjunjang/hqmx
scp -i hqmx-ec2.pem -r backend/src backend/package.json backend/.env ubuntu@54.242.63.16:/home/ubuntu/hqmx/backend/

# 2. SSH 접속 및 재시작
ssh -i hqmx-ec2.pem ubuntu@54.242.63.16
cd /home/ubuntu/hqmx/backend
npm install  # 새 패키지가 있는 경우만
pm2 restart all
pm2 status
pm2 logs --lines 50
```

#### 프론트엔드 배포 (Nginx) ⚠️ 핵심!
```bash
# 1. 프론트엔드 파일을 Nginx DocumentRoot로 직접 업로드
cd /Users/wonjunjang/hqmx/frontend
scp -i ../hqmx-ec2.pem index.html style.css script.js i18n.js ubuntu@54.242.63.16:/tmp/

# 2. 서버에서 올바른 위치로 이동 (sudo 필요)
ssh -i ../hqmx-ec2.pem ubuntu@54.242.63.16 << 'EOF'
sudo mv /tmp/index.html /var/www/html/
sudo mv /tmp/style.css /var/www/html/
sudo mv /tmp/script.js /var/www/html/
sudo mv /tmp/i18n.js /var/www/html/
sudo chown www-data:www-data /var/www/html/*.html /var/www/html/*.css /var/www/html/*.js
sudo chmod 755 /var/www/html/*.html /var/www/html/*.css /var/www/html/*.js
EOF

# 3. 브라우저에서 Hard Refresh (Ctrl+Shift+R 또는 Cmd+Shift+R)
```

#### assets 폴더 업데이트 (이미지/아이콘 변경 시)
```bash
cd /Users/wonjunjang/hqmx/frontend
scp -i ../hqmx-ec2.pem -r assets ubuntu@54.242.63.16:/tmp/
ssh -i ../hqmx-ec2.pem ubuntu@54.242.63.16 << 'EOF'
sudo rm -rf /var/www/html/assets
sudo mv /tmp/assets /var/www/html/
sudo chown -R www-data:www-data /var/www/html/assets
sudo chmod -R 755 /var/www/html/assets
EOF
```

#### 빠른 배포 (자동화 스크립트) ⭐ 추천
```bash
# 프로젝트 루트에서 실행
cd /Users/wonjunjang/hqmx
./deploy-frontend.sh

# 또는 직접 실행
bash deploy-frontend.sh
```

**deploy-frontend.sh**가 자동으로:
1. 프론트엔드 파일을 /tmp/로 업로드
2. /var/www/html/로 이동
3. www-data 권한 설정
4. 배포 결과 확인

## 핵심 기술적 접근법

### 1. 하이브리드 다운로드 시스템
YouTube 직접 접근이 차단되므로 경쟁사 서비스를 활용:
- **SaveFrom.net**: 2단계 프로세스로 Google Video URL 추출
- **Y2mate.com**: Playwright 자동화로 실제 파일 다운로드
- **SSYouTube.com**: HTML 파싱으로 다운로드 URL 추출
- **Promise.race()**: 가장 빠른 응답 서비스 자동 선택

### 2. 프록시 시스템
```javascript
// 8개 프록시 풀 관리
const proxyPool = {
  basic: 3개 로테이팅 프록시,
  regional: 5개 지역별 프록시 (US, DE, GB, JP, SG)
};
```

### 3. 성능 최적화
- **분석 시간**: 10초 이내 (요구사항)
- **다운로드 시작**: 30초 이내 (요구사항)
- **병렬 다운로드**: 청크 기반 (1MB 단위)
- **실시간 진행률**: WebSocket 기반

## API 엔드포인트 가이드

### 분석 API
```bash
# YouTube URL 분석
curl -X POST http://54.242.63.16:3001/api/youtube/v4/analyze \
  -H "Content-Type: application/json" \
  -d '{"url": "https://youtu.be/yjWnTxHMbhI"}'

# 경쟁사 서비스 통한 URL 추출
curl -X POST http://54.242.63.16:3001/api/youtube/v4/extract-via-competitors \
  -H "Content-Type: application/json" \
  -d '{"url": "https://youtu.be/yjWnTxHMbhI"}'
```

### 다운로드 API
```bash
# 전체 다운로드 프로세스
curl -X POST http://54.242.63.16:3001/api/youtube/v4/download-via-competitors \
  -H "Content-Type: application/json" \
  -d '{"url": "https://youtu.be/yjWnTxHMbhI", "quality": "720p", "format": "mp4"}'
```

### 시스템 상태 API
```bash
# 프록시 상태 체크
curl http://54.242.63.16:3001/api/youtube/v4/proxy-status

# 경쟁사 서비스 상태
curl http://54.242.63.16:3001/api/youtube/v4/competitors-status

# 헬스체크
curl http://54.242.63.16:3001/health
```

## 현재 이슈 및 해결 방안

### 주요 이슈: EC2 프록시 라이브러리 호환성
**문제**: Node.js `https-proxy-agent`와 Smartproxy 간 헤더 파싱 오류
**상태**: 로컬에서는 완벽 작동, EC2에서만 발생
**해결 우선순위**:
1. `https-proxy-agent` → `socks-proxy-agent` 교체
2. 커스텀 HTTP 터널링 구현
3. Playwright 완전 전환 시스템

### 성공 지표
- ✅ YouTube 메타데이터 분석 100% 성공
- ✅ 경쟁사 통합 시스템 구현 완료
- ✅ 로컬 환경에서 1.7MB 실제 파일 다운로드 검증
- ⚠️ EC2 환경 프록시 이슈 해결 필요

## 디버깅 및 트러블슈팅

### 로컬 디버깅
```bash
# 1. 백엔드 로그 확인
cd backend
npm run dev  # nodemon이 자동으로 변경 감지 및 재시작

# 2. 프록시 연결 테스트
curl http://localhost:3001/api/youtube/v4/proxy-status

# 3. 특정 추출기 단독 테스트
# backend/src/services/extractors/ 파일에서 각 extractor의 extract() 함수 호출

# 4. API 엔드포인트 직접 테스트
curl -X POST http://localhost:3001/api/youtube/v4/analyze \
  -H "Content-Type: application/json" \
  -d '{"url": "https://youtu.be/yjWnTxHMbhI"}'
```

### EC2 운영 디버깅
```bash
# SSH 접속
ssh -i hqmx-ec2.pem ubuntu@54.242.63.16

# PM2 상태 확인
pm2 status
pm2 logs           # 전체 로그
pm2 logs --lines 100  # 최근 100줄
pm2 logs --err     # 에러 로그만

# 프로세스 재시작 (문제 발생 시)
pm2 restart all
pm2 restart hqmx-backend  # 특정 프로세스만

# 메모리/CPU 모니터링
pm2 monit

# 프로세스 완전 재시작 (메모리 누수 의심 시)
pm2 stop all
pm2 delete all
pm2 start ecosystem.config.js
```

### 일반적인 문제 해결

#### 문제: "PROXY_ERROR" 또는 프록시 연결 실패
```bash
# 해결 1: .env 파일 확인
cat backend/.env  # Smartproxy 인증 정보 확인

# 해결 2: 프록시 상태 API 호출
curl http://54.242.63.16:3001/api/youtube/v4/proxy-status

# 해결 3: 다른 추출기 시도 (Promise.race가 자동으로 처리)
# 로그에서 어떤 extractor가 성공했는지 확인
```

#### 문제: 특정 YouTube URL이 분석 안됨
```bash
# 해결 1: 다른 테스트 URL 시도
curl -X POST http://localhost:3001/api/youtube/v4/analyze \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=VIDEO_ID"}'

# 해결 2: 경쟁사 서비스 상태 확인
curl http://54.242.63.16:3001/api/youtube/v4/competitors-status

# 해결 3: Playwright 브라우저 확인 (EC2)
# Playwright가 headless 모드로 실행되는지 확인
```

#### 문제: 프론트엔드에서 API 호출 CORS 에러
```bash
# backend/.env 확인
ALLOWED_ORIGINS=http://localhost:3000,https://hqmx.net,http://localhost:8000

# 로컬 개발 시 http://localhost:8000 추가 필요
```

### 새 추출기(Extractor) 추가 방법
```javascript
// 1. backend/src/services/extractors/newExtractor.js 생성
class NewExtractor {
  async extract(videoUrl, quality = '720p') {
    // 구현
    return {
      success: true,
      downloadUrl: 'https://...',
      quality,
      fileSize: 1234567,
      metadata: { /* ... */ }
    };
  }
}

// 2. competitorIntegrationService.js에 등록
const newExtractor = require('./extractors/newExtractor');
this.extractors = {
  // ...existing
  newService: newExtractor
};

// 3. Promise.race에서 자동으로 경쟁하게 됨
```

## 테스트 URL
**기본 테스트**: https://youtu.be/yjWnTxHMbhI (Summer Sun - Common Saints)

## ⚠️ 배포 시 주의사항

### 잘못된 배포 경로 (흔한 실수)
❌ **절대 하지 말 것**:
```bash
# 이렇게 하면 웹사이트에 반영 안됨!
scp -i hqmx-ec2.pem frontend/*.{html,css,js} ubuntu@54.242.63.16:/home/ubuntu/hqmx/frontend/
```

✅ **올바른 방법**:
```bash
# 옵션 1: 자동화 스크립트 사용 (추천)
./deploy-frontend.sh

# 옵션 2: 수동 배포
# /tmp/ → /var/www/html/ 경로 사용
```

### 배포 체크리스트
- [ ] 프론트엔드: `/var/www/html/`에 배포했는가?
- [ ] 백엔드: `/home/ubuntu/hqmx/backend/`에 배포했는가?
- [ ] PM2 재시작: `pm2 restart all` 실행했는가?
- [ ] 파일 권한: `www-data:www-data` 설정했는가?
- [ ] CSS 캐시 버스팅: `style.css?v=YYYYMMDD` 버전 업데이트했는가?
- [ ] 브라우저: Hard Refresh (Ctrl+Shift+R) 했는가?

## 중요 파일들

### 설정 파일
- `backend/src/config/index.js`: 서버 설정 및 프록시 구성
- `backend/.env`: 환경변수 (Smartproxy 인증정보)
- `backend/.env.example`: 환경변수 템플릿
- `hqmx-ec2.pem`: EC2 SSH 키
- `deploy-frontend.sh`: 프론트엔드 자동 배포 스크립트

### 서비스 핵심 파일
- `backend/src/services/competitorIntegrationService.js`: 경쟁사 통합 시스템
- `backend/src/services/proxyPoolManager.js`: 프록시 풀 관리
- `backend/src/routes/youtube-v4.js`: 최신 API 엔드포인트

### 프론트엔드 핵심 파일
- `frontend/script.js`: 메인 UI 로직
- `frontend/i18n.js`: 다국어 지원
- `frontend/js/userProfileCollector.js`: 사용자 프로파일링

## 에러 핸들링 패턴

### 백엔드 에러 응답 형식
```json
{
  "success": false,
  "error": {
    "message": "사용자 친화적 메시지",
    "code": "ERROR_CODE",
    "details": "개발 환경에서만 표시"
  },
  "timestamp": "2025-10-02T12:00:00.000Z"
}
```

### 지원되는 에러 타입 (app.js 전역 에러 핸들러)
- `ValidationError`: 400 - 입력 데이터 유효하지 않음
- `UnauthorizedError`: 401 - 인증 필요
- `LIMIT_FILE_SIZE`: 413 - 파일 크기 초과
- `INTERNAL_SERVER_ERROR`: 500 - 서버 내부 오류
- `PROXY_ERROR`: 502 - 프록시 연결 실패
- `RATE_LIMIT_EXCEEDED`: 429 - 너무 많은 요청

## 프로젝트 상태
- **개발 환경**: Node.js 20+ + Express (백엔드), 바닐라 JS (프론트엔드)
- **테스트 상태**: Jest 설정됨, 테스트 파일 미작성 (필요 시 `backend/src/__tests__/` 디렉토리 생성)
- **배포 환경**: AWS EC2 (Ubuntu) + PM2
- **주요 종속성**:
  - Playwright (브라우저 자동화)
  - Cheerio (HTML 파싱)
  - Axios (HTTP 클라이언트)
  - https-proxy-agent, socks-proxy-agent (프록시 연동)

## 성능 요구사항
- 분석 응답: 10초 이내
- 다운로드 시작: 30초 이내
- Rate Limit: 100 요청/15분
- 청크 크기: 1MB (병렬 다운로드)

## 회사 정보 (푸터 표시)
- Company: OROMANO
- Business Number: 116-10-06201
- Address: 268, Wonhyo-ro, Yongsan-gu, Seoul, Republic of Korea