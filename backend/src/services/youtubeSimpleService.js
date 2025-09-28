const proxyService = require('./proxyService');
const config = require('../config');
const { 
  extractVideoId, 
  isValidYouTubeUrl, 
  parseTimeToSeconds,
  createErrorResponse,
  createSuccessResponse,
  retry
} = require('../utils/helpers');

class YouTubeSimpleService {
  constructor() {
    console.log('📺 YouTube Simple Service 초기화됨');
  }

  /**
   * YouTube 비디오 분석 (간단한 스크래핑 방식)
   */
  async analyzeVideo(url) {
    if (!isValidYouTubeUrl(url)) {
      throw new Error('유효하지 않은 YouTube URL입니다');
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      throw new Error('비디오 ID를 추출할 수 없습니다');
    }

    console.log(`🎯 YouTube Simple 분석 시작: ${videoId}`);
    
    try {
      // 여러 방법으로 비디오 정보 수집 시도
      let result = null;
      
      // 방법 1: oEmbed API 사용
      try {
        result = await this.extractViaOEmbed(videoId, url);
        if (result) {
          console.log('✅ oEmbed API로 정보 추출 성공');
          return createSuccessResponse(result);
        }
      } catch (error) {
        console.warn('oEmbed API 실패:', error.message);
      }

      // 방법 2: YouTube 페이지 직접 요청 (HTML 파싱)
      try {
        result = await this.extractViaHtml(videoId, url);
        if (result) {
          console.log('✅ HTML 파싱으로 정보 추출 성공');
          return createSuccessResponse(result);
        }
      } catch (error) {
        console.warn('HTML 파싱 실패:', error.message);
      }

      // 방법 3: 기본 정보만 제공
      result = this.createBasicVideoInfo(videoId, url);
      console.log('✅ 기본 정보로 응답 생성');
      return createSuccessResponse(result);
      
    } catch (error) {
      console.error('❌ YouTube Simple 분석 실패:', error);
      throw error;
    }
  }

  /**
   * YouTube oEmbed API를 통한 정보 추출
   */
  async extractViaOEmbed(videoId, url) {
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
      
      const response = await proxyService.get(oembedUrl, {
        timeout: 10000
      });

      if (response.status === 200 && response.data) {
        const data = response.data;
        
        return {
          id: videoId,
          title: data.title || '제목을 가져올 수 없습니다',
          thumbnail: data.thumbnail_url || this.getDefaultThumbnail(videoId),
          duration: 0, // oEmbed에서는 duration 제공 안함
          webpage_url: url,
          author: data.author_name || 'Unknown',
          width: data.width || 1920,
          height: data.height || 1080,
          formats: [],
          availableQualities: this.getDefaultQualities(),
          source: 'oembed'
        };
      }
      
      return null;
    } catch (error) {
      console.warn('oEmbed 추출 실패:', error.message);
      return null;
    }
  }

  /**
   * YouTube 페이지 HTML을 직접 파싱하여 정보 추출
   */
  async extractViaHtml(videoId, url) {
    try {
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      
      const response = await proxyService.get(videoUrl, {
        timeout: 15000,
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.8,en-US;q=0.5,en;q=0.3',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });

      if (response.status === 200 && response.data) {
        const html = response.data;
        
        // 메타데이터 추출
        const title = this.extractFromHtml(html, [
          /<meta name="title" content="([^"]+)"/,
          /<meta property="og:title" content="([^"]+)"/,
          /<title>([^<]+)<\/title>/
        ]);

        const description = this.extractFromHtml(html, [
          /<meta name="description" content="([^"]+)"/,
          /<meta property="og:description" content="([^"]+)"/
        ]);

        const thumbnail = this.extractFromHtml(html, [
          /<meta property="og:image" content="([^"]+)"/,
          /<meta name="thumbnail" content="([^"]+)"/
        ]) || this.getDefaultThumbnail(videoId);

        const duration = this.extractFromHtml(html, [
          /"lengthSeconds":"(\d+)"/,
          /<meta itemprop="duration" content="[^"]*PT(\d+)M(\d+)S"/
        ]);

        const author = this.extractFromHtml(html, [
          /<meta name="author" content="([^"]+)"/,
          /"ownerChannelName":"([^"]+)"/
        ]);

        return {
          id: videoId,
          title: title ? title.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&') : '제목을 가져올 수 없습니다',
          description: description || '',
          thumbnail: thumbnail,
          duration: duration ? parseInt(duration) : 0,
          webpage_url: url,
          author: author || 'Unknown',
          formats: [],
          availableQualities: this.getDefaultQualities(),
          source: 'html_parsing'
        };
      }
      
      return null;
    } catch (error) {
      console.warn('HTML 파싱 추출 실패:', error.message);
      return null;
    }
  }

  /**
   * HTML에서 정규식을 사용하여 데이터 추출
   */
  extractFromHtml(html, patterns) {
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    return null;
  }

  /**
   * 기본 비디오 정보 생성
   */
  createBasicVideoInfo(videoId, url) {
    return {
      id: videoId,
      title: 'YouTube 비디오',
      thumbnail: this.getDefaultThumbnail(videoId),
      duration: 0,
      webpage_url: url,
      author: 'YouTube',
      formats: [],
      availableQualities: this.getDefaultQualities(),
      source: 'basic'
    };
  }

  /**
   * 기본 썸네일 URL 생성
   */
  getDefaultThumbnail(videoId) {
    return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  }

  /**
   * 기본 품질 옵션 제공
   */
  getDefaultQualities() {
    return [
      { label: '720p', formatId: 'default-720p', height: 720 },
      { label: '480p', formatId: 'default-480p', height: 480 },
      { label: '360p', formatId: 'default-360p', height: 360 },
      { label: '240p', formatId: 'default-240p', height: 240 }
    ];
  }

  /**
   * 서비스 상태 반환
   */
  getServiceStatus() {
    return {
      status: 'ready',
      methods: ['oembed', 'html_parsing', 'basic_fallback'],
      proxy_enabled: true
    };
  }
}

module.exports = new YouTubeSimpleService();