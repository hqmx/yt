const express = require('express');
const router = express.Router();
const youtubeBrowserService = require('../services/youtubeBrowserService');
const proxyService = require('../services/proxyService');
const { extractVideoId, isValidYouTubeUrl } = require('../utils/helpers');

/**
 * YouTube 비디오 분석 API (브라우저 자동화)
 * POST /api/youtube/v3/analyze
 */
router.post('/analyze', async (req, res) => {
  console.log('🔥 YouTube v3 브라우저 분석 API 호출됨');
  
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

    console.log(`📥 브라우저 분석 요청 URL: ${url}`);
    
    // 브라우저 기반 YouTube 비디오 분석
    const analysisResult = await youtubeBrowserService.analyze(url);
    
    console.log(`✅ 브라우저 분석 완료: ${analysisResult.title}`);
    
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
    console.error('❌ 브라우저 분석 실패:', error);
    res.status(500).json({
      success: false,
      error: error.message || '브라우저 분석 중 오류가 발생했습니다'
    });
  }
});

/**
 * YouTube 비디오 다운로드 API (브라우저 자동화)
 * POST /api/youtube/v3/download
 */
router.post('/download', async (req, res) => {
  console.log('🔥 YouTube v3 브라우저 다운로드 API 호출됨');
  
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

    console.log(`📥 브라우저 다운로드 요청: ${url}, 품질: ${quality}, 포맷: ${format}`);
    
    // 브라우저 기반 비디오 분석
    const analysisResult = await youtubeBrowserService.analyze(url);
    
    // 다운로드 URL 추출
    const downloadInfo = youtubeBrowserService.getDownloadUrl(
      analysisResult.formats, 
      quality, 
      format === 'mp3'
    );
    
    console.log(`🎯 브라우저 다운로드 URL 생성 완료: ${downloadInfo.type}`);
    
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
    
    // 브라우저에서 추출한 URL을 사용하여 다운로드 스트리밍 시작
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    
    try {
      console.log('🚀 브라우저 추출 URL로 스트림 다운로드 시작...');
      console.log(`🔗 다운로드 URL: ${downloadInfo.url.substring(0, 100)}...`);
      
      const downloadResponse = await proxyService.get(downloadInfo.url, {
        responseType: 'stream',
        timeout: 60000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Referer': `https://www.youtube.com/watch?v=${analysisResult.videoId}`,
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Sec-Ch-Ua': '"Not A;Brand";v="99", "Chromium";v="131", "Google Chrome";v="131"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"Windows"',
          'Sec-Fetch-Dest': 'video',
          'Sec-Fetch-Mode': 'no-cors',
          'Sec-Fetch-Site': 'cross-site'
        }
      });
      
      // Content-Length 헤더 전달 (있을 경우)
      if (downloadResponse.headers['content-length']) {
        res.setHeader('Content-Length', downloadResponse.headers['content-length']);
        console.log(`📊 예상 파일 크기: ${Math.round(downloadResponse.headers['content-length'] / 1024 / 1024)}MB`);
      }
      
      console.log('✅ 브라우저 다운로드 스트림 연결됨');
      
      // 스트림 파이핑
      downloadResponse.data.pipe(res);
      
      downloadResponse.data.on('end', () => {
        console.log('✅ 브라우저 다운로드 완료');
      });
      
      downloadResponse.data.on('error', (streamError) => {
        console.error('❌ 브라우저 스트림 오류:', streamError);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: '브라우저 다운로드 스트림 오류'
          });
        }
      });
      
    } catch (streamError) {
      console.error('❌ 브라우저 스트림 생성 실패:', streamError);
      console.error('상태 코드:', streamError.response?.status);
      console.error('응답 헤더:', streamError.response?.headers);
      
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: '브라우저 다운로드 스트림을 생성할 수 없습니다',
          details: `HTTP ${streamError.response?.status || 'Unknown'}`
        });
      }
    }
    
  } catch (error) {
    console.error('❌ 브라우저 다운로드 실패:', error);
    
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: error.message || '브라우저 다운로드 중 오류가 발생했습니다'
      });
    }
  }
});

/**
 * 다운로드 URL 생성 API (브라우저 자동화)
 * POST /api/youtube/v3/get-url
 */
router.post('/get-url', async (req, res) => {
  console.log('🔥 YouTube v3 브라우저 URL 생성 API 호출됨');
  
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

    console.log(`📥 브라우저 URL 생성 요청: ${url}, 품질: ${quality}`);
    
    // 브라우저 기반 비디오 분석
    const analysisResult = await youtubeBrowserService.analyze(url);
    
    // 다운로드 URL 추출
    const downloadInfo = youtubeBrowserService.getDownloadUrl(
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
    
    console.log(`✅ 브라우저 다운로드 URL 생성 완료`);
    
    res.json({
      success: true,
      data: {
        downloadUrl: downloadInfo.url,
        filename: filename,
        format: downloadInfo.format,
        type: downloadInfo.type,
        requiresAudio: downloadInfo.requiresAudio || false,
        extractedByBrowser: true
      }
    });
    
  } catch (error) {
    console.error('❌ 브라우저 URL 생성 실패:', error);
    res.status(500).json({
      success: false,
      error: error.message || '브라우저 URL 생성 중 오류가 발생했습니다'
    });
  }
});

/**
 * 헬스체크 API
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'HQMX YouTube API v3 (브라우저 자동화) 정상 작동 중',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;