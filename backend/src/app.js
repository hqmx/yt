const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const config = require('./config');
const youtubeRoutes = require('./routes/youtube');
const youtubeV2Routes = require('./routes/youtube-v2');
const youtubeV3Routes = require('./routes/youtube-v3');
const youtubeV4Routes = require('./routes/youtube-v4');
const downloadRoutes = require('./routes/download');

// Express 앱 생성
const app = express();

// 기본 미들웨어 설정
app.use(helmet()); // 보안 헤더 설정
app.use(compression()); // 응답 압축

// CORS 설정
app.use(cors({
  origin: config.cors.origins,
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Accept-Language', 'User-Agent'],
  credentials: true
}));

// Body 파서 설정
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 전역 rate limit 설정
const globalRateLimit = rateLimit({
  windowMs: config.api.rateLimit.windowMs,
  max: config.api.rateLimit.max,
  message: {
    success: false,
    error: {
      message: '너무 많은 요청입니다. 잠시 후 다시 시도해주세요.',
      code: 'RATE_LIMIT_EXCEEDED'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // 헬스체크 엔드포인트는 rate limit 제외
    return req.path.includes('/health');
  }
});

app.use(globalRateLimit);

// 요청 로깅 미들웨어
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const ip = req.ip || req.connection.remoteAddress;
  console.log(`${timestamp} - ${req.method} ${req.path} - IP: ${ip}`);
  next();
});

// 라우트 설정
app.use('/api/youtube', youtubeRoutes);
app.use('/api/youtube/v2', youtubeV2Routes);
app.use('/api/youtube/v3', youtubeV3Routes);
app.use('/api/youtube/v4', youtubeV4Routes);
app.use('/api/download', downloadRoutes);

// 프론트엔드 호환성을 위한 추가 라우트
app.use('/api/analyze', (req, res, next) => {
  // /api/analyze를 /api/youtube/analyze로 리다이렉트
  req.url = '/analyze';
  youtubeRoutes(req, res, next);
});

// 프론트엔드에서 사용하는 추가 엔드포인트들
app.use('/api/stream-progress', (req, res, next) => {
  req.url = '/stream-progress' + req.url;
  downloadRoutes(req, res, next);
});

app.use('/api/get-file', (req, res, next) => {
  req.url = '/get-file' + req.url;
  downloadRoutes(req, res, next);
});

app.use('/api/check-status', (req, res, next) => {
  req.url = '/check-status' + req.url;
  downloadRoutes(req, res, next);
});

// 기본 헬스체크 엔드포인트
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'HQMX Backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
    proxy: {
      host: config.proxy.host,
      port: config.proxy.port,
      username: config.proxy.username
    },
    uptime: process.uptime()
  });
});

// 기본 라우트
app.get('/', (req, res) => {
  res.json({
    message: 'HQMX Backend API',
    version: '1.0.0',
    description: '고품질 미디어 다운로드 플랫폼 백엔드',
    endpoints: {
      health: '/health',
      youtube: {
        analyze: 'POST /api/youtube/analyze',
        testProxy: 'GET /api/youtube/test-proxy',
        health: 'GET /api/youtube/health'
      },
      youtubeV2: {
        analyze: 'POST /api/youtube/v2/analyze',
        download: 'POST /api/youtube/v2/download',
        getUrl: 'POST /api/youtube/v2/get-url',
        health: 'GET /api/youtube/v2/health'
      },
      download: {
        request: 'POST /api/download',
        status: 'GET /api/download/status/:taskId',
        tasks: 'GET /api/download/tasks',
        health: 'GET /api/download/health'
      }
    },
    features: [
      'YouTube 비디오 분석 (yt-dlp 없이)',
      'Smartproxy 프록시 연동',
      '고품질 다운로드 URL 제공',
      '실시간 작업 상태 추적',
      'Rate Limiting 및 보안 강화'
    ],
    timestamp: new Date().toISOString()
  });
});

// 404 에러 핸들러
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      message: '요청한 엔드포인트를 찾을 수 없습니다',
      code: 'NOT_FOUND',
      path: req.path,
      method: req.method
    },
    timestamp: new Date().toISOString()
  });
});

// 전역 에러 핸들러
app.use((error, req, res, next) => {
  console.error('❌ 전역 에러:', error);
  
  // 에러 타입별 처리
  let statusCode = 500;
  let errorCode = 'INTERNAL_SERVER_ERROR';
  let message = '서버 내부 오류가 발생했습니다';
  
  if (error.name === 'ValidationError') {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    message = '입력 데이터가 유효하지 않습니다';
  } else if (error.name === 'UnauthorizedError') {
    statusCode = 401;
    errorCode = 'UNAUTHORIZED';
    message = '인증이 필요합니다';
  } else if (error.code === 'LIMIT_FILE_SIZE') {
    statusCode = 413;
    errorCode = 'FILE_TOO_LARGE';
    message = '파일 크기가 너무 큽니다';
  }
  
  res.status(statusCode).json({
    success: false,
    error: {
      message,
      code: errorCode,
      ...(config.nodeEnv === 'development' && { 
        stack: error.stack,
        details: error.message 
      })
    },
    timestamp: new Date().toISOString()
  });
});

// 서버 시작
const server = app.listen(config.port, () => {
  console.log('🚀 HQMX 백엔드 서버 시작됨');
  console.log(`📍 포트: ${config.port}`);
  console.log(`🌍 환경: ${config.nodeEnv}`);
  console.log(`🔗 프록시: ${config.proxy.host}:${config.proxy.port}`);
  console.log(`⭐ CORS 허용: ${config.cors.origins.join(', ')}`);
  console.log('=====================================');
});

// 우아한 종료 처리
process.on('SIGTERM', async () => {
  console.log('📴 SIGTERM 신호 수신, 서버 종료 중...');
  
  server.close(async () => {
    console.log('✅ HTTP 서버 종료됨');
    
    // YouTube 서비스 정리
    try {
      const youtubeService = require('./services/youtubeService');
      await youtubeService.cleanup();
      console.log('✅ YouTube 서비스 정리 완료');
    } catch (error) {
      console.error('❌ YouTube 서비스 정리 실패:', error);
    }
    
    // YouTube 브라우저 서비스 정리
    try {
      const youtubeBrowserService = require('./services/youtubeBrowserService');
      await youtubeBrowserService.cleanup();
      console.log('✅ YouTube 브라우저 서비스 정리 완료');
    } catch (error) {
      console.error('❌ YouTube 브라우저 서비스 정리 실패:', error);
    }
    
    console.log('👋 서버 종료 완료');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('📴 SIGINT 신호 수신, 서버 종료 중...');
  
  server.close(async () => {
    console.log('✅ HTTP 서버 종료됨');
    
    // YouTube 서비스 정리
    try {
      const youtubeService = require('./services/youtubeService');
      await youtubeService.cleanup();
      console.log('✅ YouTube 서비스 정리 완료');
    } catch (error) {
      console.error('❌ YouTube 서비스 정리 실패:', error);
    }
    
    // YouTube 브라우저 서비스 정리
    try {
      const youtubeBrowserService = require('./services/youtubeBrowserService');
      await youtubeBrowserService.cleanup();
      console.log('✅ YouTube 브라우저 서비스 정리 완료');
    } catch (error) {
      console.error('❌ YouTube 브라우저 서비스 정리 실패:', error);
    }
    
    console.log('👋 서버 종료 완료');
    process.exit(0);
  });
});

// 예상치 못한 에러 처리
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  // 서버는 계속 실행하되 로그만 남김
});

module.exports = app;