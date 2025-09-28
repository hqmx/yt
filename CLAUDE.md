# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요
HQMX는 YouTube를 비롯한 다양한 SNS 플랫폼에서 고품질 미디어를 다운로드할 수 있는 통합 플랫폼입니다. yt-dlp를 사용하지 않고 자체 개발된 안정적이고 빠른 다운로드 시스템을 구축하였습니다.

## 아키텍처 구조

### 백엔드 (Node.js + Express)
- **메인 서버**: `backend/src/app.js` - PM2로 EC2에서 운영 중
- **API 계층**:
  - v1: `/api/youtube/analyze` (기본 YouTube 분석)
  - v2-v3: 추가 분석 방법들
  - v4: 다중 프록시 통합 + **경쟁사 서비스 통합**
- **서비스 계층**:
  - `proxyPoolManager.js`: 8개 프록시 풀 관리 (지역별 분산)
  - `competitorIntegrationService.js`: SaveFrom, Y2mate, SSYouTube 통합
  - `youtubeBrowserService.js`: Playwright 기반 브라우저 자동화
  - `parallelDownloader.js`: 청크 기반 병렬 다운로드

### 프론트엔드 (바닐라 JS)
- **메인 페이지**: `frontend/index.html` - 다국어 지원 (20개 언어)
- **스타일링**: 반응형 디자인, 다크모드 지원
- **국제화**: `frontend/i18n.js` - Google Translate API 연동

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
- **포트**: 3001
- **도메인**: https://hqmx.net
- **프로세스**: PM2로 관리

## 개발 명령어

### 백엔드 개발
```bash
cd backend
npm install
npm run dev        # nodemon으로 개발 서버 시작
npm start          # 프로덕션 서버 시작
npm run deploy     # PM2 배포
npm test           # Jest 테스트 실행
```

### 프론트엔드 개발
```bash
cd frontend
npm install
npm run sync:translations  # 번역 동기화
```

### EC2 배포
```bash
# 로컬에서 테스트 성공 후
scp -i hqmx-ec2.pem -r backend ubuntu@54.242.63.16:/home/ubuntu/hqmx/
ssh -i hqmx-ec2.pem ubuntu@54.242.63.16
cd /home/ubuntu/hqmx/backend
pm2 restart ecosystem.config.js
```

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

## 테스트 URL
**기본 테스트**: https://youtu.be/yjWnTxHMbhI (Summer Sun - Common Saints)

## 중요 파일들

### 설정 파일
- `backend/src/config/index.js`: 서버 설정 및 프록시 구성
- `backend/.env`: 환경변수 (Smartproxy 인증정보)
- `hqmx-ec2.pem`: EC2 SSH 키

### 서비스 핵심 파일
- `backend/src/services/competitorIntegrationService.js`: 경쟁사 통합 시스템
- `backend/src/services/proxyPoolManager.js`: 프록시 풀 관리
- `backend/src/routes/youtube-v4.js`: 최신 API 엔드포인트

### 프론트엔드 핵심 파일
- `frontend/script.js`: 메인 UI 로직
- `frontend/i18n.js`: 다국어 지원
- `frontend/js/userProfileCollector.js`: 사용자 프로파일링

## 회사 정보 (푸터 표시)
- Company: OROMANO
- Business Number: 116-10-06201
- Address: 268, Wonhyo-ro, Yongsan-gu, Seoul, Republic of Korea