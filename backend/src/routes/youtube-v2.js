const express = require('express');
const router = express.Router();
const youtubeExtractor = require('../services/youtubeExtractor');
const proxyService = require('../services/proxyService');
const { extractVideoId, isValidYouTubeUrl } = require('../utils/helpers');

/**
 * YouTube 비디오 분석 API
 * POST /api/youtube/analyze
 */
router.post('/analyze', async (req, res) => {
  console.log('🔥 YouTube 분석 API 호출됨');
  
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

    console.log(`📥 분석 요청 URL: ${url}`);
    
    // YouTube 비디오 분석
    const analysisResult = await youtubeExtractor.analyze(url);
    
    console.log(`✅ 분석 완료: ${analysisResult.title}`);
    
    res.json({
      success: true,
      data: {
        videoId: analysisResult.videoId,
        title: analysisResult.title,
        author: analysisResult.author,
        duration: analysisResult.lengthSeconds,
        thumbnail: analysisResult.thumbnail,
        availableFormats: analysisResult.qualityOptions
      }
    });
    
  } catch (error) {
    console.error('❌ 분석 실패:', error);
    res.status(500).json({
      success: false,
      error: error.message || '분석 중 오류가 발생했습니다'
    });
  }
});

/**
 * YouTube 비디오 다운로드 API
 * POST /api/youtube/download
 */
router.post('/download', async (req, res) => {
  console.log('🔥 YouTube 다운로드 API 호출됨');
  
  try {
    const { url, quality = '720p', format = 'mp4' } = req.body;
    
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

    console.log(`📥 다운로드 요청: ${url}, 품질: ${quality}, 포맷: ${format}`);
    
    // 비디오 분석
    const analysisResult = await youtubeExtractor.analyze(url);
    
    // 다운로드 URL 추출
    const downloadInfo = youtubeExtractor.getDownloadUrl(
      analysisResult.formats, 
      quality, 
      format === 'mp3'
    );
    
    console.log(`🎯 다운로드 URL 생성 완료: ${downloadInfo.type}`);
    
    // 파일명 생성
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
    
    // 다운로드 스트리밍 시작
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    
    try {
      console.log('🚀 스트림 다운로드 시작...');
      
      const downloadResponse = await proxyService.get(downloadInfo.url, {
        responseType: 'stream',
        timeout: 60000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': `https://www.youtube.com/watch?v=${analysisResult.videoId}`
        }
      });
      
      // Content-Length 헤더 전달 (있을 경우)
      if (downloadResponse.headers['content-length']) {
        res.setHeader('Content-Length', downloadResponse.headers['content-length']);
      }
      
      console.log('✅ 다운로드 스트림 연결됨');
      
      // 스트림 파이핑
      downloadResponse.data.pipe(res);
      
      downloadResponse.data.on('end', () => {
        console.log('✅ 다운로드 완료');
      });
      
      downloadResponse.data.on('error', (streamError) => {
        console.error('❌ 스트림 오류:', streamError);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: '다운로드 스트림 오류'
          });
        }
      });
      
    } catch (streamError) {
      console.error('❌ 스트림 생성 실패:', streamError);
      
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: '다운로드 스트림을 생성할 수 없습니다'
        });
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
 * 다운로드 URL 생성 API (직접 링크)
 * POST /api/youtube/get-url
 */
router.post('/get-url', async (req, res) => {
  console.log('🔥 다운로드 URL 생성 API 호출됨');
  
  try {
    const { url, quality = '720p', format = 'mp4' } = req.body;
    
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

    console.log(`📥 URL 생성 요청: ${url}, 품질: ${quality}`);
    
    // 비디오 분석
    const analysisResult = await youtubeExtractor.analyze(url);
    
    // 다운로드 URL 추출
    const downloadInfo = youtubeExtractor.getDownloadUrl(
      analysisResult.formats, 
      quality, 
      format === 'mp3'
    );
    
    // 파일명 생성
    const sanitizedTitle = analysisResult.title
      .replace(/[^\w\s-]/gi, '')
      .replace(/\s+/g, '_')
      .slice(0, 100);
    
    const extension = format === 'mp3' ? 'mp3' : downloadInfo.format.container || 'mp4';
    const filename = `${sanitizedTitle}.${extension}`;
    
    console.log(`✅ 다운로드 URL 생성 완료`);
    
    res.json({
      success: true,
      data: {
        downloadUrl: downloadInfo.url,
        filename: filename,
        format: downloadInfo.format,
        type: downloadInfo.type,
        requiresAudio: downloadInfo.requiresAudio || false
      }
    });
    
  } catch (error) {
    console.error('❌ URL 생성 실패:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'URL 생성 중 오류가 발생했습니다'
    });
  }
});

/**
 * 헬스체크 API
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'HQMX YouTube API v2 정상 작동 중',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;