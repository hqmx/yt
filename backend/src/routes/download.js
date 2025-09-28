const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');

const downloadService = require('../services/downloadService');
const youtubeService = require('../services/youtubeService');
const youtubeSimpleService = require('../services/youtubeSimpleService');
const config = require('../config');
const { isValidYouTubeUrl, createErrorResponse } = require('../utils/helpers');

// 다운로드 API 전용 rate limit
const downloadRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 20, // 최대 20 다운로드 요청
  message: {
    success: false,
    error: {
      message: '다운로드 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
      code: 'DOWNLOAD_RATE_LIMIT_EXCEEDED'
    }
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * POST /api/download
 * 다운로드 요청 처리
 */
router.post('/', downloadRateLimit, async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { 
      url, 
      mediaType = 'video',
      formatType = 'mp4',
      quality = '720p',
      useClientIP = false 
    } = req.body;
    
    // 입력 검증
    if (!url) {
      return res.status(400).json(
        createErrorResponse('URL이 필요합니다', 'MISSING_URL', 400)
      );
    }
    
    if (!isValidYouTubeUrl(url)) {
      return res.status(400).json(
        createErrorResponse('유효하지 않은 YouTube URL입니다', 'INVALID_URL', 400)
      );
    }
    
    // 포맷 검증
    if (!config.download.allowedFormats.includes(formatType)) {
      return res.status(400).json(
        createErrorResponse(
          `지원하지 않는 포맷입니다: ${formatType}`,
          'UNSUPPORTED_FORMAT',
          400
        )
      );
    }
    
    console.log(`📥 다운로드 요청: ${url}`);
    console.log(`📋 옵션: ${mediaType} ${formatType} ${quality}`);
    console.log(`📍 클라이언트 IP: ${req.ip || req.connection.remoteAddress}`);
    
    // 다운로드 요청 처리 (downloadService에서 자체적으로 분석 처리)
    console.log('📋 실제 스트림 URL 생성 중...');
    const downloadResult = await downloadService.requestDownload({
      url,
      mediaType,
      formatType,
      quality
    });
    
    const processingTime = Date.now() - startTime;
    console.log(`✅ 다운로드 준비 완료 (${processingTime}ms): ${downloadResult.data.task_id}`);
    
    // 처리 시간이 30초를 초과하는 경우 경고
    if (processingTime > config.download.timeout) {
      console.warn(`⚠️ 다운로드 준비 시간 초과: ${processingTime}ms (제한: ${config.download.timeout}ms)`);
    }
    
    // 응답에 처리 시간 추가
    downloadResult.processing_time = processingTime;
    downloadResult.processing_time_readable = `${(processingTime / 1000).toFixed(2)}초`;
    
    res.json(downloadResult);
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error(`❌ 다운로드 요청 실패 (${processingTime}ms):`, error.message);
    
    // 에러 타입별 상태 코드 설정
    let statusCode = 500;
    let errorCode = 'DOWNLOAD_REQUEST_FAILED';
    
    if (error.message.includes('유효하지 않은')) {
      statusCode = 400;
      errorCode = 'INVALID_REQUEST';
    } else if (error.message.includes('시간 초과') || error.message.includes('timeout')) {
      statusCode = 408;
      errorCode = 'REQUEST_TIMEOUT';
    } else if (error.message.includes('차단') || error.message.includes('blocked')) {
      statusCode = 429;
      errorCode = 'BLOCKED';
    } else if (error.message.includes('찾을 수 없습니다')) {
      statusCode = 404;
      errorCode = 'NOT_FOUND';
    }
    
    res.status(statusCode).json(
      createErrorResponse(
        `다운로드 요청 실패: ${error.message}`,
        errorCode,
        statusCode
      )
    );
  }
});

/**
 * GET /api/download/status/:taskId
 * 다운로드 상태 확인
 */
router.get('/status/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    
    if (!taskId) {
      return res.status(400).json(
        createErrorResponse('작업 ID가 필요합니다', 'MISSING_TASK_ID', 400)
      );
    }
    
    console.log(`📊 다운로드 상태 확인: ${taskId}`);
    
    const statusResult = downloadService.getTaskStatus(taskId);
    
    if (!statusResult.success) {
      return res.status(statusResult.statusCode || 404).json(statusResult);
    }
    
    res.json(statusResult);
    
  } catch (error) {
    console.error('❌ 상태 확인 실패:', error);
    
    res.status(500).json(
      createErrorResponse(
        `상태 확인 실패: ${error.message}`,
        'STATUS_CHECK_FAILED',
        500
      )
    );
  }
});

