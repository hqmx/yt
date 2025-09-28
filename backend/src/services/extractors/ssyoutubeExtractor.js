const axios = require('axios');
const proxyPoolManager = require('../proxyPoolManager');

class SSYouTubeExtractor {
  constructor() {
    console.log('🟦 SSYouTubeExtractor 초기화됨');
    this.baseUrl = 'https://ssyoutube.com';
    this.timeout = 30000;
  }

  /**
   * SSYouTube.com을 통해 YouTube 다운로드 URL 추출
   */
  async extractDownloadUrl(videoUrl, quality = '720p') {
    console.log(`🟦 SSYouTube 추출 시작: ${videoUrl} (${quality})`);
    
    try {
      // 1. 최적 프록시 선택 (EC2에서는 필수)
      const bestProxies = proxyPoolManager.getBestProxies(3);
      if (bestProxies.length === 0) {
        throw new Error('사용 가능한 프록시가 없습니다');
      }

      const proxy = bestProxies[0];
      console.log(`🌐 프록시 사용: ${proxy.id}`);

      // 2. YouTube URL을 SSYouTube URL로 변환
      const ssyoutubeUrl = this.convertToSSYouTubeUrl(videoUrl);
      console.log(`🔗 SSYouTube URL: ${ssyoutubeUrl}`);

      // 3. SSYouTube 페이지에 접근하여 다운로드 링크 추출 (프록시 사용)
      const response = await axios.get(ssyoutubeUrl, {
        proxy: proxy.axiosProxyConfig,
        timeout: this.timeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        }
      });

      // 4. HTML에서 다운로드 링크 추출
      const downloadUrl = this.extractDownloadUrlFromHTML(response.data, quality);
      
      if (!downloadUrl) {
        throw new Error(`${quality} 품질의 다운로드 링크를 찾을 수 없습니다`);
      }

      console.log(`✅ SSYouTube 추출 성공: ${quality}`);
      
      return {
        success: true,
        downloadUrl: downloadUrl,
        quality: quality,
        service: 'SSYouTube.com',
        method: 'html_parsing'
      };

    } catch (error) {
      console.error(`❌ SSYouTube 추출 실패: ${error.message}`);
      
      return {
        success: false,
        error: error.message,
        service: 'SSYouTube.com'
      };
    }
  }

  /**
   * YouTube URL을 SSYouTube URL로 변환
   */
  convertToSSYouTubeUrl(youtubeUrl) {
    // YouTube URL 패턴 처리
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/
    ];

    for (const pattern of patterns) {
      const match = youtubeUrl.match(pattern);
      if (match) {
        const videoId = match[1];
        return `https://ssyoutube.com/watch?v=${videoId}`;
      }
    }

    throw new Error('유효하지 않은 YouTube URL입니다');
  }

  /**
   * HTML에서 다운로드 URL 추출
   */
  extractDownloadUrlFromHTML(html, targetQuality) {
    console.log('🔍 HTML에서 다운로드 링크 추출 중...');
    
    try {
      // Google Video URL 패턴 검색 (실제 스트리밍 URL)
      const googleVideoPattern = /https:\/\/[^"]*\.googlevideo\.com\/[^"]*/g;
      const googleVideoMatches = html.match(googleVideoPattern);

      if (googleVideoMatches && googleVideoMatches.length > 0) {
        console.log(`✅ ${googleVideoMatches.length}개 Google Video URL 발견`);
        
        // 품질별 우선순위
        const qualityPriority = {
          '1080p': ['1080', '720', '480', '360'],
          '720p': ['720', '1080', '480', '360'], 
          '480p': ['480', '720', '360', '1080'],
          '360p': ['360', '480', '720', '1080']
        };

        const priorities = qualityPriority[targetQuality] || qualityPriority['720p'];
        
        // 품질별로 URL 검색
        for (const quality of priorities) {
          for (const url of googleVideoMatches) {
            // URL에서 품질 정보 확인 (itag, height 등)
            if (this.isQualityMatch(url, quality)) {
              console.log(`🎯 ${quality}p 품질 URL 발견`);
              return url;
            }
          }
        }

        // 품질별 매칭이 실패한 경우 첫 번째 Google Video URL 사용
        console.log('🔄 품질별 매칭 실패, 첫 번째 Google Video URL 사용');
        return googleVideoMatches[0];
      }

      // Google Video URL이 없으면 일반 다운로드 링크 검색
      const downloadLinkPattern = /https:\/\/[^"]*\.(mp4|webm|mkv)[^"]*/gi;
      const downloadMatches = html.match(downloadLinkPattern);

      if (downloadMatches && downloadMatches.length > 0) {
        console.log(`✅ ${downloadMatches.length}개 다운로드 링크 발견`);
        return downloadMatches[0];
      }

      throw new Error('HTML에서 다운로드 링크를 찾을 수 없습니다');

    } catch (error) {
      console.error(`❌ HTML 파싱 실패: ${error.message}`);
      throw error;
    }
  }

  /**
   * URL이 지정된 품질과 일치하는지 확인
   */
  isQualityMatch(url, quality) {
    const qualityNum = parseInt(quality);
    
    // itag 기반 품질 판단 (YouTube 표준)
    const qualityItags = {
      360: ['18', '34', '35'],
      480: ['59', '78', '135'],
      720: ['22', '136', '298'],
      1080: ['37', '137', '299']
    };

    const itagMatch = url.match(/itag=(\d+)/);
    if (itagMatch) {
      const itag = itagMatch[1];
      return qualityItags[qualityNum] && qualityItags[qualityNum].includes(itag);
    }

    // height 파라미터 기반 판단
    const heightMatch = url.match(/height=(\d+)/);
    if (heightMatch) {
      const height = parseInt(heightMatch[1]);
      return Math.abs(height - qualityNum) <= 50; // 50px 허용 오차
    }

    // URL에 품질 정보가 포함된 경우
    return url.includes(quality) || url.includes(qualityNum.toString());
  }

  /**
   * 서비스 상태 체크
   */
  async checkServiceStatus() {
    try {
      const proxy = proxyPoolManager.getBestProxies(1)[0];
      if (!proxy) {
        return { available: false, reason: 'No proxy available' };
      }

      const response = await axios.get('https://ssyoutube.com', {
        proxy: proxy.axiosProxyConfig,
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      return {
        available: response.status === 200,
        responseTime: response.headers['x-response-time'] || 'Unknown',
        service: 'SSYouTube.com'
      };

    } catch (error) {
      return {
        available: false,
        reason: error.message,
        service: 'SSYouTube.com'
      };
    }
  }
}

module.exports = new SSYouTubeExtractor();