const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');

const youtubeService = require('../services/youtubeService');
const youtubeSimpleService = require('../services/youtubeSimpleService');
const youtubeStreamService = require('../services/youtubeStreamService');
const proxyService = require('../services/proxyService');
const config = require('../config');
const { isValidYouTubeUrl, createErrorResponse } = require('../utils/helpers');

// YouTube API 전용 rate limit (더 엄격)
const youtubeRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 30, // 최대 30 요청
  message: {
    success: false,
    error: {
      message: '너무 많은 요청입니다. 잠시 후 다시 시도해주세요.',
      code: 'RATE_LIMIT_EXCEEDED'
    }
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * POST /api/youtube/analyze
 * YouTube 비디오 분석
 */
router.post('/analyze', youtubeRateLimit, async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { url } = req.body;
    
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
    
    console.log(`🎯 YouTube 분석 요청: ${url}`);
    console.log(`📍 클라이언트 IP: ${req.ip || req.connection.remoteAddress}`);
    
    // 비디오 ID 추출
    const videoIdMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
    if (!videoIdMatch) {
      throw new Error('유효하지 않은 YouTube URL입니다');
    }
    const videoId = videoIdMatch[1];

    // YouTube 분석 실행 (실제 스트림 URL 포함)
    let result;
    try {
      // 1차 시도: Stream Service (실제 다운로드 URL 포함)
      console.log('🎬 실제 스트림 URL 추출 중...');
      console.log('🔥 youtubeStreamService 타입:', typeof youtubeStreamService);
      console.log('🔥 youtubeStreamService.getStreamUrls 존재:', typeof youtubeStreamService.getStreamUrls);
      const streamData = await youtubeStreamService.getStreamUrls(videoId);
      
      console.log('✅ StreamData 받음:', {
        title: streamData.title,
        author: streamData.author,
        formatsLength: streamData.formats ? streamData.formats.length : 'undefined',
        firstFormat: streamData.formats && streamData.formats[0] ? Object.keys(streamData.formats[0]) : 'none'
      });
      
      // 프론트엔드가 기대하는 형태로 데이터 변환
      const videoFormats = streamData.formats.filter(f => f.hasVideo);
      const audioFormats = streamData.formats.filter(f => f.hasAudio && !f.hasVideo);
      
      result = {
        success: true,
        data: {
          id: streamData.videoId,
          title: streamData.title,
          author: streamData.author,
          description: '',
          thumbnail: streamData.thumbnail,
          duration: parseInt(streamData.lengthSeconds) || 0,
          webpage_url: url,
          formats: streamData.formats, // 전체 포맷 (다운로드 API용)
          video_formats: videoFormats, // 프론트엔드용 비디오 포맷
          audio_formats: audioFormats, // 프론트엔드용 오디오 포맷
          availableQualities: streamData.availableQualities,
          source: 'stream_service'
        }
      };
      
      console.log(`✅ 실제 스트림 정보 추출 성공: ${streamData.formats.length}개 포맷`);
      
    } catch (streamError) {
      console.error(`❌ Stream Service 실패: ${streamError.message}`);
      console.error('❌ Stream Error 상세:', streamError);
      console.warn(`Stream Service 실패, 기본 분석으로 대체: ${streamError.message}`);
      
      try {
        // 2차 시도: Simple Service (기본 정보만)
        result = await youtubeSimpleService.analyzeVideo(url);
        console.log('⚠️ 기본 분석 성공 (실제 다운로드 URL 없음)');
      } catch (simpleError) {
        console.error(`기본 분석도 실패: ${simpleError.message}`);
        throw streamError; // 원본 에러를 throw
      }
    }
    
    const processingTime = Date.now() - startTime;
    console.log(`✅ 분석 완료 (${processingTime}ms): ${result.data.title}`);
    
    // 처리 시간이 10초를 초과하는 경우 경고
    if (processingTime > config.youtube.timeout) {
      console.warn(`⚠️ 분석 시간 초과: ${processingTime}ms (제한: ${config.youtube.timeout}ms)`);
    }
    
    // 응답에 처리 시간 추가
    result.processing_time = processingTime;
    result.processing_time_readable = `${(processingTime / 1000).toFixed(2)}초`;
    
    res.json(result);
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error(`❌ YouTube 분석 실패 (${processingTime}ms):`, error.message);
    
    // 에러 타입별 상태 코드 설정
    let statusCode = 500;
    let errorCode = 'ANALYSIS_FAILED';
    
    if (error.message.includes('유효하지 않은')) {
      statusCode = 400;
      errorCode = 'INVALID_URL';
    } else if (error.message.includes('시간 초과') || error.message.includes('timeout')) {
      statusCode = 408;
      errorCode = 'REQUEST_TIMEOUT';
    } else if (error.message.includes('차단') || error.message.includes('blocked')) {
      statusCode = 429;
      errorCode = 'BLOCKED';
    }
    
    res.status(statusCode).json(
      createErrorResponse(
        `분석 실패: ${error.message}`,
        errorCode,
        statusCode
      )
    );
  }
});

