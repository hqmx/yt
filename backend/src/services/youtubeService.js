const { chromium } = require('playwright');
const proxyService = require('./proxyService');
const config = require('../config');
const { 
  extractVideoId, 
  isValidYouTubeUrl, 
  parseTimeToSeconds,
  formatFileSize,
  parseQuality,
  retry,
  delay,
  createErrorResponse,
  createSuccessResponse 
} = require('../utils/helpers');

class YouTubeService {
  constructor() {
    this.browser = null;
    this.context = null;
  }

  /**
   * 브라우저 초기화
   */
  async initBrowser() {
    if (this.browser) return;

    try {
      console.log('🚀 Playwright 브라우저 초기화 중...');
      
      const proxyConfig = proxyService.getPlaywrightProxyConfig();
      
      this.browser = await chromium.launch({
        headless: true,
        proxy: proxyConfig,
        timeout: 60000, // 브라우저 시작 시간 초과를 60초로 설정
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--disable-blink-features=AutomationControlled',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-extensions',
          '--no-first-run',
          '--proxy-bypass-list=<-loopback>'
        ]
      });

      this.context = await this.browser.newContext({
        userAgent: config.youtube.userAgent,
        viewport: { width: 1920, height: 1080 },
        locale: 'ko-KR',
        timezoneId: 'Asia/Seoul',
        permissions: [],
        extraHTTPHeaders: {
          'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8'
        }
      });

      // 봇 감지 방지 스크립트 추가
      await this.context.addInitScript(() => {
        // navigator.webdriver 제거
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
        });
        
        // plugins 배열에 가짜 플러그인 추가
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5],
        });
        
        // languages 속성 설정
        Object.defineProperty(navigator, 'languages', {
          get: () => ['ko-KR', 'ko', 'en-US', 'en'],
        });
      });

      console.log('✅ Playwright 브라우저 초기화 완료');
      
    } catch (error) {
      console.error('❌ 브라우저 초기화 실패:', error);
      throw new Error('브라우저 초기화 실패');
    }
  }

  /**
   * YouTube 비디오 분석 (메인 함수)
   */
  async analyzeVideo(url) {
    if (!isValidYouTubeUrl(url)) {
      throw new Error('유효하지 않은 YouTube URL입니다');
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      throw new Error('비디오 ID를 추출할 수 없습니다');
    }

    console.log(`🎯 YouTube 분석 시작: ${videoId}`);
    
    try {
      await this.initBrowser();
      
      // 다양한 방법으로 비디오 정보 수집 시도
      const result = await retry(
        () => this.extractVideoInfo(videoId),
        config.youtube.maxRetries,
        2000
      );

      console.log(`✅ 분석 완료: ${result.title}`);
      return createSuccessResponse(result);
      
    } catch (error) {
      console.error('❌ YouTube 분석 실패:', error);
      throw error;
    }
  }

  /**
   * 비디오 정보 추출
   */
  async extractVideoInfo(videoId) {
    const page = await this.context.newPage();
    
    try {
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      console.log(`📄 페이지 로딩: ${videoUrl}`);

      // 페이지 로드 (시간 제한을 30초로 증가)
      await page.goto(videoUrl, { 
        waitUntil: 'networkidle',
        timeout: 30000
      });

      // 기본 정보 대기
      await page.waitForSelector('#watch7-content, ytd-watch-flexy', { timeout: 10000 });
      
      // 페이지가 완전히 로드될 때까지 잠시 대기
      await delay(3000);

      // 비디오 정보 추출
      const videoInfo = await page.evaluate(() => {
        // 제목 추출
        const titleSelectors = [
          'h1.ytd-watch-metadata yt-formatted-string',
          'h1.title.style-scope.ytd-watch-metadata',
          '#watch7-headline h1',
          '.watch-main-col h1'
        ];
        
        let title = null;
        for (const selector of titleSelectors) {
          const element = document.querySelector(selector);
          if (element && element.textContent) {
            title = element.textContent.trim();
            break;
          }
        }

        // 썸네일 추출
        const thumbnailSelectors = [
          'video[src]',
          'img[src*="maxresdefault"]',
          'img[src*="hqdefault"]',
          'meta[property="og:image"]'
        ];
        
        let thumbnail = null;
        for (const selector of thumbnailSelectors) {
          const element = document.querySelector(selector);
          if (element) {
            if (element.tagName === 'META') {
              thumbnail = element.getAttribute('content');
            } else {
              thumbnail = element.src || element.getAttribute('src');
            }
            if (thumbnail && thumbnail.includes('youtube')) {
              break;
            }
          }
        }

        // 재생시간 추출
        const durationSelectors = [
          '.ytp-time-duration',
          'span.style-scope.ytd-thumbnail-overlay-time-status-renderer',
          'meta[itemprop="duration"]'
        ];
        
        let duration = null;
        for (const selector of durationSelectors) {
          const element = document.querySelector(selector);
          if (element) {
            if (element.tagName === 'META') {
              duration = element.getAttribute('content');
            } else {
              duration = element.textContent || element.innerText;
            }
            if (duration) {
              duration = duration.trim();
              break;
            }
          }
        }

        // ytInitialPlayerResponse에서 정보 추출 시도
        let playerData = null;
        try {
          const scripts = Array.from(document.scripts);
          for (const script of scripts) {
            const content = script.innerHTML;
            if (content.includes('ytInitialPlayerResponse')) {
              const match = content.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
              if (match) {
                playerData = JSON.parse(match[1]);
                break;
              }
            }
          }
        } catch (e) {
          console.warn('ytInitialPlayerResponse 파싱 실패:', e);
        }

        // playerData에서 추가 정보 추출
        if (playerData) {
          const videoDetails = playerData.videoDetails;
          if (videoDetails) {
            if (!title) title = videoDetails.title;
            if (!duration) duration = videoDetails.lengthSeconds;
            if (!thumbnail) {
              const thumbnails = videoDetails.thumbnail?.thumbnails;
              if (thumbnails && thumbnails.length > 0) {
                thumbnail = thumbnails[thumbnails.length - 1].url;
              }
            }
          }
        }

        return {
          title,
          thumbnail,
          duration,
          playerData: playerData ? {
            videoDetails: playerData.videoDetails,
            streamingData: playerData.streamingData
          } : null,
          url: window.location.href
        };
      });

      // 추출된 정보 처리
      const processedInfo = this.processVideoInfo(videoInfo, videoId);
      
      return processedInfo;
      
    } catch (error) {
      console.error('❌ 비디오 정보 추출 실패:', error);
      throw new Error(`비디오 정보 추출 실패: ${error.message}`);
    } finally {
      await page.close();
    }
  }

  /**
   * 추출된 비디오 정보 처리
   */
  processVideoInfo(rawInfo, videoId) {
    const processed = {
      id: videoId,
      title: rawInfo.title || '제목을 가져올 수 없습니다',
      thumbnail: this.getBestThumbnail(rawInfo.thumbnail, videoId),
      duration: this.parseDuration(rawInfo.duration),
      webpage_url: rawInfo.url,
      formats: [],
      availableQualities: []
    };

    // playerData에서 포맷 정보 추출
    if (rawInfo.playerData?.streamingData) {
      processed.formats = this.extractFormats(rawInfo.playerData.streamingData);
      processed.availableQualities = this.getAvailableQualities(processed.formats);
    } else {
      // 기본 품질 옵션 제공
      processed.availableQualities = [
        { label: '720p', formatId: 'default-720p' },
        { label: '480p', formatId: 'default-480p' },
        { label: '360p', formatId: 'default-360p' }
      ];
    }

    return processed;
  }

  /**
   * 최고 품질 썸네일 선택
   */
  getBestThumbnail(thumbnail, videoId) {
    if (thumbnail && thumbnail.includes('youtube')) {
      return thumbnail;
    }
    
    // 기본 썸네일 URL 생성
    const qualities = ['maxresdefault', 'hqdefault', 'mqdefault', 'default'];
    
    for (const quality of qualities) {
      return `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
    }
    
    return null;
  }

  /**
   * 재생시간 파싱
   */
  parseDuration(durationStr) {
    if (!durationStr) return 0;
    
    // 숫자만 있는 경우 (초 단위)
    if (/^\d+$/.test(durationStr)) {
      return parseInt(durationStr);
    }
    
    // "MM:SS" 또는 "HH:MM:SS" 형식
    return parseTimeToSeconds(durationStr);
  }

  /**
   * streaming data에서 포맷 정보 추출
   */
  extractFormats(streamingData) {
    const formats = [];
    
    // adaptiveFormats (분리된 오디오/비디오)
    if (streamingData.adaptiveFormats) {
      for (const format of streamingData.adaptiveFormats) {
        formats.push({
          formatId: format.itag,
          url: format.url,
          ext: this.getExtensionFromMime(format.mimeType),
          quality: format.qualityLabel || format.quality,
          resolution: format.qualityLabel,
          filesize: format.contentLength ? parseInt(format.contentLength) : null,
          hasVideo: format.mimeType.includes('video'),
          hasAudio: format.mimeType.includes('audio'),
          bitrate: format.bitrate,
          fps: format.fps,
          width: format.width,
          height: format.height,
          acodec: format.mimeType.includes('audio') ? 'aac' : null,
          vcodec: format.mimeType.includes('video') ? 'avc1' : null
        });
      }
    }
    
    // formats (통합된 오디오+비디오)
    if (streamingData.formats) {
      for (const format of streamingData.formats) {
        formats.push({
          formatId: format.itag,
          url: format.url,
          ext: this.getExtensionFromMime(format.mimeType),
          quality: format.qualityLabel || format.quality,
          resolution: format.qualityLabel,
          filesize: format.contentLength ? parseInt(format.contentLength) : null,
          hasVideo: true,
          hasAudio: true,
          bitrate: format.bitrate,
          fps: format.fps,
          width: format.width,
          height: format.height
        });
      }
    }
    
    return formats;
  }

  /**
   * MIME 타입에서 확장자 추출
   */
  getExtensionFromMime(mimeType) {
    if (!mimeType) return 'mp4';
    
    if (mimeType.includes('mp4')) return 'mp4';
    if (mimeType.includes('webm')) return 'webm';
    if (mimeType.includes('3gpp')) return '3gp';
    
    return 'mp4';
  }

  /**
   * 사용 가능한 품질 옵션 추출
   */
  getAvailableQualities(formats) {
    const qualities = [];
    const seenQualities = new Set();
    
    // 비디오 포맷에서 품질 추출
    const videoFormats = formats.filter(f => f.hasVideo && f.height);
    
    // 높은 품질부터 정렬
    videoFormats.sort((a, b) => (b.height || 0) - (a.height || 0));
    
    for (const format of videoFormats) {
      const quality = format.resolution || `${format.height}p`;
      
      if (!seenQualities.has(quality)) {
        qualities.push({
          label: quality,
          formatId: format.formatId,
          height: format.height,
          hasAudio: format.hasAudio
        });
        seenQualities.add(quality);
      }
    }
    
    // 기본 품질이 없는 경우
    if (qualities.length === 0) {
      qualities.push(
        { label: '720p', formatId: 'default-720p', height: 720 },
        { label: '480p', formatId: 'default-480p', height: 480 },
        { label: '360p', formatId: 'default-360p', height: 360 }
      );
    }
    
    return qualities;
  }

  /**
   * 브라우저 정리
   */
  async cleanup() {
    try {
      if (this.context) {
        await this.context.close();
        this.context = null;
      }
      
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
      
      console.log('✅ Playwright 브라우저 정리 완료');
    } catch (error) {
      console.error('❌ 브라우저 정리 실패:', error);
    }
  }
}

module.exports = new YouTubeService();