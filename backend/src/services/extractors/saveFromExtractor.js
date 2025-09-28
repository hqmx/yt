const axios = require('axios');
const proxyPoolManager = require('../proxyPoolManager');

class SaveFromExtractor {
  constructor() {
    console.log('🔗 SaveFromExtractor 초기화됨');
    this.baseUrl = 'https://savefrom.net';
    this.timeout = 30000;
  }

  /**
   * SaveFrom.net을 통해 YouTube 다운로드 URL 추출
   */
  async extractDownloadUrl(videoUrl, quality = '720p') {
    console.log(`🎯 SaveFrom 추출 시작: ${videoUrl} (${quality})`);
    
    try {
      // 1. 최적 프록시 선택
      const bestProxies = proxyPoolManager.getBestProxies(3);
      if (bestProxies.length === 0) {
        throw new Error('사용 가능한 프록시가 없습니다');
      }

      const proxy = bestProxies[0];
      console.log(`🌐 프록시 사용: ${proxy.id}`);

      // 2. SaveFrom.net에 분석 요청 제출
      const analysisResult = await this.submitForAnalysis(videoUrl, proxy);
      
      if (!analysisResult.success) {
        throw new Error('SaveFrom.net 분석 실패');
      }

      // 3. 원하는 품질의 다운로드 URL 추출
      const downloadUrl = this.extractQualityUrl(analysisResult.links, quality);
      
      if (!downloadUrl) {
        throw new Error(`${quality} 품질의 다운로드 링크를 찾을 수 없습니다`);
      }

      console.log(`✅ SaveFrom 추출 성공: ${quality}`);
      
      return {
        success: true,
        downloadUrl: downloadUrl,
        quality: quality,
        service: 'SaveFrom.net',
        fileSize: analysisResult.fileSize || 'Unknown'
      };

    } catch (error) {
      console.error(`❌ SaveFrom 추출 실패: ${error.message}`);
      
      return {
        success: false,
        error: error.message,
        service: 'SaveFrom.net'
      };
    }
  }

  /**
   * SaveFrom.net에 YouTube URL 분석 요청
   */
  async submitForAnalysis(videoUrl, proxy) {
    try {
      console.log('📤 SaveFrom.net 분석 요청 제출...');
      
      // SaveFrom.net의 분석 API 호출
      const response = await axios.post(`${this.baseUrl}/process`, {
        url: videoUrl,
        lang: 'en'
      }, {
        proxy: proxy.axiosProxyConfig,
        timeout: this.timeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'Content-Type': 'application/json',
          'Origin': this.baseUrl,
          'Referer': `${this.baseUrl}/`,
          'DNT': '1',
          'Connection': 'keep-alive',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-origin'
        }
      });

      if (response.data && response.data.links) {
        console.log(`✅ SaveFrom 분석 완료: ${Object.keys(response.data.links).length}개 링크 발견`);
        
        return {
          success: true,
          links: response.data.links,
          title: response.data.title || '',
          duration: response.data.duration || '',
          fileSize: response.data.filesize || null
        };
      }

      throw new Error('SaveFrom.net 응답 형식 오류');

    } catch (error) {
      console.error(`❌ SaveFrom 분석 요청 실패: ${error.message}`);
      
      // 프록시 성능 업데이트
      proxyPoolManager.updateProxyPerformance(proxy.id, {
        success: false
      });

      throw error;
    }
  }

  /**
   * 원하는 품질의 다운로드 URL 추출
   */
  extractQualityUrl(links, targetQuality) {
    console.log(`🔍 ${targetQuality} 품질 링크 검색 중...`);
    
    // 품질 우선순위 설정
    const qualityPriority = {
      '1080p': ['1080p', '720p', '480p', '360p'],
      '720p': ['720p', '1080p', '480p', '360p'],
      '480p': ['480p', '720p', '360p', '1080p'],
      '360p': ['360p', '480p', '720p', '1080p']
    };

    const priorities = qualityPriority[targetQuality] || qualityPriority['720p'];
    
    // 우선순위에 따라 링크 검색
    for (const quality of priorities) {
      for (const [key, link] of Object.entries(links)) {
        if (key.includes(quality) && link.url) {
          console.log(`✅ ${quality} 품질 링크 발견: ${key}`);
          return link.url;
        }
      }
    }

    // MP4 형식 우선으로 폴백
    for (const [key, link] of Object.entries(links)) {
      if (key.includes('mp4') && link.url) {
        console.log(`🔄 MP4 폴백 링크 사용: ${key}`);
        return link.url;
      }
    }

    // 첫 번째 사용 가능한 링크 사용
    for (const [key, link] of Object.entries(links)) {
      if (link.url) {
        console.log(`⚠️ 폴백 링크 사용: ${key}`);
        return link.url;
      }
    }

    return null;
  }

  /**
   * SaveFrom.net을 통한 직접 다운로드
   */
  async downloadViaSaveFrom(videoUrl, outputPath, quality = '720p') {
    try {
      console.log(`🚀 SaveFrom 직접 다운로드 시작: ${quality}`);

      // 1. 다운로드 URL 추출
      const extractResult = await this.extractDownloadUrl(videoUrl, quality);
      
      if (!extractResult.success) {
        throw new Error(`URL 추출 실패: ${extractResult.error}`);
      }

      // 2. ParallelDownloader를 사용하여 실제 다운로드
      const parallelDownloader = require('../parallelDownloader');
      
      const downloadResult = await parallelDownloader.downloadWithMultipleProxies(
        extractResult.downloadUrl,
        outputPath,
        { testProxies: false }
      );

      console.log(`🎉 SaveFrom 다운로드 완료: ${outputPath}`);
      
      return {
        success: true,
        filePath: outputPath,
        quality: quality,
        service: 'SaveFrom.net',
        downloadStats: downloadResult
      };

    } catch (error) {
      console.error(`❌ SaveFrom 다운로드 실패: ${error.message}`);
      throw error;
    }
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

      const response = await axios.get(this.baseUrl, {
        proxy: proxy.axiosProxyConfig,
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      return {
        available: response.status === 200,
        responseTime: response.headers['x-response-time'] || 'Unknown',
        service: 'SaveFrom.net'
      };

    } catch (error) {
      return {
        available: false,
        reason: error.message,
        service: 'SaveFrom.net'
      };
    }
  }
}

module.exports = new SaveFromExtractor();