/**
 * GET /api/download/tasks
 * 활성 다운로드 작업 목록
 */
router.get('/tasks', async (req, res) => {
  try {
    console.log('📋 활성 작업 목록 요청');
    
    const tasks = downloadService.getActiveTasks();
    
    res.json({
      success: true,
      data: {
        active_tasks: tasks.length,
        tasks: tasks.map(task => ({
          id: task.id,
          url: task.url,
          mediaType: task.mediaType,
          formatType: task.formatType,
          quality: task.quality,
          status: task.status,
          createdAt: task.createdAt,
          updatedAt: task.updatedAt
        }))
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ 작업 목록 조회 실패:', error);
    
    res.status(500).json(
      createErrorResponse(
        `작업 목록 조회 실패: ${error.message}`,
        'TASK_LIST_FAILED',
        500
      )
    );
  }
});

/**
 * GET /api/download/health
 * 다운로드 서비스 헬스체크
 */
router.get('/health', async (req, res) => {
  try {
    const serviceStatus = downloadService.getServiceStatus();
    
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: serviceStatus,
      limits: {
        maxFileSize: serviceStatus.max_file_size,
        timeout: `${config.download.timeout / 1000}초`,
        allowedFormats: config.download.allowedFormats
      }
    };
    
    res.json(health);
    
  } catch (error) {
    console.error('❌ 다운로드 헬스체크 실패:', error);
    
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * DELETE /api/download/cleanup
 * 완료된 작업 정리 (관리자용)
 */
router.delete('/cleanup', async (req, res) => {
  try {
    console.log('🗑️ 작업 정리 요청');
    
    downloadService.cleanupCompletedTasks();
    
    res.json({
      success: true,
      message: '완료된 작업이 정리되었습니다',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ 작업 정리 실패:', error);
    
    res.status(500).json(
      createErrorResponse(
        `작업 정리 실패: ${error.message}`,
        'CLEANUP_FAILED',
        500
      )
    );
  }
});

/**
 * GET /api/download/stream-progress/:taskId
 * 다운로드 진행 상황 스트림 (프론트엔드 호환성)
 */
router.get('/stream-progress/:taskId', (req, res) => {
  const { taskId } = req.params;
  
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  
  // 기본 진행 상황 전송
  const sendProgress = (progress, message) => {
    res.write(`data: ${JSON.stringify({ progress, message })}\n\n`);
  };
  
  // 즉시 완료 상태 전송 (실제 다운로드는 클라이언트에서)
  sendProgress(100, '다운로드 준비 완료');
  
  // 연결 유지
  const keepAlive = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 30000);
  
  req.on('close', () => {
    clearInterval(keepAlive);
  });
});

/**
 * GET /api/download/get-file/:taskId
 * 파일 다운로드 (프론트엔드 호환성)
 */
router.get('/get-file/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    
    // 작업 상태 확인
    const statusResult = downloadService.getTaskStatus(taskId);
    
    if (!statusResult.success) {
      return res.status(404).json(statusResult);
    }
    
    const task = statusResult.data;
    
    if (task.status !== 'ready') {
      return res.status(400).json(
        createErrorResponse('다운로드가 준비되지 않았습니다', 'DOWNLOAD_NOT_READY', 400)
      );
    }
    
    // 다운로드 URL로 리다이렉트
    res.redirect(task.download_url);
    
  } catch (error) {
    console.error('❌ 파일 다운로드 에러:', error);
    res.status(500).json(
      createErrorResponse('파일 다운로드 실패', 'DOWNLOAD_FAILED', 500)
    );
  }
});

/**
 * GET /api/download/check-status/:taskId
 * 작업 상태 확인 (프론트엔드 호환성)
 */
router.get('/check-status/:taskId', (req, res) => {
  const { taskId } = req.params;
  const result = downloadService.getTaskStatus(taskId);
  res.json(result);
});

/**
 * 에러 핸들러
 */
router.use((error, req, res, next) => {
  console.error('❌ 다운로드 라우터 에러:', error);
  
  res.status(500).json(
    createErrorResponse(
      '서버 내부 오류가 발생했습니다',
      'INTERNAL_SERVER_ERROR',
      500
    )
  );
});

module.exports = router;