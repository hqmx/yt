const express = require('express');
const router = express.Router();
const path = require('path');
const youtubeBrowserService = require('../services/youtubeBrowserService');
const proxyPoolManager = require('../services/proxyPoolManager');
const speedTestService = require('../services/speedTestService');
const parallelDownloader = require('../services/parallelDownloader');
const competitorIntegrationService = require('../services/competitorIntegrationService');
const { extractVideoId, isValidYouTubeUrl } = require('../utils/helpers');

/**
 * YouTube 비디오 분석 API (다중 프록시)
 * POST /api/youtube/v4/analyze
 */
router.post('/analyze', async (req, res) => {
  console.log('🔥 YouTube v4 다중 프록시 분석 API 호출됨');
  
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL이 필요합니다'
      });
    }

    if (!isValidYouTubeUrl(url)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 YouTube URL입니다'
      });
    }

    console.log(`📥 다중 프록시 분석 요청 URL: ${url}`);
    
    // 프록시 풀 상태 확인
    const proxyStatus = proxyPoolManager.getStatus();
    console.log(`📊 프록시 풀 상태: ${proxyStatus.activeProxies}개 활성 프록시`);
    
    // YouTube 비디오 분석
    const analysisResult = await youtubeBrowserService.analyze(url);
    
    console.log(`✅ 다중 프록시 분석 완료: ${analysisResult.title}`);
    
    res.json({
      success: true,
      data: {
        videoId: analysisResult.videoId,
        title: analysisResult.title,
        author: analysisResult.author,
        duration: analysisResult.lengthSeconds,
        thumbnail: analysisResult.thumbnail,
        availableFormats: analysisResult.qualityOptions,
        proxyStats: {
          activeProxies: proxyStatus.activeProxies,
          totalRequests: proxyStatus.totalRequests,
          avgLatency: proxyStatus.averageLatency,
          avgThroughput: proxyStatus.averageThroughput
        }
      }
    });
    
  } catch (error) {
    console.error('❌ 다중 프록시 분석 실패:', error);
    res.status(500).json({
      success: false,
      error: error.message || '다중 프록시 분석 중 오류가 발생했습니다'
    });
  }
});

/**
 * 프록시 속도 테스트 API
 * POST /api/youtube/v4/test-proxies
 */
router.post('/test-proxies', async (req, res) => {
  console.log('🏁 프록시 속도 테스트 API 호출됨');
  
  try {
    const { testSize = 'medium', findFastest = false } = req.body;
    
    let testResults;
    
    if (findFastest) {
      console.log('🚀 최고 속도 프록시 검색 중...');
      testResults = await speedTestService.findFastestProxy(3);
    } else {
      console.log('📊 전체 프록시 속도 테스트 중...');
      testResults = await speedTestService.testAllProxies(testSize);
    }
    
    res.json({
      success: true,
      data: testResults
    });
    
  } catch (error) {
    console.error('❌ 프록시 속도 테스트 실패:', error);
    res.status(500).json({
      success: false,
      error: error.message || '프록시 속도 테스트 중 오류가 발생했습니다'
    });
  }
});

/**
 * YouTube 병렬 다운로드 API
 * POST /api/youtube/v4/download
 */
