# HQMX Backend - Python Flask + yt-dlp

YouTube 및 다양한 SNS 플랫폼에서 고품질 미디어를 다운로드하는 Flask 기반 백엔드 서버

## 기술 스택
- **Python 3.8+**
- **Flask** - 웹 프레임워크
- **yt-dlp** - 미디어 다운로드 엔진
- **Flask-CORS** - CORS 처리
- **APScheduler** - 백그라운드 작업 스케줄링
- **mutagen** - 오디오 메타데이터 처리

## 로컬 개발 환경 설정

### 1. Python 가상환경 생성
```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
```

### 2. 패키지 설치
```bash
pip install -r requirements.txt
```

### 3. 환경변수 설정
```bash
cp .env.example .env
# .env 파일을 필요에 맞게 수정
```

### 4. 서버 실행
```bash
# 개발 모드 (디버그 활성화)
python app.py

# 프로덕션 모드
FLASK_ENV=production python app.py
```

서버는 기본적으로 `http://localhost:5000`에서 실행됩니다.

## API 엔드포인트

### 분석 API
```bash
# YouTube URL 분석
POST /api/analyze
Content-Type: application/json

{
  "url": "https://youtu.be/VIDEO_ID"
}
```

### 다운로드 API
```bash
# 비디오 다운로드
POST /api/download
Content-Type: application/json

{
  "url": "https://youtu.be/VIDEO_ID",
  "quality": "720p",
  "format": "mp4"
}
```

### 상태 확인
```bash
GET /health
```

## EC2 배포

### 필수 조건
- Ubuntu 20.04+ EC2 인스턴스
- Python 3.8+ 설치
- nginx 설치 (프론트엔드 서빙)
- 도메인: https://yt.hqmx.net (메인), https://hqmx.net (레거시)
- IP: 52.55.219.204 (탄력적 IP)

### 자동 배포 (추천)
```bash
# 프로젝트 루트에서 실행
./deploy-backend.sh
```

### 수동 배포
```bash
# 1. 파일 업로드
cd /path/to/hqmx
scp -i hqmx-ec2.pem -r backend ubuntu@34.203.200.77:/home/ubuntu/hqmx/

# 2. 서버 접속 및 설정
ssh -i hqmx-ec2.pem ubuntu@34.203.200.77

# 3. 가상환경 및 패키지 설치
cd /home/ubuntu/hqmx/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 4. 환경변수 설정
cp .env.example .env
nano .env  # 필요한 설정 변경

# 5. systemd 서비스로 실행 (추천)
sudo cp hqmx-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable hqmx-backend
sudo systemctl start hqmx-backend
sudo systemctl status hqmx-backend

# 6. 로그 확인
sudo journalctl -u hqmx-backend -f
```

## 서비스 관리 (EC2)

```bash
# 서비스 시작
sudo systemctl start hqmx-backend

# 서비스 중지
sudo systemctl stop hqmx-backend

# 서비스 재시작
sudo systemctl restart hqmx-backend

# 서비스 상태 확인
sudo systemctl status hqmx-backend

# 로그 확인
sudo journalctl -u hqmx-backend -f --lines 100
```

## 디버깅

### 로컬 디버깅
```bash
# Flask 디버그 모드
FLASK_ENV=development python app.py

# 특정 포트로 실행
FLASK_PORT=8080 python app.py
```

### EC2 디버깅
```bash
# systemd 서비스 로그
sudo journalctl -u hqmx-backend -f

# 수동 실행으로 에러 확인
cd /home/ubuntu/hqmx/backend
source venv/bin/activate
python app.py
```

## 주요 기능

### 지원 플랫폼
- YouTube
- Instagram
- Facebook
- Twitter/X
- TikTok
- 기타 yt-dlp 지원 사이트 (1000+ 사이트)

### 다운로드 옵션
- 비디오 품질: 144p ~ 4K
- 오디오 전용 다운로드 (MP3)
- 포맷: MP4, WebM, MKV, MP3, M4A

### 다국어 지원
- 20개 언어 지원
- frontend/locales/*.json 번역 파일 사용

## 개발 가이드

### 코드 구조
```
backend/
├── app.py              # 메인 Flask 애플리케이션
├── requirements.txt    # Python 패키지 의존성
├── .env.example        # 환경변수 템플릿
├── .gitignore          # Git 제외 파일
└── README.md           # 이 파일
```

### 새 엔드포인트 추가
```python
@app.route('/api/new-endpoint', methods=['POST'])
def new_endpoint():
    lang = get_request_language()
    data = request.json

    try:
        # 비즈니스 로직
        result = process_data(data)
        return jsonify({
            'success': True,
            'data': result
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
```

## 문제 해결

### yt-dlp 업데이트
```bash
pip install --upgrade yt-dlp
```

### 다운로드 실패
- 대부분 yt-dlp 버전 문제 → 업데이트 필요
- 일부 사이트는 주기적으로 차단 → yt-dlp 업데이트로 해결

### CORS 에러
- .env 파일에서 ALLOWED_ORIGINS 확인
- 프론트엔드 도메인이 허용 목록에 있는지 확인

## 성능 최적화

- yt-dlp는 자동으로 최적 다운로드 경로 선택
- 청크 기반 스트리밍으로 메모리 효율적
- 임시 파일은 자동 정리 (APScheduler)

## 라이선스

회사: OROMANO
사업자번호: 116-10-06201
주소: 서울특별시 용산구 원효로 268
