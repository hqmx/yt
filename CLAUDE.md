# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요
HQMX는 YouTube를 비롯한 다양한 SNS 플랫폼(Instagram, Facebook, TikTok, Twitter 등 1000+ 사이트)에서 고품질 미디어를 다운로드할 수 있는 통합 플랫폼입니다. **yt-dlp**를 핵심 엔진으로 사용하여 안정적이고 빠른 다운로드 시스템을 구축하였습니다.

## 아키텍처 구조

### 백엔드 (Python Flask + yt-dlp)
- **메인 서버**: [backend/app.py](backend/app.py) - systemd 서비스로 EC2에서 운영
  - **프레임워크**: Flask (Python 3.8+)
  - **다운로드 엔진**: yt-dlp (1000+ 사이트 지원)
  - **보안**: Flask-CORS, 환경변수 기반 설정
  - **백그라운드 작업**: APScheduler (임시 파일 정리)
  - **메타데이터 처리**: mutagen (오디오 태그 편집)

- **핵심 기능**:
  - `/api/analyze` - YouTube 및 SNS URL 메타데이터 분석
  - `/api/download` - 다운로드 및 스트리밍
  - `/health` - 서버 상태 체크
  - **다국어 지원**: frontend/locales/*.json 기반 20개 언어

- **yt-dlp 특징**:
  - YouTube, Instagram, Facebook, TikTok, Twitter 등 1000+ 사이트 지원
  - 자동 포맷 선택 및 최적화
  - 청크 기반 다운로드로 메모리 효율적
  - 주기적 업데이트로 사이트 변경사항 대응

### 프론트엔드 (바닐라 JS)
- **메인 페이지**: [frontend/index.html](frontend/index.html) - 다국어 지원 (20개 언어)
- **핵심 스크립트**:
  - [script.js](frontend/script.js): 메인 UI 로직, API 통신
  - [i18n.js](frontend/i18n.js): Google Translate API 연동, 다국어 처리
  - [userProfileCollector.js](frontend/js/userProfileCollector.js): 사용자 프로파일링
- **스타일링**: [style.css](frontend/style.css) - 반응형 디자인, 다크모드 지원

## 필수 설정

### EC2 배포 정보
- **IP**: 52.55.219.204 (탄력적 IP)
- **도메인**: https://hqmx.net
- **SSH 키**: hqmx-ec2.pem

#### 백엔드 설정 (Python Flask)
- **포트**: 5000
- **배포 경로**: /home/ubuntu/hqmx/backend/
- **프로세스 관리**: systemd (hqmx-backend.service)
- **실행 명령**: `sudo systemctl restart hqmx-backend`
- **로그 확인**: `sudo journalctl -u hqmx-backend -f`

#### 프론트엔드 설정 (⚠️ 중요)
- **웹 서버**: Nginx
- **배포 경로**: /var/www/html/ (Nginx DocumentRoot)
- **소유자**: www-data
- **⚠️ 주의**: /home/ubuntu/hqmx/frontend/가 아님!

## 개발 명령어

### 백엔드 개발 (Python Flask)
```bash
cd backend

# 1. 가상환경 생성
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 2. 패키지 설치
pip install -r requirements.txt

# 3. 환경변수 설정 (선택사항)
cp .env.example .env
# .env 파일에서 필요한 설정값들을 확인하고 수정

# 4. 서버 실행
python app.py  # http://localhost:5000

# 개발 모드 (디버그 활성화)
FLASK_ENV=development python app.py
```

### 프론트엔드 개발
```bash
cd frontend
npm install
npm run sync:translations  # Google Translate API로 다국어 번역 동기화

# 프론트엔드 로컬 테스트 (백엔드 연동)
# VSCode: Live Server 확장 사용
# 또는 Python: python3 -m http.server 8000
# 또는 Node.js: npx http-server -p 8000
```

### 로컬 전체 시스템 테스트
```bash
# 터미널 1: 백엔드 시작
cd backend
source venv/bin/activate
python app.py  # http://localhost:5000

# 터미널 2: 프론트엔드 HTTP 서버
cd frontend
python3 -m http.server 8000  # http://localhost:8000

# 테스트 URL: http://localhost:8000
# API 엔드포인트: http://localhost:5000/api/analyze
```

### EC2 배포

#### 백엔드 배포 (systemd) ⭐ 자동화 추천
```bash
# 옵션 1: 자동 배포 스크립트 (추천)
cd /Users/wonjunjang/hqmx
./deploy-backend.sh

# 옵션 2: 수동 배포
# 1. 백엔드 파일 업로드
scp -i hqmx-ec2.pem -r backend/*.py backend/requirements.txt backend/*.service ubuntu@52.55.219.204:/tmp/

# 2. SSH 접속 및 설정
ssh -i hqmx-ec2.pem ubuntu@52.55.219.204
cd /home/ubuntu/hqmx/backend

# 3. 가상환경 및 패키지 설치
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 4. systemd 서비스 활성화
sudo cp hqmx-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable hqmx-backend
sudo systemctl restart hqmx-backend

# 5. 상태 확인
sudo systemctl status hqmx-backend
sudo journalctl -u hqmx-backend -f
```

#### 프론트엔드 배포 (Nginx) ⚠️ 핵심!
```bash
# 1. 프론트엔드 파일을 Nginx DocumentRoot로 직접 업로드
cd /Users/wonjunjang/hqmx/frontend
scp -i ../hqmx-ec2.pem index.html style.css script.js i18n.js ubuntu@52.55.219.204:/tmp/

# 2. 서버에서 올바른 위치로 이동 (sudo 필요)
ssh -i ../hqmx-ec2.pem ubuntu@52.55.219.204 << 'EOF'
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
scp -i ../hqmx-ec2.pem -r assets ubuntu@52.55.219.204:/tmp/
ssh -i ../hqmx-ec2.pem ubuntu@52.55.219.204 << 'EOF'
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

### 1. yt-dlp 기반 다운로드 시스템
**yt-dlp**를 사용하여 1000+ 사이트 지원:
- **YouTube**: 모든 품질 옵션, 자막, 플레이리스트
- **Instagram**: 게시물, 스토리, 릴스
- **Facebook**: 비디오, 스토리
- **TikTok**: 워터마크 제거 옵션
- **Twitter/X**: 비디오, GIF
- 기타 1000+ 사이트 자동 지원

### 2. 스트리밍 및 메모리 최적화
```python
# 청크 기반 스트리밍으로 메모리 효율성
def generate():
    with open(file_path, 'rb') as f:
        while True:
            chunk = f.read(1024 * 1024)  # 1MB
            if not chunk:
                break
            yield chunk
```

### 3. 성능 특징
- **분석 시간**: yt-dlp의 빠른 메타데이터 추출
- **다운로드**: 청크 기반 스트리밍으로 메모리 효율적
- **임시 파일 관리**: APScheduler로 자동 정리
- **다국어 지원**: 20개 언어, frontend/locales/*.json

## API 엔드포인트 가이드

### 분석 API
```bash
# YouTube/SNS URL 분석 (메타데이터 추출)
curl -X POST http://52.55.219.204:5000/api/analyze \
  -H "Content-Type: application/json" \
  -H "Accept-Language: ko" \
  -d '{"url": "https://youtu.be/yjWnTxHMbhI"}'

# 응답 예시
{
  "success": true,
  "title": "Video Title",
  "thumbnail": "https://...",
  "duration": "3:45",
  "formats": [
    {"quality": "1080p", "format": "mp4", "filesize": 12345678},
    {"quality": "720p", "format": "mp4", "filesize": 8765432}
  ]
}
```

### 다운로드 API
```bash
# 비디오 다운로드
curl -X POST http://52.55.219.204:5000/api/download \
  -H "Content-Type: application/json" \
  -d '{"url": "https://youtu.be/yjWnTxHMbhI", "quality": "720p", "format": "mp4"}' \
  -O video.mp4

# 오디오 전용 다운로드 (MP3)
curl -X POST http://52.55.219.204:5000/api/download \
  -H "Content-Type: application/json" \
  -d '{"url": "https://youtu.be/yjWnTxHMbhI", "format": "mp3"}' \
  -O audio.mp3
```

### 시스템 상태 API
```bash
# 헬스체크
curl http://52.55.219.204:5000/health

# 응답 예시
{
  "status": "healthy",
  "timestamp": "2025-10-08T10:00:00Z"
}
```

## 프로젝트 상태

### 시스템 특징
- ✅ **yt-dlp 기반**: 1000+ 사이트 자동 지원
- ✅ **메타데이터 분석**: 빠르고 정확한 정보 추출
- ✅ **스트리밍 다운로드**: 청크 기반 메모리 효율적 처리
- ✅ **다국어 지원**: 20개 언어 완벽 지원
- ✅ **자동 정리**: APScheduler로 임시 파일 관리

### 주요 장점
- **단순성**: Python Flask + yt-dlp로 복잡도 최소화
- **안정성**: yt-dlp의 검증된 다운로드 엔진
- **확장성**: yt-dlp 업데이트로 새 사이트 자동 지원
- **유지보수성**: 적은 의존성, 명확한 구조

## 디버깅 및 트러블슈팅

### 로컬 디버깅
```bash
# 1. 백엔드 로그 확인 (디버그 모드)
cd backend
source venv/bin/activate
FLASK_ENV=development python app.py

# 2. API 엔드포인트 직접 테스트
curl -X POST http://localhost:5000/api/analyze \
  -H "Content-Type: application/json" \
  -H "Accept-Language: ko" \
  -d '{"url": "https://youtu.be/yjWnTxHMbhI"}'

# 3. yt-dlp 직접 테스트
yt-dlp --list-formats "https://youtu.be/yjWnTxHMbhI"
yt-dlp -f best "https://youtu.be/yjWnTxHMbhI"

# 4. yt-dlp 업데이트 (다운로드 실패 시)
pip install --upgrade yt-dlp
```

### EC2 운영 디버깅
```bash
# SSH 접속
ssh -i hqmx-ec2.pem ubuntu@52.55.219.204

# systemd 서비스 상태 확인
sudo systemctl status hqmx-backend

# 실시간 로그 확인
sudo journalctl -u hqmx-backend -f

# 최근 로그 확인
sudo journalctl -u hqmx-backend --lines 100

# 에러 로그만 확인
sudo journalctl -u hqmx-backend -p err

# 서비스 재시작
sudo systemctl restart hqmx-backend

# 수동 실행으로 에러 확인
cd /home/ubuntu/hqmx/backend
source venv/bin/activate
python app.py
```

### 일반적인 문제 해결

#### 문제: 다운로드 실패 또는 "ERROR: unable to download"
```bash
# 해결 1: yt-dlp 업데이트 (가장 흔한 원인)
pip install --upgrade yt-dlp

# 해결 2: yt-dlp 직접 테스트
yt-dlp "https://youtu.be/VIDEO_ID"

# 해결 3: 사이트별 이슈 확인
# yt-dlp GitHub Issues: https://github.com/yt-dlp/yt-dlp/issues
```

#### 문제: 특정 URL이 분석 안됨
```bash
# 해결 1: URL 포맷 확인
# 지원 포맷: https://youtu.be/ID, https://www.youtube.com/watch?v=ID

# 해결 2: yt-dlp로 직접 확인
yt-dlp --list-formats "URL"

# 해결 3: 로그 확인
sudo journalctl -u hqmx-backend -f
```

#### 문제: 프론트엔드에서 API 호출 CORS 에러
```bash
# backend/.env 확인 (필요시)
ALLOWED_ORIGINS=http://localhost:3000,https://hqmx.net,http://localhost:8000

# Flask-CORS가 기본적으로 모든 origin 허용하도록 설정됨
# app.py에서 CORS(app, expose_headers=['Content-Disposition'])
```

#### 문제: "No module named 'yt_dlp'" 에러
```bash
# 가상환경 활성화 확인
source venv/bin/activate

# 패키지 재설치
pip install -r requirements.txt
```

## 테스트 URL
**기본 테스트**: https://youtu.be/yjWnTxHMbhI (Summer Sun - Common Saints)

## ⚠️ 배포 시 주의사항

### 잘못된 배포 경로 (흔한 실수)
❌ **절대 하지 말 것**:
```bash
# 이렇게 하면 웹사이트에 반영 안됨!
scp -i hqmx-ec2.pem frontend/*.{html,css,js} ubuntu@52.55.219.204:/home/ubuntu/hqmx/frontend/
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

### 백엔드 핵심 파일
- `backend/app.py`: Flask 메인 애플리케이션 (447줄)
- `backend/requirements.txt`: Python 패키지 의존성
- `backend/.env.example`: 환경변수 템플릿
- `backend/.gitignore`: Git 제외 파일
- `backend/hqmx-backend.service`: systemd 서비스 파일
- `backend/README.md`: 백엔드 개발/배포 가이드

### 배포 스크립트
- `deploy-backend.sh`: 백엔드 자동 배포 (Python Flask)
- `deploy-frontend.sh`: 프론트엔드 자동 배포 (Nginx)
- `hqmx-ec2.pem`: EC2 SSH 키

### 프론트엔드 핵심 파일
- `frontend/index.html`: 메인 페이지
- `frontend/script.js`: 메인 UI 로직, API 통신
- `frontend/i18n.js`: 다국어 지원
- `frontend/style.css`: 반응형 디자인, 다크모드
- `frontend/locales/*.json`: 20개 언어 번역 파일
- `frontend/js/userProfileCollector.js`: 사용자 프로파일링

## 에러 핸들링 패턴

### 백엔드 에러 응답 형식
```json
{
  "success": false,
  "error": "다국어 지원 에러 메시지",
  "details": "상세 에러 정보 (디버그용)"
}
```

### 주요 에러 타입
- **yt-dlp 다운로드 에러**: URL 분석 실패, 사이트 변경사항
- **파일 시스템 에러**: 임시 디렉토리 권한, 디스크 공간
- **네트워크 에러**: 타임아웃, 연결 실패
- **입력 검증 에러**: 잘못된 URL 포맷

## 기술 스택

### 백엔드
- **런타임**: Python 3.8+
- **웹 프레임워크**: Flask
- **다운로드 엔진**: yt-dlp
- **CORS**: Flask-CORS
- **스케줄러**: APScheduler
- **메타데이터**: mutagen
- **배포**: systemd + EC2

### 프론트엔드
- **순수 바닐라 JavaScript** (프레임워크 없음)
- **스타일**: CSS3 (반응형, 다크모드)
- **다국어**: frontend/locales/*.json
- **배포**: Nginx

## 성능 특성
- **분석 속도**: yt-dlp의 빠른 메타데이터 추출
- **메모리 효율**: 청크 기반 스트리밍 (1MB)
- **임시 파일**: APScheduler로 자동 정리
- **확장성**: yt-dlp 업데이트로 새 사이트 자동 지원

## 회사 정보 (푸터 표시)
- Company: OROMANO
- Business Number: 116-10-06201
- Address: 268, Wonhyo-ro, Yongsan-gu, Seoul, Republic of Korea