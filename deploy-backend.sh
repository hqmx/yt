#!/bin/bash

# HQMX Backend Deployment Script
# Python Flask + yt-dlp 백엔드를 EC2에 배포합니다.

set -e  # 에러 발생 시 중단

# 설정
EC2_IP="52.55.219.204"
EC2_USER="ubuntu"
SSH_KEY="hqmx-ec2.pem"
REMOTE_DIR="/home/ubuntu/hqmx/backend"

echo "======================================"
echo "HQMX Backend Deployment Starting..."
echo "======================================"

# 1. SSH 키 권한 확인
if [ ! -f "$SSH_KEY" ]; then
    echo "❌ Error: SSH key '$SSH_KEY' not found!"
    exit 1
fi

chmod 400 "$SSH_KEY"

# 2. backend 디렉토리 존재 확인
if [ ! -d "backend" ]; then
    echo "❌ Error: backend/ directory not found!"
    exit 1
fi

echo ""
echo "📦 Step 1: Uploading backend files to /tmp..."
scp -i "$SSH_KEY" -r backend/*.py backend/requirements.txt backend/.env.example backend/.gitignore backend/README.md backend/hqmx-backend.service "$EC2_USER@$EC2_IP:/tmp/" || {
    echo "❌ File upload failed!"
    exit 1
}

echo ""
echo "🔧 Step 2: Setting up backend on EC2..."
ssh -i "$SSH_KEY" "$EC2_USER@$EC2_IP" << 'ENDSSH'
set -e

# backend 디렉토리 생성 (없으면)
mkdir -p /home/ubuntu/hqmx/backend

# 파일 이동
mv /tmp/*.py /home/ubuntu/hqmx/backend/ 2>/dev/null || true
mv /tmp/requirements.txt /home/ubuntu/hqmx/backend/ 2>/dev/null || true
mv /tmp/.env.example /home/ubuntu/hqmx/backend/ 2>/dev/null || true
mv /tmp/.gitignore /home/ubuntu/hqmx/backend/ 2>/dev/null || true
mv /tmp/README.md /home/ubuntu/hqmx/backend/ 2>/dev/null || true

# systemd 서비스 파일 설치
sudo mv /tmp/hqmx-backend.service /etc/systemd/system/ 2>/dev/null || true

cd /home/ubuntu/hqmx/backend

# Python3 설치 확인
if ! command -v python3 &> /dev/null; then
    echo "Installing Python3..."
    sudo apt update
    sudo apt install -y python3 python3-pip python3-venv
fi

# 가상환경 생성 (없으면)
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# 패키지 설치/업데이트
echo "Installing Python packages..."
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# .env 파일 생성 (없으면)
if [ ! -f ".env" ]; then
    echo "Creating .env file..."
    cp .env.example .env
fi

# systemd 서비스 활성화
echo "Configuring systemd service..."
sudo systemctl daemon-reload
sudo systemctl enable hqmx-backend
sudo systemctl restart hqmx-backend

echo "✅ Backend setup complete!"
ENDSSH

echo ""
echo "🔍 Step 3: Checking service status..."
ssh -i "$SSH_KEY" "$EC2_USER@$EC2_IP" "sudo systemctl status hqmx-backend --no-pager -l" || true

echo ""
echo "======================================"
echo "✅ Deployment Complete!"
echo "======================================"
echo ""
echo "Backend is running at: http://$EC2_IP:5000"
echo ""
echo "Useful commands:"
echo "  Check status:  ssh -i $SSH_KEY $EC2_USER@$EC2_IP 'sudo systemctl status hqmx-backend'"
echo "  View logs:     ssh -i $SSH_KEY $EC2_USER@$EC2_IP 'sudo journalctl -u hqmx-backend -f'"
echo "  Restart:       ssh -i $SSH_KEY $EC2_USER@$EC2_IP 'sudo systemctl restart hqmx-backend'"
echo ""