router.post('/download', async (req, res) => {
  console.log('🔥 YouTube v4 병렬 다운로드 API 호출됨');
  
  try {
    const { 
      url, 
      quality = '720p', 
      format = 'mp4',
      useParallel = true,
      testProxies = false,
      maxChunks = 10
    } = req.body;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL이 필요합니다'
      });
    }

    if (!isValidYouTubeUrl(url)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 YouTube URL입니다'
      });
    }

    console.log(`📥 병렬 다운로드 요청: ${url}`);
    console.log(`⚙️ 설정: ${quality}, ${format}, 병렬: ${useParallel}, 청크: ${maxChunks}`);
    
    // 1. 비디오 분석
    console.log('🎬 비디오 분석 중...');
    const analysisResult = await youtubeBrowserService.analyze(url);
    
    // 2. 다운로드 URL 추출
    const downloadInfo = youtubeBrowserService.getDownloadUrl(
      analysisResult.formats, 
      quality, 
      format === 'mp3'
    );
    
    console.log(`🎯 다운로드 URL 생성 완료: ${downloadInfo.type}`);
    
    // 3. 파일명 생성
    const sanitizedTitle = analysisResult.title
      .replace(/[^\w\s-]/gi, '')
      .replace(/\s+/g, '_')
      .slice(0, 100);
    
    const extension = format === 'mp3' ? 'mp3' : downloadInfo.format.container || 'mp4';
    const filename = `${sanitizedTitle}.${extension}`;
    
    // Content-Type 설정
    const contentTypes = {
      'mp4': 'video/mp4',
      'webm': 'video/webm', 
      'mp3': 'audio/mpeg',
      'm4a': 'audio/mp4'
    };
    
    const contentType = contentTypes[extension] || 'application/octet-stream';
    
    console.log(`📁 파일명: ${filename}`);
    console.log(`🎵 Content-Type: ${contentType}`);
    
    if (!useParallel) {
      // 4a. 단일 프록시 다운로드 (기존 방식)
      console.log('📄 단일 프록시 다운로드 시작...');
      
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
      
      const bestProxy = proxyPoolManager.getBestProxies(1)[0];
      
      try {
        const axios = require('axios');
        
        const downloadResponse = await axios.get(downloadInfo.url, {
          httpsAgent: bestProxy.httpsAgent,
          responseType: 'stream',
          timeout: 60000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': `https://www.youtube.com/watch?v=${analysisResult.videoId}`
          }
        });
        
        if (downloadResponse.headers['content-length']) {
          res.setHeader('Content-Length', downloadResponse.headers['content-length']);
        }
        
        downloadResponse.data.pipe(res);
        
        downloadResponse.data.on('end', () => {
          console.log('✅ 단일 다운로드 완료');
        });
        
        downloadResponse.data.on('error', (streamError) => {
          console.error('❌ 단일 스트림 오류:', streamError);
          if (!res.headersSent) {
            res.status(500).json({
              success: false,
              error: '다운로드 스트림 오류'
            });
          }
        });
        
      } catch (streamError) {
        console.error('❌ 단일 스트림 생성 실패:', streamError);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: '다운로드 스트림을 생성할 수 없습니다'
          });
        }
      }
      
    } else {
      // 4b. 병렬 다운로드
      console.log('⚡ 병렬 다운로드 시작...');
      
      try {
        // 임시 파일 경로
        const tempDir = path.join(__dirname, '../temp');
        const tempPath = path.join(tempDir, `${Date.now()}_${filename}`);
        
        // 병렬 다운로드 실행
        const downloadResult = await parallelDownloader.downloadWithMultipleProxies(
          downloadInfo.url,
          tempPath,
          {
            testProxies: testProxies,
            onProgress: (progress) => {
              console.log(`📊 다운로드 진행률: ${progress.progressPercent}% (${progress.completedChunks}/${progress.totalChunks})`);
            }
          }
        );
        
        console.log('✅ 병렬 다운로드 완료, 파일 전송 중...');
        
        // 파일을 클라이언트에 전송
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
        res.setHeader('Content-Length', downloadResult.fileSize);
        
        // 파일 스트림 전송
        const fs = require('fs');
        const fileStream = fs.createReadStream(tempPath);
        
        fileStream.pipe(res);
        
        fileStream.on('end', () => {
          console.log('📤 파일 전송 완료');
          
          // 임시 파일 삭제
          fs.unlink(tempPath, (err) => {
            if (err) console.error('임시 파일 삭제 실패:', err);
            else console.log('🗑️ 임시 파일 삭제됨');
          });
        });
        
        fileStream.on('error', (fileError) => {
          console.error('❌ 파일 스트림 오류:', fileError);
          if (!res.headersSent) {
            res.status(500).json({
              success: false,
              error: '파일 전송 오류'
            });
          }
        });
        
      } catch (parallelError) {
        console.error('❌ 병렬 다운로드 실패:', parallelError);
        
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: '병렬 다운로드 실패: ' + parallelError.message
          });
        }
      }
    }
    
  } catch (error) {
    console.error('❌ 다운로드 실패:', error);
    
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: error.message || '다운로드 중 오류가 발생했습니다'
      });
    }
  }
});

/**
 * 프록시 상태 조회 API
 * GET /api/youtube/v4/proxy-status
 */