/**
 * GET /api/youtube/test-proxy
 * Smartproxy 연결 테스트
 */
router.get('/test-proxy', async (req, res) => {
  try {
    console.log('🧪 Smartproxy 연결 테스트 요청');
    
    const testResult = await proxyService.testConnection();
    
    if (testResult.success) {
      console.log('✅ Smartproxy 테스트 성공');
      res.json(testResult);
    } else {
      console.log('❌ Smartproxy 테스트 실패');
      res.status(503).json(testResult);
    }
    
  } catch (error) {
    console.error('❌ 프록시 테스트 에러:', error);
    
    res.status(500).json(
      createErrorResponse(
        `프록시 테스트 실패: ${error.message}`,
        'PROXY_TEST_FAILED',
        500
      )
    );
  }
});

/**
 * GET /api/youtube/proxy-ip
 * 현재 프록시 IP 확인
 */
router.get('/proxy-ip', async (req, res) => {
  try {
    console.log('🌐 프록시 IP 조회 요청');
    
    const ipInfo = await proxyService.getIpInfo();
    
    res.json({
      success: true,
      data: ipInfo,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ IP 조회 실패:', error);
    
    res.status(500).json(
      createErrorResponse(
        `IP 조회 실패: ${error.message}`,
        'IP_LOOKUP_FAILED',
        500
      )
    );
  }
});

/**
 * POST /api/youtube/direct-download
 * YouTube 비디오 직접 다운로드 (스트림 URL 사용)
 */
router.post('/direct-download', youtubeRateLimit, async (req, res) => {
  try {
    const { videoId, quality = '360p' } = req.body;
    
    if (!videoId) {
      return res.status(400).json(
        createErrorResponse('videoId가 필요합니다', 'MISSING_VIDEO_ID', 400)
      );
    }
    
    console.log(`🎯 직접 다운로드 요청: ${videoId}, 품질: ${quality}`);
    
    // 1. 먼저 스트림 정보 가져오기
    const streamData = await youtubeStreamService.getStreamUrls(videoId);
    
    if (!streamData.formats || streamData.formats.length === 0) {
      throw new Error('다운로드 가능한 포맷을 찾을 수 없습니다');
    }
    
    // 2. 요청된 품질에 맞는 포맷 찾기
    const targetHeight = parseInt(quality.replace('p', ''));
    let selectedFormat = streamData.formats.find(f => 
      f.height === targetHeight && f.hasVideo && f.hasAudio
    );
    
    // 통합 포맷이 없으면 비디오만 포맷 선택
    if (!selectedFormat) {
      selectedFormat = streamData.formats.find(f => 
        f.height === targetHeight && f.hasVideo
      );
    }
    
    // 정확한 품질이 없으면 가장 가까운 품질 선택
    if (!selectedFormat) {
      selectedFormat = streamData.formats
        .filter(f => f.hasVideo && f.height)
        .reduce((prev, curr) => 
          Math.abs(curr.height - targetHeight) < Math.abs(prev.height - targetHeight) ? curr : prev
        );
    }
    
    if (!selectedFormat || !selectedFormat.url) {
      throw new Error('적절한 다운로드 URL을 찾을 수 없습니다');
    }
    
    console.log(`🔗 선택된 포맷: ${selectedFormat.formatId} (${selectedFormat.qualityLabel})`);
    console.log(`📁 파일 크기: ${selectedFormat.contentLength} 바이트`);
    
    // 3. 파일명 생성
    const safeTitle = streamData.title.replace(/[^a-zA-Z0-9가-힣\s\-_]/g, '');
    const filename = `${safeTitle}_${videoId}.${selectedFormat.container}`;
    
    // 4. 응답 헤더 설정
    res.setHeader('Content-Type', selectedFormat.mimeType || 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    if (selectedFormat.contentLength) {
      res.setHeader('Content-Length', selectedFormat.contentLength);
    }
    res.setHeader('Transfer-Encoding', 'chunked');
    
    console.log(`📦 직접 다운로드 시작: ${filename}`);
    
    // 5. 프록시를 통해 스트림 다운로드
    const downloadResponse = await proxyService.get(selectedFormat.url, {
      timeout: 300000, // 5분 타임아웃
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': `https://www.youtube.com/watch?v=${videoId}`
      }
    });
    
    // 6. 스트림을 클라이언트로 파이프
    downloadResponse.data.pipe(res);
    
    downloadResponse.data.on('end', () => {
      console.log(`✅ 직접 다운로드 완료: ${filename}`);
    });
    
    downloadResponse.data.on('error', (error) => {
      console.error(`❌ 스트림 오류:`, error);
      if (!res.headersSent) {
        res.status(500).json(
          createErrorResponse('스트림 다운로드 중 오류가 발생했습니다', 'STREAM_ERROR', 500)
        );
      }
    });
    
    // 클라이언트 연결 해제 처리
    req.on('close', () => {
      console.log('🔌 클라이언트 연결 해제, 스트림 중단');
      if (downloadResponse.data && downloadResponse.data.destroy) {
        downloadResponse.data.destroy();
      }
    });
    
  } catch (error) {
    console.error('❌ 직접 다운로드 실패:', error);
    
    if (!res.headersSent) {
      res.status(500).json(
        createErrorResponse(
          `직접 다운로드 실패: ${error.message}`,
          'DIRECT_DOWNLOAD_FAILED',
          500
        )
      );
    }
  }
});

/**
 * POST /api/youtube/download
 * YouTube 비디오 다운로드 (yt-dlp 사용)
 */
router.post('/download', youtubeRateLimit, async (req, res) => {
  const { spawn } = require('child_process');
  const path = require('path');
  
  try {
    const { videoId, quality = '360p', format = 'mp4' } = req.body;
    
    if (!videoId) {
      return res.status(400).json(
        createErrorResponse('videoId가 필요합니다', 'MISSING_VIDEO_ID', 400)
      );
    }
    
    console.log(`🎯 yt-dlp 다운로드 요청: ${videoId}, 품질: ${quality}`);
    
    // YouTube URL 구성
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    // 품질 설정 (360p 이하)
    const qualityFilter = `best[height<=${parseInt(quality.replace('p', ''))}]`;
    
    // yt-dlp 경로 (다양한 위치 시도)
    const possiblePaths = [
      '/home/ubuntu/.local/bin/yt-dlp', // EC2 설치 경로
      '/usr/local/bin/yt-dlp',
      '/usr/bin/yt-dlp', 
      'yt-dlp',
      '/Users/wonjunjang/Library/Python/3.11/bin/yt-dlp' // 로컬 테스트용
    ];
    
    let ytDlpPath = possiblePaths[0];
    
    // yt-dlp 명령어 인수 (모든 우회 옵션 사용)
    const args = [
      '-f', qualityFilter,
      '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      '--add-header', 'Accept-Language:en-US,en;q=0.9',
      '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      '--extractor-args', 'youtube:player_skip=configs;player_client=android,web',
      '--socket-timeout', '60',
      '--retries', '10',
      '--fragment-retries', '10',
      '--sleep-interval', '2',
      '--max-sleep-interval', '5',
      '--no-playlist',
      '--no-check-certificate',
      '--geo-bypass',
      '--ignore-errors',
      '--output', '-', // stdout으로 출력
      videoUrl
    ];
    
    console.log(`🚀 yt-dlp 실행: ${ytDlpPath} ${args.join(' ')}`);
    
    // 비디오 정보 먼저 가져오기 (제목, 길이 등)
    const infoArgs = [
      '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      '--add-header', 'Accept-Language:en-US,en;q=0.9',
      '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      '--extractor-args', 'youtube:player_skip=configs;player_client=android,web',
      '--socket-timeout', '60',
      '--retries', '10',
      '--sleep-interval', '2',
      '--no-check-certificate',
      '--geo-bypass',
      '--ignore-errors',
      '--print', 'title',
      '--print', 'uploader', 
      '--print', 'duration',
      videoUrl
    ];
    
    const infoProcess = spawn(ytDlpPath, infoArgs);
    let infoData = '';
    
    infoProcess.stdout.on('data', (data) => {
      infoData += data.toString();
    });
    
    await new Promise((resolve, reject) => {
      infoProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`정보 추출 실패: ${code}`));
        }
      });
      
      setTimeout(() => reject(new Error('정보 추출 시간 초과')), 120000); // 2분으로 연장
    });
    
    const [title = 'Video', uploader = 'Unknown', duration = '0'] = infoData.trim().split('\n');
    const filename = `${title.replace(/[^a-zA-Z0-9가-힣\s\-_]/g, '')}_${videoId}.${format}`;
    
    console.log(`📋 비디오 정보: ${title} by ${uploader} (${duration}s)`);
    
    // 실제 다운로드 프로세스 시작
    const dlProcess = spawn(ytDlpPath, args);
    
    // 응답 헤더 설정
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Transfer-Encoding', 'chunked');
    
    console.log(`📦 스트리밍 시작: ${filename}`);
    
    // stdout을 직접 응답으로 파이프
    dlProcess.stdout.pipe(res);
    
    // 에러 처리
    dlProcess.stderr.on('data', (data) => {
      console.error(`❌ yt-dlp 에러: ${data}`);
    });
    
    dlProcess.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ 다운로드 완료: ${filename}`);
      } else {
        console.error(`❌ yt-dlp 프로세스 종료: ${code}`);
        if (!res.headersSent) {
          res.status(500).json(
            createErrorResponse('다운로드 중 오류가 발생했습니다', 'DOWNLOAD_PROCESS_ERROR', 500)
          );
        }
      }
    });
    
    dlProcess.on('error', (error) => {
      console.error(`❌ yt-dlp 프로세스 오류:`, error);
      if (!res.headersSent) {
        res.status(500).json(
          createErrorResponse(`yt-dlp 실행 실패: ${error.message}`, 'YTDLP_EXECUTION_ERROR', 500)
        );
      }
    });
    
    // 클라이언트 연결 해제 처리
    req.on('close', () => {
      console.log('🔌 클라이언트 연결 해제, yt-dlp 프로세스 종료');
      dlProcess.kill('SIGTERM');
    });
    
  } catch (error) {
    console.error('❌ 다운로드 실패:', error);
    
    if (!res.headersSent) {
      res.status(500).json(
        createErrorResponse(
          `다운로드 실패: ${error.message}`,
          'DOWNLOAD_FAILED',
          500
        )
      );
    }
  }
});

/**
 * GET /api/youtube/health
 * YouTube 서비스 헬스체크
 */
router.get('/health', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      proxy: {
        host: config.proxy.host,
        port: config.proxy.port,
        username: config.proxy.username
      },
      config: {
        timeout: config.youtube.timeout,
        maxRetries: config.youtube.maxRetries,
        userAgent: config.youtube.userAgent.substring(0, 50) + '...'
      }
    };
    
    // 간단한 프록시 연결 테스트
    try {
      await proxyService.getIpInfo();
      health.proxy.status = 'connected';
    } catch (error) {
      health.proxy.status = 'disconnected';
      health.proxy.error = error.message;
      health.status = 'degraded';
    }
    
    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
    
  } catch (error) {
    console.error('❌ 헬스체크 실패:', error);
    
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * 에러 핸들러
 */
router.use((error, req, res, next) => {
  console.error('❌ YouTube 라우터 에러:', error);
  
  res.status(500).json(
    createErrorResponse(
      '서버 내부 오류가 발생했습니다',
      'INTERNAL_SERVER_ERROR',
      500
    )
  );
});

module.exports = router;