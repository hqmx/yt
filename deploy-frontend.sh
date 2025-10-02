#!/bin/bash

# HQMX 프론트엔드 배포 스크립트
# 사용법: ./deploy-frontend.sh

set -e  # 에러 발생 시 스크립트 중단

echo "🚀 HQMX 프론트엔드 배포 시작..."

# 현재 디렉토리 확인
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR/frontend"

echo "📦 1. 프론트엔드 파일을 /tmp/로 업로드..."
scp -i ../hqmx-ec2.pem index.html style.css script.js i18n.js ubuntu@54.242.63.16:/tmp/

echo "📂 2. 파일을 /var/www/html/로 이동 및 권한 설정..."
ssh -i ../hqmx-ec2.pem ubuntu@54.242.63.16 << 'EOF'
sudo mv /tmp/index.html /var/www/html/
sudo mv /tmp/style.css /var/www/html/
sudo mv /tmp/script.js /var/www/html/
sudo mv /tmp/i18n.js /var/www/html/
sudo chown www-data:www-data /var/www/html/index.html /var/www/html/style.css /var/www/html/script.js /var/www/html/i18n.js
sudo chmod 755 /var/www/html/index.html /var/www/html/style.css /var/www/html/script.js /var/www/html/i18n.js
EOF

echo "✅ 3. 배포 완료!"
echo "📋 배포된 파일 확인:"
ssh -i ../hqmx-ec2.pem ubuntu@54.242.63.16 "ls -lh /var/www/html/*.{html,css,js} | grep -E '(index|style|script|i18n)'"

echo ""
echo "🌐 브라우저에서 확인: https://hqmx.net"
echo "💡 Hard Refresh: Ctrl+Shift+R (Windows/Linux) 또는 Cmd+Shift+R (Mac)"