router.get('/proxy-status', (req, res) => {
  try {
    const status = proxyPoolManager.getStatus();
    
    res.json({
      success: true,
      data: status
    });
    
  } catch (error) {
    console.error('❌ 프록시 상태 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 활성 다운로드 상태 조회 API
 * GET /api/youtube/v4/downloads
 */
router.get('/downloads', (req, res) => {
  try {
    const activeDownloads = parallelDownloader.getAllActiveDownloads();
    
    res.json({
      success: true,
      data: {
        activeDownloads: activeDownloads,
        count: activeDownloads.length
      }
    });
    
  } catch (error) {
    console.error('❌ 다운로드 상태 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * 프록시 없이 브라우저 연결 테스트 API (진단용)
 * POST /api/youtube/v4/test-no-proxy
 */
router.post('/test-no-proxy', async (req, res) => {
  console.log('🧪 프록시 없는 브라우저 연결 테스트 API 호출됨');
  
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL이 필요합니다'
      });
    }

    if (!isValidYouTubeUrl(url)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 YouTube URL입니다'
      });
    }

    console.log(`🧪 프록시 없는 브라우저 테스트 URL: ${url}`);
    
    // 프록시 없이 브라우저 테스트
    const testResult = await youtubeBrowserService.testWithoutProxy(url);
    
    res.json({
      success: testResult.success,
      data: testResult
    });
    
  } catch (error) {
    console.error('❌ 프록시 없는 브라우저 테스트 실패:', error);
    res.status(500).json({
      success: false,
      error: error.message || '프록시 없는 브라우저 테스트 중 오류가 발생했습니다'
    });
  }
});

/**
 * 프록시 없이 브라우저 기반 직접 다운로드 API
 * POST /api/youtube/v4/download-no-proxy
 */
router.post('/download-no-proxy', async (req, res) => {
  console.log('🎬 프록시 없는 브라우저 기반 직접 다운로드 API 호출됨');
  
  try {
    const { url, outputDir } = req.body;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL이 필요합니다'
      });
    }

    if (!isValidYouTubeUrl(url)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 YouTube URL입니다'
      });
    }

    console.log(`🎬 프록시 없는 직접 다운로드 URL: ${url}`);
    console.log(`📁 출력 디렉토리: ${outputDir || '/Users/wonjunjang/Downloads'}`);
    
    // 프록시 없이 브라우저 기반 직접 다운로드
    const downloadResult = await youtubeBrowserService.downloadDirectlyWithBrowser(url, outputDir);
    
    res.json({
      success: true,
      message: '브라우저 기반 직접 다운로드 성공',
      data: downloadResult
    });
    
  } catch (error) {
    console.error('❌ 프록시 없는 직접 다운로드 실패:', error);
    res.status(500).json({
      success: false,
      error: error.message || '브라우저 기반 직접 다운로드 중 오류가 발생했습니다'
    });
  }
});

/**
 * 프록시 없이 YouTube 분석 API (빠른 버전)
 * POST /api/youtube/v4/analyze-no-proxy  
 */
router.post('/analyze-no-proxy', async (req, res) => {
  console.log('🔍 프록시 없는 YouTube 분석 API 호출됨');
  
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL이 필요합니다'
      });
    }

    if (!isValidYouTubeUrl(url)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 YouTube URL입니다'
      });
    }

    console.log(`🔍 프록시 없는 분석 URL: ${url}`);
    
    // 프록시 없이 분석
    const analysisResult = await youtubeBrowserService.analyzeWithoutProxy(url);
    
    res.json({
      success: true,
      data: {
        videoId: analysisResult.videoId,
        title: analysisResult.title,
        author: analysisResult.author,
        duration: analysisResult.lengthSeconds,
        thumbnail: analysisResult.thumbnail,
        formats: analysisResult.formats,
        analysisTime: analysisResult.analysisTime
      }
    });
    
  } catch (error) {
    console.error('❌ 프록시 없는 분석 실패:', error);
    res.status(500).json({
      success: false,
      error: error.message || '프록시 없는 분석 중 오류가 발생했습니다'
    });
  }
});

/**
 * 네트워크 요청 가로채기로 실시간 다운로드 API
 * POST /api/youtube/v4/download-intercept
 */
router.post('/download-intercept', async (req, res) => {
  console.log('🕵️ 네트워크 요청 가로채기 다운로드 API 호출됨');
  
  try {
    const { url, outputDir } = req.body;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL이 필요합니다'
      });
    }

    if (!isValidYouTubeUrl(url)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 YouTube URL입니다'
      });
    }

    console.log(`🕵️ 네트워크 가로채기 다운로드 URL: ${url}`);
    console.log(`📁 출력 디렉토리: ${outputDir || '/Users/wonjunjang/Downloads'}`);
    
    // 네트워크 요청 가로채기로 실시간 다운로드
    const downloadResult = await youtubeBrowserService.interceptVideoUrlsWithBrowser(url, outputDir);
    
    res.json({
      success: true,
      message: '네트워크 가로채기 다운로드 성공',
      data: downloadResult
    });
    
  } catch (error) {
    console.error('❌ 네트워크 가로채기 다운로드 실패:', error);
    res.status(500).json({
      success: false,
      error: error.message || '네트워크 가로채기 다운로드 중 오류가 발생했습니다'
    });
  }
});

/**
 * 경쟁사 서비스를 통한 YouTube 다운로드 URL 추출 API
 * POST /api/youtube/v4/extract-via-competitors
 */
router.post('/extract-via-competitors', async (req, res) => {
  console.log('🏢 경쟁사 통합 URL 추출 API 호출됨');
  
  try {
    const { url, quality = '720p', preferredService = null, timeout = 45000 } = req.body;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL이 필요합니다'
      });
    }

    if (!isValidYouTubeUrl(url)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 YouTube URL입니다'
      });
    }

    console.log(`🏢 경쟁사 URL 추출: ${url} (${quality})`);
    if (preferredService) {
      console.log(`🎯 선호 서비스: ${preferredService}`);
    }
    
    // 경쟁사 서비스를 통한 URL 추출
    const extractResult = await competitorIntegrationService.extractYouTubeDownloadUrl(url, {
      quality,
      preferredService,
      timeout
    });
    
    console.log(`✅ 경쟁사 URL 추출 완료: ${extractResult.service}`);
    
    res.json({
      success: true,
      message: '경쟁사 URL 추출 성공',
      data: {
        downloadUrl: extractResult.downloadUrl,
        quality: extractResult.quality || quality,
        service: extractResult.service,
        extractionTime: extractResult.extractionTime,
        fileSize: extractResult.fileSize || 'Unknown'
      }
    });
    
  } catch (error) {
    console.error('❌ 경쟁사 URL 추출 실패:', error);
    res.status(500).json({
      success: false,
      error: error.message || '경쟁사 URL 추출 중 오류가 발생했습니다'
    });
  }
});

/**
 * 경쟁사 서비스를 통한 전체 YouTube 다운로드 API
 * POST /api/youtube/v4/download-via-competitors
 */
router.post('/download-via-competitors', async (req, res) => {
  console.log('🏢 경쟁사 통합 다운로드 API 호출됨');
  
  try {
    const { 
      url, 
      quality = '720p', 
      outputDir = '/Users/wonjunjang/Downloads',
      preferredService = null,
      timeout = 45000 
    } = req.body;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL이 필요합니다'
      });
    }

    if (!isValidYouTubeUrl(url)) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 YouTube URL입니다'
      });
    }

    console.log(`🏢 경쟁사 통합 다운로드: ${url} (${quality})`);
    console.log(`📁 출력 디렉토리: ${outputDir}`);
    
    // 비디오 ID 추출하여 파일명 생성
    const videoId = extractVideoId(url);
    const fileName = `${videoId}_${quality}.mp4`;
    const outputPath = path.join(outputDir, fileName);
    
    // 경쟁사 서비스를 통한 전체 다운로드
    const downloadResult = await competitorIntegrationService.downloadViaCompetitors(url, outputPath, {
      quality,
      preferredService,
      timeout,
      onProgress: (progress) => {
        // TODO: WebSocket으로 실시간 진행률 전송 (향후 구현)
        console.log(`📊 진행률: ${progress.progressPercent}% (${progress.completedChunks}/${progress.totalChunks})`);
      }
    });
    
    console.log(`🎉 경쟁사 통합 다운로드 완료: ${outputPath}`);
    
    res.json({
      success: true,
      message: '경쟁사 통합 다운로드 성공',
      data: {
        filePath: downloadResult.filePath,
        fileName: fileName,
        quality: downloadResult.quality,
        extractionService: downloadResult.extractionService,
        extractionTime: downloadResult.extractionTime,
        downloadStats: {
          fileSize: downloadResult.downloadStats.fileSize,
          totalTime: downloadResult.totalTime,
          avgThroughput: downloadResult.downloadStats.avgThroughput,
          chunksUsed: downloadResult.downloadStats.chunksUsed,
          proxiesUsed: downloadResult.downloadStats.proxiesUsed
        }
      }
    });
    
  } catch (error) {
    console.error('❌ 경쟁사 통합 다운로드 실패:', error);
    res.status(500).json({
      success: false,
      error: error.message || '경쟁사 통합 다운로드 중 오류가 발생했습니다'
    });
  }
});

/**
 * 경쟁사 서비스 상태 체크 API
 * GET /api/youtube/v4/competitors-status
 */
router.get('/competitors-status', async (req, res) => {
  console.log('📊 경쟁사 서비스 상태 체크 API 호출됨');
  
  try {
    const statusReport = await competitorIntegrationService.getServiceStatus();
    
    res.json({
      success: true,
      message: '경쟁사 서비스 상태 체크 완료',
      data: statusReport
    });
    
  } catch (error) {
    console.error('❌ 경쟁사 서비스 상태 체크 실패:', error);
    res.status(500).json({
      success: false,
      error: error.message || '경쟁사 서비스 상태 체크 중 오류가 발생했습니다'
    });
  }
});

/**
 * 헬스체크 API
 */
router.get('/health', (req, res) => {
  const proxyStatus = proxyPoolManager.getStatus();
  
  res.json({
    success: true,
    message: 'HQMX YouTube API v4 (다중 프록시 + 병렬 다운로드) 정상 작동 중',
    timestamp: new Date().toISOString(),
    proxyPool: {
      active: proxyStatus.activeProxies,
      total: proxyStatus.totalProxies,
      avgLatency: proxyStatus.averageLatency,
      avgThroughput: proxyStatus.averageThroughput
    }
  });
});

module.exports = router;